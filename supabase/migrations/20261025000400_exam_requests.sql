-- Exam requests (requisições / pedidos de exames): a doctor's request for exams
-- to be done. They are uploaded, identity-checked and filed like any other
-- document (document_type 'exam_request'). On top of that the doctor, their
-- specialty and each requested exam are stored, so the family can sort
-- requests by specialty, date, doctor and type of exam.

-- Who wrote the document. Useful for any document; for exam requests it is
-- the prescribing doctor. specialty is a code from the app's list
-- (src/lib/domain/exams.ts), e.g. 'cardiology'.
alter table public.documents
  add column doctor_name text check (length(trim(doctor_name)) between 1 and 120),
  add column specialty text check (specialty ~ '^[a-z_]{1,40}$');

-- One row per exam on a filed request. Same pattern as health_results: the
-- rows always belong to the same person as their document, and move with it.
create table public.requested_exams (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  source_document_id uuid not null,
  exam_name text not null check (length(trim(exam_name)) between 1 and 200),
  -- A code from the app's list, e.g. 'blood_test', 'ultrasound', 'mri'.
  exam_type text not null default 'other' check (exam_type ~ '^[a-z_]{1,40}$'),
  body_site text check (length(body_site) <= 120),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete restrict,
  foreign key (source_document_id, family_id, member_id)
    references public.documents(id, family_id, member_id)
    on update cascade on delete cascade
);
create index requested_exams_member_idx on public.requested_exams (member_id, exam_type);
create index requested_exams_document_idx on public.requested_exams (source_document_id, sort_order);

-- Read follows the member, like every health record. There are no write
-- policies: rows are written only by confirm_document() and
-- update_document_details(), which check permissions and audit.
alter table public.requested_exams enable row level security;
revoke all on public.requested_exams from anon, authenticated;
grant select on public.requested_exams to authenticated;
create policy requested_exams_select on public.requested_exams for select to authenticated
  using (member_id in (select app.member_ids_with('read')));

create trigger audit_requested_exams after insert or update or delete on public.requested_exams
  for each row execute function app.audit_row_change('requested_exam', 'member_id');

-- Exams as the app sends them: [{"exam_name", "exam_type", "body_site"}].
create or replace function app.insert_requested_exams(p_doc public.documents, p_exams jsonb)
returns integer
language plpgsql volatile set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.requested_exams (family_id, member_id, source_document_id, exam_name, exam_type, body_site, sort_order)
  select p_doc.family_id, p_doc.member_id, p_doc.id,
         left(trim(e.value ->> 'exam_name'), 200),
         coalesce(nullif(e.value ->> 'exam_type', ''), 'other'),
         left(nullif(trim(e.value ->> 'body_site'), ''), 120),
         e.ordinality::integer
  from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) with ordinality e
  where nullif(trim(e.value ->> 'exam_name'), '') is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function app.insert_requested_exams(public.documents, jsonb) from public, authenticated, service_role;

