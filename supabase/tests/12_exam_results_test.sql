-- Linking requested exams to their results: same person only, marks the exam
-- done with the result's date and place, audited; links go when the result is
-- moved away or deleted, or the exam goes back to "to do".
\ir roles.psql
begin;

:as_miguel
select public.record_document_extraction(tests.doc('pending_for_santi'), '{}',
  jsonb_build_object('by_member', jsonb_build_object(tests.member('Santi')::text, jsonb_build_object('status', 'match'))),
  'exam_request', 'Exam Request', '2026-09-01', 'USF Oeiras', 'consultations', 'Santiago Rocha', null);
select public.confirm_document(tests.doc('pending_for_santi'), tests.member('Santi'), false,
  'exam_request', 'Exam Request', '2026-09-01', 'USF Oeiras', 'consultations', '{}', '[]', 'Rui Lopes', 'general_practice',
  '[{"exam_name": "Hemograma", "exam_type": "blood_test"},
    {"exam_name": "HbA1c", "exam_type": "blood_test"},
    {"exam_name": "Ecografia abdominal", "exam_type": "ultrasound"}]');
-- An exam for Gui too (added to his ECG document by the Super Admin).
select public.update_document_details(tests.doc('gui_ecg'), 'ecg', 'ECG', '2026-08-21', 'CUF', 'cardiology', '{}', null, null,
  '[{"exam_name": "Holter", "exam_type": "holter"}]');
create temporary table ex as select exam_name, id from public.requested_exams;
grant select on ex to authenticated;

-- Santi links his blood test to two requested exams.
:as_santi
select tests.ok(public.link_exam_results(array(select id from ex where exam_name in ('Hemograma', 'HbA1c')), tests.doc('santi_blood')) = 2,
  'Santi links his blood test to two requested exams');
select tests.ok((select bool_and(status = 'done' and event_date = '2026-09-08' and place = 'CUF' and result_document_id = tests.doc('santi_blood'))
                 from public.requested_exams where exam_name in ('Hemograma', 'HbA1c')),
  'Linked exams are done, dated and placed by the result');
select tests.ok((tests.last_audit('requested_exam.link')).summary = 'Hemograma, HbA1c: result linked — Blood Test, 8 Sep 2026'
                and (tests.last_audit('requested_exam.link')).metadata ->> 'automatic' = 'false',
  'The link is audited');

-- A done exam keeps the date and place someone recorded.
:as_miguel
select public.update_requested_exams(array[(select id from ex where exam_name = 'Ecografia abdominal')], 'done', '2026-09-20', null, 'Imagens Médicas');
select public.link_exam_results(array[(select id from ex where exam_name = 'Ecografia abdominal')], tests.doc('santi_blood'), true);
select tests.ok((select event_date = '2026-09-20' and place = 'Imagens Médicas' and result_document_id = tests.doc('santi_blood')
                 from public.requested_exams where exam_name = 'Ecografia abdominal'),
  'Linking keeps the date and place already recorded for a done exam');
select tests.ok((tests.last_audit('requested_exam.link')).summary like 'Ecografia abdominal: result linked automatically%',
  'Automatic links say so');

-- Only a filed document of the same person, and one person per call.
select tests.fails($$select public.link_exam_results(array[(select id from ex where exam_name = 'Hemograma')], tests.doc('miguel_blood'))$$,
  'same person', 'Another person''s document can''t be a result');
select tests.fails($$select public.link_exam_results(array[(select id from ex where exam_name = 'Hemograma')], tests.doc('santi_own_upload'))$$,
  'same person', 'An unfiled upload can''t be a result');
select tests.fails($$select public.link_exam_results(array(select id from ex where exam_name in ('Hemograma', 'Holter')), tests.doc('santi_blood'))$$,
  'only update exams', 'Exams of two people can''t be linked in one call');
:as_gui
select tests.fails($$select public.link_exam_results(array[(select id from ex where exam_name = 'Hemograma')], null)$$,
  'only update exams', 'Gui cannot unlink Santi''s results');

-- Unlinking keeps the exam done; back to "booked" or "to do" drops the link.
:as_santi
select public.link_exam_results(array[(select id from ex where exam_name = 'HbA1c')], null);
select tests.ok((select status = 'done' and result_document_id is null from public.requested_exams where exam_name = 'HbA1c'),
  'Unlinking keeps the exam done');
select public.link_exam_results(array[(select id from ex where exam_name = 'HbA1c')], tests.doc('santi_blood'));
select public.update_requested_exams(array[(select id from ex where exam_name = 'HbA1c')], 'scheduled', '2026-12-01');
select tests.ok((select result_document_id is null from public.requested_exams where exam_name = 'HbA1c'),
  'Back to "booked" drops the link');
select public.link_exam_results(array[(select id from ex where exam_name = 'HbA1c')], tests.doc('santi_blood'));
select public.update_requested_exams(array[(select id from ex where exam_name = 'HbA1c')], 'to_do');
select tests.ok((select result_document_id is null from public.requested_exams where exam_name = 'HbA1c'),
  'Back to "to do" drops the link');

-- Moving the result to someone else, or deleting it, drops the links.
:as_miguel
select public.move_document(tests.doc('santi_blood'), tests.member('Gui'), true, 'Test');
select tests.ok(not exists (select 1 from public.requested_exams where result_document_id = tests.doc('santi_blood')),
  'Moving the result to someone else drops its links');
select tests.ok((select status = 'done' from public.requested_exams where exam_name = 'Hemograma'), '…and the exam stays done');
select public.move_document(tests.doc('santi_blood'), tests.member('Santi'), true, 'Back');
select public.link_exam_results(array[(select id from ex where exam_name = 'Hemograma')], tests.doc('santi_blood'));
select public.delete_document(tests.doc('santi_blood'), 'Test');
select tests.ok((select result_document_id is null from public.requested_exams where exam_name = 'Hemograma'),
  'Deleting the result drops its links');

rollback;
