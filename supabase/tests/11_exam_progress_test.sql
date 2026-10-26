-- Following up requested exams: to do, booked or done, when and where. The
-- person and the Super Admin can update it; nobody else; every change is
-- audited; editing the request keeps what was recorded.
\ir roles.psql
begin;

:as_miguel
select public.record_document_extraction(tests.doc('pending_for_santi'), '{}',
  jsonb_build_object('by_member', jsonb_build_object(tests.member('Santi')::text, jsonb_build_object('status', 'match'))),
  'exam_request', 'Exam Request', '2026-10-02', 'Hospital da Luz', 'consultations', 'Santiago Rocha', null);
select public.confirm_document(tests.doc('pending_for_santi'), tests.member('Santi'), false,
  'exam_request', 'Exam Request', '2026-10-02', 'Hospital da Luz', 'consultations', '{}', '[]', 'Ana Costa', 'cardiology',
  '[{"exam_name": "Ecocardiograma", "exam_type": "echocardiogram"},
    {"exam_name": "Holter 24h", "exam_type": "holter"},
    {"exam_name": "Hemograma", "exam_type": "blood_test"}]');
create temporary table exam_ids as
  select exam_name, id from public.requested_exams where source_document_id = tests.doc('pending_for_santi');
grant select on exam_ids to authenticated;

select tests.ok((select bool_and(status = 'to_do' and event_date is null and place is null) from public.requested_exams),
  'New exams start as to do');

-- Santi books his echocardiogram himself.
:as_santi
select tests.ok(public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Ecocardiograma')],
  'scheduled', '2026-11-14', '10:30', '  CUF Descobertas ') = 1, 'Santi books one of his exams');
select tests.ok((select status = 'scheduled' and event_date = '2026-11-14' and event_time = '10:30' and place = 'CUF Descobertas'
                 from public.requested_exams where exam_name = 'Ecocardiograma'),
  'The booking keeps the date, time and place (trimmed)');
select tests.ok((tests.last_audit('requested_exam.update')).summary = 'Ecocardiograma: booked on 14 Nov 2026 at 10:30 — CUF Descobertas'
                and (tests.last_audit('requested_exam.update')).target_member_name = 'Santi'
                and (tests.last_audit('requested_exam.update')).before_data -> 'exams' -> 0 ->> 'status' = 'to_do',
  'The change is audited in plain words, with before and after');

-- Miguel marks the other two done at once.
:as_miguel
select tests.ok(public.update_requested_exams(
  array(select id from exam_ids where exam_name in ('Holter 24h', 'Hemograma')), 'done', '2026-10-20', null, 'Germano de Sousa', 'Fasting') = 2,
  'The Super Admin marks two exams done in one go');
select tests.ok((select bool_and(status = 'done' and event_date = '2026-10-20' and event_time is null and place = 'Germano de Sousa' and notes = 'Fasting')
                 from public.requested_exams where exam_name in ('Holter 24h', 'Hemograma')),
  'Both get the date, place and note; done exams keep no time');
select tests.ok((tests.last_audit('requested_exam.update')).summary = 'Holter 24h, Hemograma: done on 20 Oct 2026 — Germano de Sousa',
  'One audit entry names both exams');
select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'done', '2026-10-21', null, 'Germano de Sousa');
select tests.ok((select notes from public.requested_exams where exam_name = 'Hemograma') = 'Fasting',
  'Leaving the note out keeps it');
select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'to_do', '2026-10-21', null, 'Germano de Sousa', '');
select tests.ok((select status = 'to_do' and event_date is null and place is null and notes is null from public.requested_exams where exam_name = 'Hemograma'),
  'Back to "to do" clears the date and place; an empty note clears it');
select tests.fails($$select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'done', current_date + 10)$$,
  'future date', 'An exam can''t be done in the future');
select tests.fails($$select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'lost')$$,
  'Choose to do, booked or done', 'Only the three statuses are accepted');
