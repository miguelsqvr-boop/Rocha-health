-- Linking a requested exam to its result: the document that reports it (the
-- ultrasound report, the blood test). The app proposes links when a result or
-- a request is filed; the person and the Super Admin can also link or unlink
-- by hand. A link marks the exam done, dated by the result.
--
-- No foreign key on purpose: the result must belong to the same person as the
-- exam, which link_exam_results() checks, and links are cleared when the
-- result is moved to someone else or deleted (trigger below). A second
-- foreign key to documents would also make the documents → requested_exams
-- relationship ambiguous for the API.

alter table public.requested_exams
  add column result_document_id uuid;
create index requested_exams_result_idx on public.requested_exams (result_document_id) where result_document_id is not null;

-- p_document_id null unlinks. p_automatic only changes the audit wording.
create or replace function public.link_exam_results(
  p_exam_ids uuid[],
  p_document_id uuid,
  p_automatic boolean default false
) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
  v_allowed integer;
  v_members integer;
  v_member_id uuid;
  v_family_id uuid;
  v_doc public.documents;
  v_names text;
  v_before jsonb;
begin
  perform app.begin_audited_operation();
  perform app.require_active_member();

  if coalesce(array_length(p_exam_ids, 1), 0) = 0 or array_length(p_exam_ids, 1) > 100 then
    raise exception using errcode = '22023', message = 'Choose the exams to update.';
  end if;
  select count(*), count(*) filter (where e.member_id in (select app.member_ids_with('write'))),
         count(distinct e.member_id), min(e.member_id::text)::uuid, min(e.family_id::text)::uuid
    into v_count, v_allowed, v_members, v_member_id, v_family_id
  from public.requested_exams e
  where e.id = any(p_exam_ids);
  if v_count <> (select count(distinct x) from unnest(p_exam_ids) x) or v_allowed <> v_count or v_members <> 1 then
    raise exception using errcode = '42501', message = 'You can only update exams for yourself, or for the family as its Super Admin.';
  end if;

  if p_document_id is not null then
    select * into v_doc from public.documents d
    where d.id = p_document_id and d.status = 'filed' and d.deleted_at is null;
    if not found or v_doc.member_id <> v_member_id or v_doc.family_id <> v_family_id then
      raise exception using errcode = '22023', message = 'The result must be a filed document of the same person.';
    end if;
  end if;

  select jsonb_agg(jsonb_build_object('id', e.id, 'exam_name', e.exam_name, 'status', e.status, 'event_date', e.event_date,
                                      'place', e.place, 'result_document_id', e.result_document_id) order by e.sort_order),
         string_agg(e.exam_name, ', ' order by e.sort_order)
    into v_before, v_names
  from public.requested_exams e where e.id = any(p_exam_ids);

  if p_document_id is null then
    update public.requested_exams e set result_document_id = null, updated_by = auth.uid(), updated_at = now()
    where e.id = any(p_exam_ids);
  else
    -- Done, on the result's date; a date or place already recorded for a
    -- done exam is kept.
    update public.requested_exams e set
      result_document_id = v_doc.id,
      status = 'done',
      event_date = case when e.status = 'done' and e.event_date is not null then e.event_date else v_doc.document_date end,
      event_time = null,
      place = case when e.status = 'done' and e.place is not null then e.place else coalesce(v_doc.provider, e.place) end,
      updated_by = auth.uid(),
      updated_at = now()
    where e.id = any(p_exam_ids);
  end if;

  perform app.write_audit(v_family_id, 'requested_exam.link', v_member_id, 'requested_exam', null,
    left(case when p_document_id is null then format('%s: result unlinked', v_names)
              else format('%s: result %s — %s, %s', v_names,
                          case when p_automatic then 'linked automatically' else 'linked' end,
                          coalesce(v_doc.title, initcap(replace(v_doc.document_type, '_', ' '))),
                          coalesce(to_char(v_doc.document_date, 'FMDD Mon YYYY'), 'undated')) end, 500),
    jsonb_build_object('exams', v_before),
    (select jsonb_build_object('exams', jsonb_agg(jsonb_build_object('id', e.id, 'exam_name', e.exam_name, 'status', e.status,
              'event_date', e.event_date, 'place', e.place, 'result_document_id', e.result_document_id) order by e.sort_order))
       from public.requested_exams e where e.id = any(p_exam_ids)),
    jsonb_build_object('automatic', coalesce(p_automatic, false)));
  return v_count;
end;
$$;

revoke all on function public.link_exam_results(uuid[], uuid, boolean) from public, anon;
grant execute on function public.link_exam_results(uuid[], uuid, boolean) to authenticated;

-- A result means done: an exam moved back to "to do" or "booked" loses it.
create or replace function app.requested_exam_not_done_has_no_result()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'done' then
    new.result_document_id := null;
  end if;
  return new;
end;
$$;
create trigger requested_exam_not_done_has_no_result before insert or update on public.requested_exams
  for each row execute function app.requested_exam_not_done_has_no_result();

-- A result moved to someone else, or deleted, is no longer anyone's result
-- here. Runs inside move_document() / delete_document(), whose audit entries
-- cover it.
create or replace function app.clear_exam_result_links()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.deleted_at is not null or new.member_id is distinct from old.member_id or new.status <> 'filed' then
    update public.requested_exams set result_document_id = null where result_document_id = new.id;
  end if;
  return null;
end;
$$;
create trigger clear_exam_result_links after update of member_id, deleted_at, status on public.documents
  for each row execute function app.clear_exam_result_links();

revoke all on function app.requested_exam_not_done_has_no_result() from public, authenticated, service_role;
revoke all on function app.clear_exam_result_links() from public, authenticated, service_role;
