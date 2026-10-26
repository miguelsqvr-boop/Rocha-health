-- Following up an exam request: for each requested exam, whether it is still
-- to do, booked or done, when (the appointment, or the day it was done) and
-- where. The person themselves and the Super Admin can update it, in one
-- audited call that can cover several exams at once ("all done at CUF on
-- 12 Nov").

alter table public.requested_exams
  add column status text not null default 'to_do' check (status in ('to_do', 'scheduled', 'done')),
  add column event_date date,
  add column event_time time,
  add column place text check (length(trim(place)) between 1 and 120),
  add column notes text check (length(trim(notes)) between 1 and 500),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz,
  -- Still to do means no date or place yet.
  add constraint requested_exams_to_do_has_no_date
    check (status <> 'to_do' or (event_date is null and event_time is null and place is null));

-- p_status: 'to_do' | 'scheduled' | 'done'. Date, time and place are set as
-- given (cleared for 'to_do'); notes are kept when p_notes is null, cleared
-- when it is empty. Every exam must belong to someone the caller may write
-- for, or nothing changes.
create or replace function public.update_requested_exams(
  p_exam_ids uuid[],
  p_status text,
  p_event_date date default null,
  p_event_time time default null,
  p_place text default null,
  p_notes text default null
) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
  v_allowed integer;
  v_member record;
  v_when text;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();

  if p_status not in ('to_do', 'scheduled', 'done') then
    raise exception using errcode = '22023', message = 'Choose to do, booked or done.';
  end if;
  if coalesce(array_length(p_exam_ids, 1), 0) = 0 or array_length(p_exam_ids, 1) > 100 then
    raise exception using errcode = '22023', message = 'Choose the exams to update.';
  end if;
  if p_status = 'done' and p_event_date > current_date + 1 then
    raise exception using errcode = '22023', message = 'An exam can''t be done on a future date. Mark it as booked instead.';
  end if;

  select count(*), count(*) filter (where e.member_id in (select app.member_ids_with('write')))
    into v_count, v_allowed
  from public.requested_exams e
  where e.id = any(p_exam_ids);
  if v_count <> (select count(distinct x) from unnest(p_exam_ids) x) or v_allowed <> v_count then
    raise exception using errcode = '42501', message = 'You can only update exams for yourself, or for the family as its Super Admin.';
  end if;

  v_when := concat_ws(' ',
    case p_status when 'done' then 'done' when 'scheduled' then 'booked' else 'to do' end,
    case when p_status <> 'to_do' and p_event_date is not null then 'on ' || to_char(p_event_date, 'FMDD Mon YYYY') end,
    case when p_status = 'scheduled' and p_event_time is not null then 'at ' || to_char(p_event_time, 'HH24:MI') end,
    case when p_status <> 'to_do' and nullif(trim(p_place), '') is not null then '— ' || trim(p_place) end);

  -- One audit entry per person, listing each exam before and after.
  for v_member in
    select e.family_id, e.member_id,
           jsonb_agg(jsonb_build_object('id', e.id, 'exam_name', e.exam_name, 'status', e.status,
             'event_date', e.event_date, 'event_time', e.event_time, 'place', e.place, 'notes', e.notes) order by e.sort_order) as before,
           string_agg(e.exam_name, ', ' order by e.sort_order) as names
    from public.requested_exams e
    where e.id = any(p_exam_ids)
    group by e.family_id, e.member_id
  loop
    update public.requested_exams e set
      status = p_status,
      event_date = case when p_status = 'to_do' then null else p_event_date end,
      event_time = case when p_status = 'scheduled' then p_event_time end,
      place = case when p_status = 'to_do' then null else nullif(trim(p_place), '') end,
      notes = case when p_notes is null then e.notes else nullif(trim(p_notes), '') end,
      updated_by = auth.uid(),
      updated_at = now()
    where e.id = any(p_exam_ids) and e.member_id = v_member.member_id;

    perform app.write_audit(v_member.family_id, 'requested_exam.update', v_member.member_id, 'requested_exam', null,
      left(format('%s: %s', v_member.names, v_when), 500),
      jsonb_build_object('exams', v_member.before),
      (select jsonb_build_object('exams', jsonb_agg(jsonb_build_object('id', e.id, 'exam_name', e.exam_name, 'status', e.status,
                'event_date', e.event_date, 'event_time', e.event_time, 'place', e.place, 'notes', e.notes) order by e.sort_order))
         from public.requested_exams e where e.id = any(p_exam_ids) and e.member_id = v_member.member_id));
  end loop;

  return v_count;
end;
$$;

revoke all on function public.update_requested_exams(uuid[], text, date, time, text, text) from public, anon;
grant execute on function public.update_requested_exams(uuid[], text, date, time, text, text) to authenticated;

-- Editing a request's exam list (Super Admin) keeps what was recorded for the
-- exams that stay: exams sent with their id are updated in place, new ones
-- are added, and the ones left out are removed.
create or replace function app.replace_requested_exams(p_doc public.documents, p_exams jsonb)
returns void
language plpgsql volatile set search_path = ''
as $$
begin
  delete from public.requested_exams e
  where e.source_document_id = p_doc.id
    and e.id not in (
      select (x.value ->> 'id')::uuid from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) x
      where x.value ->> 'id' ~ '^[0-9a-fA-F-]{36}$');

  update public.requested_exams e set
    exam_name = left(trim(x.value ->> 'exam_name'), 200),
    exam_type = coalesce(nullif(x.value ->> 'exam_type', ''), 'other'),
    body_site = left(nullif(trim(x.value ->> 'body_site'), ''), 120),
    sort_order = x.ordinality::integer
  from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) with ordinality x
  where x.value ->> 'id' ~ '^[0-9a-fA-F-]{36}$'
    and e.id = (x.value ->> 'id')::uuid
    and e.source_document_id = p_doc.id
    and nullif(trim(x.value ->> 'exam_name'), '') is not null;

  insert into public.requested_exams (family_id, member_id, source_document_id, exam_name, exam_type, body_site, sort_order)
  select p_doc.family_id, p_doc.member_id, p_doc.id,
         left(trim(x.value ->> 'exam_name'), 200),
         coalesce(nullif(x.value ->> 'exam_type', ''), 'other'),
         left(nullif(trim(x.value ->> 'body_site'), ''), 120),
         x.ordinality::integer
  from jsonb_array_elements(coalesce(p_exams, '[]'::jsonb)) with ordinality x
  where (x.value ->> 'id') is null
    and nullif(trim(x.value ->> 'exam_name'), '') is not null;
end;
$$;
revoke all on function app.replace_requested_exams(public.documents, jsonb) from public, authenticated, service_role;

-- update_document_details() now replaces the exam list with
-- app.replace_requested_exams(), so recorded progress survives an edit.
create or replace function public.update_document_details(
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
    perform app.replace_requested_exams(v_new, p_requested_exams);
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

revoke all on function public.update_document_details(uuid, text, text, date, text, text, text[], text, text, jsonb) from public, anon;
grant execute on function public.update_document_details(uuid, text, text, date, text, text, text[], text, text, jsonb) to authenticated;
