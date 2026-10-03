-- =============================================================================
-- Audited operations (PostgREST RPCs)
--
-- Each function is SECURITY DEFINER, re-checks permissions itself through
-- app.member_ids_with() / app.is_family_admin(), and writes one meaningful
-- audit entry. Callers are always identified by auth.uid(): the app calls these
-- with the signed-in user's JWT, never with the service role.
-- =============================================================================

-- First-run setup: the first person to set up the installation becomes the
-- family's Super Admin. Refused once any family exists.
create or replace function public.bootstrap_family(
  p_family_name text,
  p_display_name text,
  p_legal_name text default null,
  p_date_of_birth date default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_family_id uuid;
  v_member_id uuid;
begin
  perform app.begin_audited_operation();
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Not signed in.';
  end if;
  lock table public.families in exclusive mode;
  if exists (select 1 from public.families) then
    raise exception using errcode = '42501',
      message = 'This family is already set up. Ask the Super Admin for an invitation.';
  end if;

  insert into public.families (name) values (trim(p_family_name)) returning id into v_family_id;
  insert into public.family_members (
    family_id, user_id, role, status, display_name, legal_name, date_of_birth, email, activated_at, sort_order
  ) values (
    v_family_id, auth.uid(), 'super_admin', 'active', trim(p_display_name), nullif(trim(p_legal_name), ''),
    p_date_of_birth, lower(auth.jwt() ->> 'email'), now(), 0
  ) returning id into v_member_id;

  perform app.write_audit(v_family_id, 'family.create', v_member_id, 'family', v_family_id,
    format('Created the %s family with %s as Super Admin', trim(p_family_name), trim(p_display_name)));
  return v_member_id;
end;
$$;

-- Super Admin: invite a member profile to create their own login. Returns the
-- plaintext token exactly once; only its hash is stored.
create or replace function public.create_invitation(p_member_id uuid, p_email text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member public.family_members;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_email text := lower(trim(p_email));
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_member from public.family_members where id = p_member_id;
  if not found or not app.is_family_admin(v_member.family_id) then
    raise exception using errcode = '42501', message = 'Only the Super Admin can invite family members.';
  end if;
  if v_member.user_id is not null then
    raise exception using errcode = '22023', message = format('%s already has a login.', v_member.display_name);
  end if;
  if v_member.status = 'deactivated' then
    raise exception using errcode = '22023', message = 'Reactivate this profile before inviting them.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = '22023', message = 'Enter a valid email address.';
  end if;

  update public.invitations set revoked_at = now()
  where member_id = p_member_id and accepted_at is null and revoked_at is null;

  insert into public.invitations (family_id, member_id, email, token_hash, expires_at, created_by)
  values (v_member.family_id, p_member_id, v_email,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '7 days', auth.uid());

  update public.family_members
  set status = 'invited', email = v_email, invited_at = now()
  where id = p_member_id;

  perform app.write_audit(v_member.family_id, 'member.invite', p_member_id, 'family_member', p_member_id,
    format('Invited %s (%s)', v_member.display_name, v_email));
  return v_token;
end;
$$;

-- A newly signed-in user claims the profile they were invited to.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_invite public.invitations;
  v_member public.family_members;
begin
  perform app.begin_audited_operation();
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Sign in to accept your invitation.';
  end if;
  if exists (select 1 from public.family_members where user_id = auth.uid()) then
    raise exception using errcode = '22023', message = 'This login is already linked to a family member.';
  end if;

  select * into v_invite from public.invitations
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'This invitation is invalid or has expired.';
  end if;
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> v_invite.email then
    raise exception using errcode = '42501',
      message = 'This invitation was sent to a different email address.';
  end if;

  select * into v_member from public.family_members where id = v_invite.member_id for update;
  if v_member.user_id is not null or v_member.status = 'deactivated' then
    raise exception using errcode = '22023', message = 'This invitation can no longer be used.';
  end if;

  update public.family_members
  set user_id = auth.uid(), status = 'active', activated_at = now()
  where id = v_member.id;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;

  perform app.write_audit(v_member.family_id, 'member.activate', v_member.id, 'family_member', v_member.id,
    format('%s accepted their invitation', v_member.display_name));
  return v_member.id;
end;
$$;

-- Step 1 of an upload: register the document and get its private storage path.
-- p_member_id null means "Let AI identify" (Super Admin only).
create or replace function public.create_document_upload(
  p_member_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me public.family_members;
  v_target public.family_members;
  v_doc_id uuid := gen_random_uuid();
  v_family_id uuid;
  v_path text;
begin
  perform app.begin_audited_operation();
  v_me := app.require_active_member();

  if p_member_id is null then
    if not app.is_family_admin(v_me.family_id) then
      raise exception using errcode = '42501',
        message = 'Only the Super Admin can upload without choosing a family member.';
    end if;
    v_family_id := v_me.family_id;
  else
    if p_member_id not in (select app.member_ids_with('upload')) then
      raise exception using errcode = '42501',
        message = 'You do not have permission to upload documents for this person.';
    end if;
    select * into v_target from public.family_members where id = p_member_id;
    v_family_id := v_target.family_id;
  end if;

  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception using errcode = '22023',
      message = 'Unsupported file type. Upload a PDF or an image (JPEG, PNG, WebP, GIF).';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 20 * 1024 * 1024 then
    raise exception using errcode = '22023', message = 'Each file must be smaller than 20 MB.';
  end if;

  v_path := v_family_id::text || '/' || v_doc_id::text || '/original.' ||
    case p_mime_type
      when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
      when 'image/webp' then 'webp' else 'gif'
    end;

  insert into public.documents (
    id, family_id, member_id, uploaded_by, uploaded_by_name, status,
    original_filename, mime_type, size_bytes, storage_path
  ) values (
    v_doc_id, v_family_id, p_member_id, auth.uid(), v_me.display_name, 'processing',
    left(coalesce(nullif(trim(p_original_filename), ''), 'document'), 255), p_mime_type, p_size_bytes, v_path
  );

  perform app.write_audit(v_family_id, 'document.upload', p_member_id, 'document', v_doc_id,
    format('Uploaded %s %s', p_original_filename,
      coalesce('for ' || v_target.display_name, '(patient to be identified)')),
    null, null, jsonb_build_object('mime_type', p_mime_type, 'size_bytes', p_size_bytes));

  return jsonb_build_object('document_id', v_doc_id, 'storage_path', v_path);
end;
$$;

-- Step 2: store what extraction found (status -> ready_for_review). Identity
-- assessments are computed by the server for every member the uploader may
-- file for; confirm_document() relies on them.
create or replace function public.record_document_extraction(
  p_document_id uuid,
  p_extraction jsonb,
  p_identity_assessment jsonb,
  p_document_type text,
  p_title text,
  p_document_date date,
  p_provider text,
  p_category text,
  p_patient_name text,
  p_patient_date_of_birth date
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.can_manage_pending_document(v_doc) then
    raise exception using errcode = 'P0002', message = 'Document not found.';
  end if;
  if v_doc.status = 'filed' then
    raise exception using errcode = '55000', message = 'This document has already been filed.';
  end if;

  update public.documents set
    status = 'ready_for_review',
    extraction = p_extraction,
    identity_assessment = p_identity_assessment,
    document_type = p_document_type,
    title = p_title,
    document_date = p_document_date,
    provider = p_provider,
    category = p_category,
    extracted_patient_name = p_patient_name,
    extracted_date_of_birth = p_patient_date_of_birth,
    processing_error = null
  where id = v_doc.id;
end;
$$;

create or replace function public.mark_document_failed(p_document_id uuid, p_error text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.can_manage_pending_document(v_doc) then
    raise exception using errcode = 'P0002', message = 'Document not found.';
  end if;
  if v_doc.status = 'filed' then
    return;
  end if;
  update public.documents set status = 'failed', processing_error = left(p_error, 1000) where id = v_doc.id;
end;
$$;

-- Identity status for a member as recorded at extraction time.
create or replace function app.identity_status_for(p_doc public.documents, p_member_id uuid)
returns public.identity_status
language sql stable set search_path = ''
as $$
  select case p_doc.identity_assessment -> 'by_member' -> (p_member_id::text) ->> 'status'
           when 'match' then 'match'::public.identity_status
           when 'mismatch' then 'mismatch'::public.identity_status
           when 'uncertain' then 'uncertain'::public.identity_status
           else 'unchecked'::public.identity_status
         end
$$;

-- Step 3: the uploader confirms who the document belongs to and what it says.
-- Wrong-person protection: unless the identity check matched the chosen
-- member, p_identity_acknowledged must be true and the override is recorded.
create or replace function public.confirm_document(
  p_document_id uuid,
  p_member_id uuid,
  p_identity_acknowledged boolean,
  p_document_type text,
  p_title text,
  p_document_date date,
  p_provider text,
  p_category text,
  p_filing_path text[],
  p_results jsonb default '[]'
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_target public.family_members;
  v_identity public.identity_status;
  v_override boolean;
  v_result jsonb;
  v_biomarker uuid;
  v_count integer := 0;
  v_review integer := 0;
  v_label text;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();

  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.can_manage_pending_document(v_doc) then
    raise exception using errcode = 'P0002', message = 'Document not found.';
  end if;
  if v_doc.status not in ('ready_for_review', 'failed') then
    raise exception using errcode = '55000', message = 'This document is not waiting for confirmation.';
  end if;
  if p_member_id is null or p_member_id not in (select app.member_ids_with('upload')) then
    raise exception using errcode = '42501',
      message = 'You do not have permission to file documents for this person.';
  end if;
  select * into v_target from public.family_members where id = p_member_id;
  if v_target.family_id <> v_doc.family_id then
    raise exception using errcode = '42501', message = 'That person is not in this family.';
  end if;

  v_identity := app.identity_status_for(v_doc, p_member_id);
  v_override := v_identity <> 'match';
  if v_override and not coalesce(p_identity_acknowledged, false) then
    raise exception using errcode = 'P0001', message = 'identity_confirmation_required',
      detail = format('The identity check for %s is "%s". Confirm explicitly before filing.',
                      v_target.display_name, v_identity);
  end if;

  update public.documents set
    member_id = p_member_id,
    status = 'filed',
    document_type = p_document_type,
    title = p_title,
    document_date = p_document_date,
    provider = p_provider,
    category = p_category,
    filing_path = coalesce(p_filing_path, '{}'),
    identity_status = v_identity,
    identity_confirmed_by = case when v_override then auth.uid() end,
    identity_confirmed_at = case when v_override then now() end,
    filed_at = now(),
    filed_by = auth.uid(),
    processing_error = null
  where id = v_doc.id;

  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    -- Only built-in biomarkers or this family's own definitions.
    select b.id into v_biomarker from public.biomarkers b
    where b.id = nullif(v_result ->> 'biomarker_id', '')::uuid
      and (b.family_id is null or b.family_id = v_doc.family_id);

    insert into public.health_results (
      family_id, member_id, biomarker_id, analyte_name, source_document_id, result_date,
      value_numeric, value_text, unit, reference_low, reference_high, reference_text,
      flag, confidence, reviewed_by, reviewed_at, created_by
    ) values (
      v_doc.family_id, p_member_id, v_biomarker, left(v_result ->> 'analyte_name', 200), v_doc.id,
      coalesce(nullif(v_result ->> 'result_date', '')::date, p_document_date, v_doc.created_at::date),
      nullif(v_result ->> 'value_numeric', '')::numeric, nullif(v_result ->> 'value_text', ''),
      nullif(v_result ->> 'unit', ''), nullif(v_result ->> 'reference_low', '')::numeric,
      nullif(v_result ->> 'reference_high', '')::numeric, nullif(v_result ->> 'reference_text', ''),
      nullif(v_result ->> 'flag', ''),
      coalesce(nullif(v_result ->> 'confidence', ''), 'high')::public.result_confidence,
      auth.uid(), now(), auth.uid()
    );
    v_count := v_count + 1;
    if v_result ->> 'confidence' = 'needs_review' then
      v_review := v_review + 1;
    end if;
  end loop;

  v_label := format('%s — %s — %s',
    coalesce(p_title, initcap(replace(p_document_type, '_', ' ')), v_doc.original_filename),
    v_target.display_name,
    coalesce(to_char(p_document_date, 'FMDD Mon YYYY'), 'undated'));

  perform app.write_audit(v_doc.family_id, 'document.file', p_member_id, 'document', v_doc.id, v_label,
    jsonb_build_object('member_id', v_doc.member_id, 'status', v_doc.status),
    jsonb_build_object('member_id', p_member_id, 'status', 'filed', 'results', v_count, 'needs_review', v_review),
    jsonb_build_object('identity_status', v_identity, 'identity_override', v_override,
                       'extracted_patient_name', v_doc.extracted_patient_name));

  -- Tell the member a record was added to their profile (unless they did it).
  if v_target.status = 'active' and v_target.user_id is distinct from auth.uid() then
    insert into public.notifications (family_id, recipient_member_id, subject_member_id, kind, title, body, link)
    values (v_doc.family_id, v_target.id, v_target.id, 'document.filed',
      format('New %s added to your health records',
             coalesce(p_title, initcap(replace(p_document_type, '_', ' ')), 'document')),
      case when v_count > 0 then format('%s results were added.', v_count) end,
      '/m/' || v_target.id::text || '/documents');
  end if;

  return jsonb_build_object('document_id', v_doc.id, 'member_id', p_member_id,
                            'results', v_count, 'needs_review', v_review,
                            'identity_override', v_override);
end;
$$;

-- Super Admin: correct a document that was filed under the wrong person. Its
-- results move with it (ON UPDATE CASCADE) and access follows immediately.
create or replace function public.move_document(
  p_document_id uuid,
  p_to_member_id uuid,
  p_identity_acknowledged boolean,
  p_reason text default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_from public.family_members;
  v_to public.family_members;
  v_identity public.identity_status;
  v_override boolean;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.is_family_admin(v_doc.family_id) then
    raise exception using errcode = '42501', message = 'Only the Super Admin can move documents.';
  end if;
  if v_doc.status <> 'filed' then
    raise exception using errcode = '55000', message = 'Only filed documents can be moved.';
  end if;
  select * into v_to from public.family_members where id = p_to_member_id;
  if not found or v_to.family_id <> v_doc.family_id then
    raise exception using errcode = '42501', message = 'That person is not in this family.';
  end if;
  if p_to_member_id = v_doc.member_id then
    return;
  end if;
  select * into v_from from public.family_members where id = v_doc.member_id;

  v_identity := app.identity_status_for(v_doc, p_to_member_id);
  v_override := v_identity <> 'match';
  if v_override and not coalesce(p_identity_acknowledged, false) then
    raise exception using errcode = 'P0001', message = 'identity_confirmation_required',
      detail = format('The identity check for %s is "%s". Confirm explicitly before moving.',
                      v_to.display_name, v_identity);
  end if;

  update public.documents set
    member_id = p_to_member_id,
    identity_status = v_identity,
    identity_confirmed_by = case when v_override then auth.uid() end,
    identity_confirmed_at = case when v_override then now() end
  where id = v_doc.id;

  perform app.write_audit(v_doc.family_id, 'document.move', p_to_member_id, 'document', v_doc.id,
    format('%s — %s → %s',
      coalesce(v_doc.title, initcap(replace(v_doc.document_type, '_', ' ')), v_doc.original_filename),
      v_from.display_name, v_to.display_name),
    jsonb_build_object('member_id', v_from.id, 'member_name', v_from.display_name),
    jsonb_build_object('member_id', v_to.id, 'member_name', v_to.display_name),
    jsonb_build_object('reason', p_reason, 'identity_status', v_identity, 'identity_override', v_override,
                       'previous_member_id', v_from.id));

  if v_to.status = 'active' and v_to.user_id is distinct from auth.uid() then
    insert into public.notifications (family_id, recipient_member_id, subject_member_id, kind, title, link)
    values (v_doc.family_id, v_to.id, v_to.id, 'document.filed',
      format('A %s was added to your health records',
             coalesce(v_doc.title, initcap(replace(v_doc.document_type, '_', ' ')), 'document')),
      '/m/' || v_to.id::text || '/documents');
  end if;
end;
$$;

-- Super Admin: edit a filed document's extracted details.
create or replace function public.update_document_details(
  p_document_id uuid,
  p_document_type text,
  p_title text,
  p_document_date date,
  p_provider text,
  p_category text,
  p_filing_path text[]
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_before jsonb;
  v_after jsonb;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.is_family_admin(v_doc.family_id) then
    raise exception using errcode = '42501', message = 'Only the Super Admin can edit document details.';
  end if;

  update public.documents set
    document_type = p_document_type, title = p_title, document_date = p_document_date,
    provider = p_provider, category = p_category, filing_path = coalesce(p_filing_path, '{}')
  where id = v_doc.id;

  v_before := jsonb_build_object('document_type', v_doc.document_type, 'title', v_doc.title,
    'document_date', v_doc.document_date, 'provider', v_doc.provider, 'category', v_doc.category);
  v_after := jsonb_build_object('document_type', p_document_type, 'title', p_title,
    'document_date', p_document_date, 'provider', p_provider, 'category', p_category);
  if v_before is distinct from v_after then
    perform app.write_audit(v_doc.family_id, 'document.update', v_doc.member_id, 'document', v_doc.id,
      format('Edited details of %s', coalesce(p_title, v_doc.original_filename)), v_before, v_after);
  end if;
end;
$$;

-- Delete a document: the Super Admin any time, an uploader only before filing.
-- Soft-deletes the row (a tombstone stays for the audit trail), removes its
-- results, and returns the storage path so the caller can remove the file.
create or replace function public.delete_document(p_document_id uuid, p_reason text default null)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_results integer;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Document not found.';
  end if;
  if not (app.is_family_admin(v_doc.family_id)
          or (v_doc.status <> 'filed' and app.can_manage_pending_document(v_doc))) then
    raise exception using errcode = '42501', message = 'You do not have permission to delete this document.';
  end if;

  delete from public.health_results where source_document_id = v_doc.id;
  get diagnostics v_results = row_count;
  update public.documents set deleted_at = now(), deleted_by = auth.uid() where id = v_doc.id;

  perform app.write_audit(v_doc.family_id, 'document.delete', v_doc.member_id, 'document', v_doc.id,
    format('Deleted %s', coalesce(v_doc.title, v_doc.original_filename)),
    jsonb_build_object('title', v_doc.title, 'document_type', v_doc.document_type,
      'document_date', v_doc.document_date, 'status', v_doc.status, 'results', v_results),
    null, jsonb_build_object('reason', p_reason));
  return v_doc.storage_path;
end;
$$;

-- Reads are audited too. The app calls this when someone opens or downloads a
-- document, exports records, opens another member's profile, or starts and
-- ends "View as".
create or replace function public.log_access(
  p_action text,
  p_target_member_id uuid,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me public.family_members;
  v_target public.family_members;
begin
  v_me := app.require_active_member();
  if p_action not in ('document.view', 'document.download', 'records.export', 'profile.view',
                      'view_as.start', 'view_as.end', 'assistant.query') then
    raise exception using errcode = '22023', message = 'Unknown audit action.';
  end if;
  if p_target_member_id is not null then
    select * into v_target from public.family_members where id = p_target_member_id;
    if p_action like 'view_as.%' then
      if not found or not app.is_family_admin(v_target.family_id) then
        raise exception using errcode = '42501', message = 'Only the Super Admin can view as another member.';
      end if;
    elsif p_target_member_id not in (select app.member_ids_with('read')) then
      raise exception using errcode = '42501', message = 'You do not have access to this person''s records.';
    end if;
  end if;
  perform app.write_audit(coalesce(v_target.family_id, v_me.family_id), p_action, p_target_member_id,
    p_entity_type, p_entity_id, left(p_summary, 500), null, null, coalesce(p_metadata, '{}'));
end;
$$;

-- Function privileges: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.bootstrap_family(text, text, text, date)',
    'public.create_invitation(uuid, text)',
    'public.accept_invitation(text)',
    'public.create_document_upload(uuid, text, text, bigint)',
    'public.record_document_extraction(uuid, jsonb, jsonb, text, text, date, text, text, text, date)',
    'public.mark_document_failed(uuid, text)',
    'public.confirm_document(uuid, uuid, boolean, text, text, date, text, text, text[], jsonb)',
    'public.move_document(uuid, uuid, boolean, text)',
    'public.update_document_details(uuid, text, text, date, text, text, text[])',
    'public.delete_document(uuid, text)',
    'public.log_access(text, uuid, text, uuid, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function app.identity_status_for(public.documents, uuid) from public;

-- =============================================================================
-- Storage: one private bucket. No public URLs; files are served through
-- short-lived signed URLs created with the viewer's own session, so these
-- policies decide every download.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('health-documents', 'health-documents', false, 20 * 1024 * 1024,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false;

-- Files of documents deleted through delete_document(), by whoever may delete them.
create or replace function app.can_remove_document_file(p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_path and d.deleted_at is not null
      and (app.is_family_admin(d.family_id) or d.uploaded_by = auth.uid())
  )
$$;
revoke all on function app.can_remove_document_file(text) from public;
grant execute on function app.can_remove_document_file(text) to authenticated;

-- Read: allowed exactly when the caller can see the document row. The
-- subquery runs under the caller's own RLS on public.documents, so file access
-- can never be broader than record access. The one addition: whoever deleted a
-- document (Super Admin or its uploader) can still address its file so the
-- Storage API can remove it.
create policy health_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'health-documents'
         and (exists (select 1 from public.documents d where d.storage_path = storage.objects.name)
              or app.can_remove_document_file(storage.objects.name)));

-- Upload: only into the path reserved by create_document_upload(), by the
-- person who reserved it, while it is still processing.
create policy health_documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'health-documents'
              and exists (select 1 from public.documents d
                          where d.storage_path = storage.objects.name
                            and d.uploaded_by = (select auth.uid())
                            and d.status = 'processing'));

-- Delete: only files whose document was deleted through delete_document().
create policy health_documents_remove on storage.objects for delete to authenticated
  using (bucket_id = 'health-documents' and app.can_remove_document_file(storage.objects.name));
