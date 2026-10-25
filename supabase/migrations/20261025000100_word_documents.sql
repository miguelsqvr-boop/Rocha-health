-- Word documents (.docx) can be uploaded alongside PDFs and images. The app
-- extracts their text and tables for reading; the original file is stored in
-- the same private bucket under the same rules.

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
  v_extension text;
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

  v_path := v_family_id::text || '/' || v_doc_id::text || '/original.' || v_extension;

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

-- create or replace keeps the existing grants; restate them so this file is
-- correct on its own.
revoke all on function public.create_document_upload(uuid, text, text, bigint) from public, anon;
grant execute on function public.create_document_upload(uuid, text, text, bigint) to authenticated;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'health-documents';
