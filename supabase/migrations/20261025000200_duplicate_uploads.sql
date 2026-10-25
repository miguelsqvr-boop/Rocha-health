-- The same file can't be uploaded twice. Each upload carries the SHA-256 of
-- its bytes (computed by the app server); a family keeps at most one live
-- (not deleted) document per fingerprint. Deleting a document frees its
-- fingerprint, so a removed file can be uploaded again.

alter table public.documents
  add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$');

create unique index documents_one_copy_per_family
  on public.documents (family_id, content_hash)
  where deleted_at is null;

-- Same as create_document_upload(uuid, text, text, bigint), plus the file's
-- fingerprint. Refuses a file the family already has, saying where it is when
-- the uploader can see that document, and nothing more when they can't.
create or replace function public.create_document_upload(
  p_member_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_content_hash text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_me public.family_members;
  v_target public.family_members;
  v_existing public.documents;
  v_doc_id uuid := gen_random_uuid();
  v_family_id uuid;
  v_extension text;
  v_path text;
  v_message text;
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

  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/gif' then 'gif'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
  end;
  if v_extension is null then
    raise exception using errcode = '22023',
      message = 'Unsupported file type. Upload a PDF, a Word document (.docx) or an image (JPEG, PNG, WebP, GIF).';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 20 * 1024 * 1024 then
    raise exception using errcode = '22023', message = 'Each file must be smaller than 20 MB.';
  end if;

  if p_content_hash is not null then
    if p_content_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'Invalid file fingerprint.';
    end if;
    select * into v_existing from public.documents
    where family_id = v_family_id and content_hash = p_content_hash and deleted_at is null
    limit 1;
    if found then
      if app.is_family_admin(v_existing.family_id) or v_existing.uploaded_by = auth.uid()
         or (v_existing.status = 'filed' and v_existing.member_id in (select app.member_ids_with('read'))) then
        v_message := case
          when v_existing.status = 'filed' then
            format('This file is already in the records: %s — %s — %s (uploaded %s). It was not added again.',
              coalesce(v_existing.title, v_existing.original_filename),
              (select m.display_name from public.family_members m where m.id = v_existing.member_id),
              coalesce(to_char(v_existing.document_date, 'FMDD Mon YYYY'), 'undated'),
              to_char(v_existing.created_at, 'FMDD Mon YYYY'))
          else
            format('This file was already uploaded on %s (%s) and is waiting for review in Documents. It was not added again.',
              to_char(v_existing.created_at, 'FMDD Mon YYYY'), v_existing.original_filename)
        end;
      else
        v_message := 'This file is already in the family''s records. It was not added again.';
      end if;
      raise exception using errcode = '22023', message = v_message;
    end if;
  end if;

  v_path := v_family_id::text || '/' || v_doc_id::text || '/original.' || v_extension;

  begin
    insert into public.documents (
      id, family_id, member_id, uploaded_by, uploaded_by_name, status,
      original_filename, mime_type, size_bytes, storage_path, content_hash
    ) values (
      v_doc_id, v_family_id, p_member_id, auth.uid(), v_me.display_name, 'processing',
      left(coalesce(nullif(trim(p_original_filename), ''), 'document'), 255), p_mime_type, p_size_bytes, v_path,
      p_content_hash
    );
  exception when unique_violation then
    -- The same file arrived twice at once (e.g. dropped twice in one batch).
    raise exception using errcode = '22023', message = 'This file is already being uploaded. It was not added again.';
  end;

  perform app.write_audit(v_family_id, 'document.upload', p_member_id, 'document', v_doc_id,
    format('Uploaded %s %s', p_original_filename,
      coalesce('for ' || v_target.display_name, '(patient to be identified)')),
    null, null, jsonb_build_object('mime_type', p_mime_type, 'size_bytes', p_size_bytes));

  return jsonb_build_object('document_id', v_doc_id, 'storage_path', v_path);
end;
$$;

revoke all on function public.create_document_upload(uuid, text, text, bigint, text) from public, anon;
grant execute on function public.create_document_upload(uuid, text, text, bigint, text) to authenticated;

-- The four-argument form stays for app versions deployed before this
-- migration (and the database tests); it uploads without a fingerprint, so it
-- does no duplicate check. The app always sends one.
create or replace function public.create_document_upload(
  p_member_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
) returns jsonb
language sql volatile set search_path = ''
as $$
  select public.create_document_upload(p_member_id, p_original_filename, p_mime_type, p_size_bytes, null::text)
$$;

revoke all on function public.create_document_upload(uuid, text, text, bigint) from public, anon;
grant execute on function public.create_document_upload(uuid, text, text, bigint) to authenticated;