select tests.fails($$select public.update_requested_exams('{}'::uuid[], 'done')$$, 'Choose the exams', 'An empty list is refused');

-- Nobody else can update them, and a mixed list changes nothing.
:as_gui
select tests.fails($$select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'done', '2026-10-20')$$,
  'only update exams for yourself', 'Gui cannot update Santi''s exams');
:as_outsider
select tests.fails($$select public.update_requested_exams(array(select id from exam_ids), 'done')$$,
  'only update exams for yourself', 'Another family cannot update them');
:as_anon
select tests.fails($$select public.update_requested_exams(array[gen_random_uuid()], 'done')$$,
  'permission denied', 'Signed-out visitors cannot call it');
:as_santi
select tests.fails($$select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma'), gen_random_uuid()], 'done', '2026-10-20')$$,
  'only update exams for yourself', 'An unknown id makes the whole update fail');
select tests.ok((select status from public.requested_exams where exam_name = 'Hemograma') = 'to_do', '…and nothing changed');
select tests.fails($$update public.requested_exams set status = 'done'$$, 'permission denied', 'Direct updates stay refused');

-- A doctor with view-only access can read the progress but not change it.
:as_miguel
insert into public.member_access_grants (family_id, subject_member_id, grantee_user_id, access_level, relationship, granted_by)
select family_id, id, tests.user_id('doctor'), 'view', 'doctor', auth.uid() from public.family_members where id = tests.member('Santi');
:as_doctor
select tests.ok((select status from public.requested_exams where exam_name = 'Ecocardiograma') = 'scheduled', 'View access shows the progress');
select tests.fails($$select public.update_requested_exams(array[(select id from exam_ids where exam_name = 'Hemograma')], 'done')$$,
  'not active', 'View access cannot change it');

-- Editing the request keeps the progress of the exams that stay.
:as_miguel
select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}', null, null,
  jsonb_build_array(
    jsonb_build_object('id', (select id from exam_ids where exam_name = 'Ecocardiograma'), 'exam_name', 'Ecocardiograma transtorácico', 'exam_type', 'echocardiogram'),
    jsonb_build_object('id', (select id from exam_ids where exam_name = 'Holter 24h'), 'exam_name', 'Holter 24h', 'exam_type', 'holter'),
    jsonb_build_object('exam_name', 'Prova de esforço', 'exam_type', 'stress_test')));
select tests.ok((select status = 'scheduled' and place = 'CUF Descobertas' from public.requested_exams where exam_name = 'Ecocardiograma transtorácico')
                and (select status = 'done' from public.requested_exams where exam_name = 'Holter 24h')
                and (select status = 'to_do' from public.requested_exams where exam_name = 'Prova de esforço')
                and not exists (select 1 from public.requested_exams where exam_name = 'Hemograma'),
  'Renamed exams keep their booking, kept ones stay done, new ones start to do, removed ones go');
select tests.ok((select array_agg(exam_name order by sort_order) from public.requested_exams where source_document_id = tests.doc('pending_for_santi'))
                = array['Ecocardiograma transtorácico', 'Holter 24h', 'Prova de esforço'],
  'The new order is kept');
select public.update_document_details(tests.doc('santi_blood'), 'blood_test', 'Blood Test', '2026-09-08', 'CUF', 'laboratory', '{}', null, null,
  jsonb_build_array(jsonb_build_object('id', (select id from exam_ids where exam_name = 'Holter 24h'), 'exam_name', 'Stolen', 'exam_type', 'other')));
select tests.ok((select exam_name = 'Holter 24h' and source_document_id = tests.doc('pending_for_santi') from public.requested_exams where id = (select id from exam_ids where exam_name = 'Holter 24h'))
                and not exists (select 1 from public.requested_exams where source_document_id = tests.doc('santi_blood')),
  'An exam id from another request is neither changed nor moved');

rollback;