-- confirm_document() gains the doctor, specialty and requested exams. The new
-- parameters have defaults, so callers that don't send them keep working.
drop function public.confirm_document(uuid, uuid, boolean, text, text, date, text, text, text[], jsonb);
create function public.confirm_document(
  p_document_id uuid,
  p_member_id uuid,
  p_identity_acknowledged boolean,
  p_document_type text,
  p_title text,
  p_document_date date,
  p_provider text,
  p_category text,
  p_filing_path text[],
  p_results jsonb default '[]',
  p_doctor_name text default null,
  p_specialty text default null,
  p_requested_exams jsonb default '[]'
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_filed public.documents;
  v_target public.family_members;
  v_identity public.identity_status;
  v_override boolean;
  v_result jsonb;
  v_biomarker uuid;
  v_count integer := 0;
  v_review integer := 0;
  v_exams integer := 0;
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
    doctor_name = nullif(trim(p_doctor_name), ''),
    specialty = nullif(p_specialty, ''),
    identity_status = v_identity,
    identity_confirmed_by = case when v_override then auth.uid() end,
    identity_confirmed_at = case when v_override then now() end,
    filed_at = now(),
    filed_by = auth.uid(),
    processing_error = null
  where id = v_doc.id
  returning * into v_filed;

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

  v_exams := app.insert_requested_exams(v_filed, p_requested_exams);

  v_label := format('%s — %s — %s',
    coalesce(p_title, initcap(replace(p_document_type, '_', ' ')), v_doc.original_filename),
    v_target.display_name,
    coalesce(to_char(p_document_date, 'FMDD Mon YYYY'), 'undated'));

  perform app.write_audit(v_doc.family_id, 'document.file', p_member_id, 'document', v_doc.id, v_label,
    jsonb_build_object('member_id', v_doc.member_id, 'status', v_doc.status),
    jsonb_build_object('member_id', p_member_id, 'status', 'filed', 'results', v_count, 'needs_review', v_review,
                       'requested_exams', v_exams, 'doctor_name', v_filed.doctor_name, 'specialty', v_filed.specialty),
    jsonb_build_object('identity_status', v_identity, 'identity_override', v_override,
                       'extracted_patient_name', v_doc.extracted_patient_name));

  -- Tell the member a record was added to their profile (unless they did it).
  if v_target.status = 'active' and v_target.user_id is distinct from auth.uid() then
    insert into public.notifications (family_id, recipient_member_id, subject_member_id, kind, title, body, link)
    values (v_doc.family_id, v_target.id, v_target.id, 'document.filed',
      format('New %s added to your health records',
             coalesce(p_title, initcap(replace(p_document_type, '_', ' ')), 'document')),
      case when v_count > 0 then format('%s results were added.', v_count)
           when v_exams > 0 then format('%s exams requested.', v_exams) end,
      '/m/' || v_target.id::text || case when v_exams > 0 then '/exam-requests' else '/documents' end);
  end if;

  return jsonb_build_object('document_id', v_doc.id, 'member_id', p_member_id,
                            'results', v_count, 'needs_review', v_review, 'requested_exams', v_exams,
                            'identity_override', v_override);
end;
$$;

-- update_document_details() gains the doctor, specialty and the list of
-- requested exams. Null means "leave as it is" (so callers that don't send
-- them change nothing); an empty string clears the doctor or specialty, and an
-- array replaces the exams.
drop function public.update_document_details(uuid, text, text, date, text, text, text[]);
create function public.update_document_details(
  p_document_id uuid,
  p_document_type text,
  p_title text,
  p_document_date date,
  p_provider text,
  p_category text,
  p_filing_path text[],
  p_doctor_name text default null,
  p_specialty text default null,
  p_requested_exams jsonb default null
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_new public.documents;
  v_before jsonb;
  v_after jsonb;
  v_exams_before jsonb;
  v_exams_after jsonb;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();
  select * into v_doc from public.documents where id = p_document_id and deleted_at is null for update;
  if not found or not app.is_family_admin(v_doc.family_id) then
    raise exception using errcode = '42501', message = 'Only the Super Admin can edit document details.';
  end if;
  if v_doc.status <> 'filed' and p_requested_exams is not null then
    raise exception using errcode = '55000', message = 'Requested exams are saved when the document is filed.';
  end if;

  update public.documents set
    document_type = p_document_type, title = p_title, document_date = p_document_date,
    provider = p_provider, category = p_category, filing_path = coalesce(p_filing_path, '{}'),
    doctor_name = case when p_doctor_name is null then doctor_name else nullif(trim(p_doctor_name), '') end,
    specialty = case when p_specialty is null then specialty else nullif(p_specialty, '') end
  where id = v_doc.id
  returning * into v_new;

  if p_requested_exams is not null then
    select coalesce(jsonb_agg(jsonb_build_object('exam_name', exam_name, 'exam_type', exam_type, 'body_site', body_site)
                              order by sort_order), '[]')
      into v_exams_before from public.requested_exams where source_document_id = v_doc.id;
    delete from public.requested_exams where source_document_id = v_doc.id;
    perform app.insert_requested_exams(v_new, p_requested_exams);
    select coalesce(jsonb_agg(jsonb_build_object('exam_name', exam_name, 'exam_type', exam_type, 'body_site', body_site)
                              order by sort_order), '[]')
      into v_exams_after from public.requested_exams where source_document_id = v_doc.id;
  end if;

  v_before := jsonb_build_object('document_type', v_doc.document_type, 'title', v_doc.title,
    'document_date', v_doc.document_date, 'provider', v_doc.provider, 'category', v_doc.category,
    'doctor_name', v_doc.doctor_name, 'specialty', v_doc.specialty);
  v_after := jsonb_build_object('document_type', v_new.document_type, 'title', v_new.title,
    'document_date', v_new.document_date, 'provider', v_new.provider, 'category', v_new.category,
    'doctor_name', v_new.doctor_name, 'specialty', v_new.specialty);
  if v_exams_before is distinct from v_exams_after then
    v_before := v_before || jsonb_build_object('requested_exams', v_exams_before);
    v_after := v_after || jsonb_build_object('requested_exams', v_exams_after);
  end if;
  if v_before is distinct from v_after then
    perform app.write_audit(v_doc.family_id, 'document.update', v_doc.member_id, 'document', v_doc.id,
      format('Edited details of %s', coalesce(p_title, v_doc.original_filename)), v_before, v_after);
  end if;
end;
$$;

-- delete_document() also removes the requested exams (the row stays as a
-- tombstone, so the foreign key's ON DELETE CASCADE doesn't fire).
create or replace function public.delete_document(p_document_id uuid, p_reason text default null)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_doc public.documents;
  v_results integer;
  v_exams integer;
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
  delete from public.requested_exams where source_document_id = v_doc.id;
  get diagnostics v_exams = row_count;
  update public.documents set deleted_at = now(), deleted_by = auth.uid() where id = v_doc.id;

  perform app.write_audit(v_doc.family_id, 'document.delete', v_doc.member_id, 'document', v_doc.id,
    format('Deleted %s', coalesce(v_doc.title, v_doc.original_filename)),
    jsonb_build_object('title', v_doc.title, 'document_type', v_doc.document_type,
      'document_date', v_doc.document_date, 'status', v_doc.status, 'results', v_results,
      'requested_exams', v_exams),
    null, jsonb_build_object('reason', p_reason));
  return v_doc.storage_path;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.confirm_document(uuid, uuid, boolean, text, text, date, text, text, text[], jsonb, text, text, jsonb)',
    'public.update_document_details(uuid, text, text, date, text, text, text[], text, text, jsonb)',
    'public.delete_document(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
