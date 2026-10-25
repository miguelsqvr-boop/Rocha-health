-- Exam requests: filed like any document, with the doctor, specialty and each
-- requested exam stored. The exams follow the document's person and access.
\ir roles.psql
begin;

-- Miguel files a cardiology request for Santi with three exams.
:as_miguel
select public.record_document_extraction(tests.doc('pending_for_santi'), '{}',
  jsonb_build_object('by_member', jsonb_build_object(tests.member('Santi')::text, jsonb_build_object('status', 'match'))),
  'exam_request', 'Exam Request', '2026-10-02', 'Hospital da Luz', 'consultations', 'Santiago Rocha', null);
select tests.ok((public.confirm_document(tests.doc('pending_for_santi'), tests.member('Santi'), false,
  'exam_request', 'Exam Request', '2026-10-02', 'Hospital da Luz', 'consultations', '{}', '[]',
  '  Ana Costa ', 'cardiology',
  '[{"exam_name": "Ecocardiograma", "exam_type": "echocardiogram"},
    {"exam_name": "Holter 24h", "exam_type": "holter"},
    {"exam_name": "Hemograma", "exam_type": "blood_test", "body_site": ""},
    {"exam_name": "   ", "exam_type": "other"}]') ->> 'requested_exams')::int = 3,
  'Filing an exam request stores each named exam (blank names are skipped)');
select tests.ok((select doctor_name = 'Ana Costa' and specialty = 'cardiology'
                 from public.documents where id = tests.doc('pending_for_santi')),
  'The doctor (trimmed) and specialty are saved on the document');
select tests.ok((select array_agg(exam_type order by sort_order) = array['echocardiogram', 'holter', 'blood_test']
                        and bool_and(member_id = tests.member('Santi'))
                        and bool_and(body_site is null or body_site <> '')
                 from public.requested_exams where source_document_id = tests.doc('pending_for_santi')),
  'Exams keep their order and belong to Santi');
select tests.ok((tests.last_audit('document.file')).after_data ->> 'requested_exams' = '3'
                and (tests.last_audit('document.file')).after_data ->> 'specialty' = 'cardiology',
  'Filing is audited with the number of exams, doctor and specialty');
select tests.ok(tests.audit_count('requested_exam.create') = 0,
  'The exams are covered by the filing entry, not one entry each');

-- Read access follows the person.
:as_santi
select tests.ok((select count(*) from public.requested_exams) = 3, 'Santi sees the exams requested for him');
select tests.ok((select count(*) from public.requested_exams re join public.documents d on d.id = re.source_document_id) = 3,
  'Santi can read the request the exams came from');
:as_gui
select tests.ok((select count(*) from public.requested_exams) = 0, 'Gui does not see Santi''s exam requests');
:as_outsider
select tests.ok((select count(*) from public.requested_exams) = 0, 'Another family sees nothing');
:as_anon
select tests.fails($$select count(*) from public.requested_exams$$, 'permission denied', 'Signed-out visitors cannot read requested exams');

-- Nobody writes requested exams directly, not even the Super Admin.
:as_santi
select tests.fails($$insert into public.requested_exams (family_id, member_id, source_document_id, exam_name)
                     select family_id, member_id, id, 'MRI' from public.documents where id = tests.doc('pending_for_santi')$$,
  'permission denied', 'Santi cannot add exams to his request directly');
:as_miguel
select tests.fails($$update public.requested_exams set exam_name = 'X' where source_document_id = tests.doc('pending_for_santi')$$,
  'permission denied', 'Direct updates are refused for the Super Admin too');
select tests.fails($$delete from public.requested_exams$$, 'permission denied', 'Direct deletes are refused');

-- The Super Admin corrects the request: doctor, specialty and the exam list.
select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}', 'Ana Costa Silva', 'cardiology',
  '[{"exam_name": "Ecocardiograma transtorácico", "exam_type": "echocardiogram"},
    {"exam_name": "Prova de esforço", "exam_type": "stress_test"}]');
select tests.ok((select array_agg(exam_name order by sort_order) = array['Ecocardiograma transtorácico', 'Prova de esforço']
                 from public.requested_exams where source_document_id = tests.doc('pending_for_santi')),
  'Editing replaces the list of exams');
select tests.ok((tests.last_audit('document.update')).before_data -> 'requested_exams' -> 1 ->> 'exam_name' = 'Holter 24h'
                and (tests.last_audit('document.update')).after_data ->> 'doctor_name' = 'Ana Costa Silva',
  'The edit is audited with the exams and doctor before and after');
select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}');
select tests.ok((select doctor_name = 'Ana Costa Silva' and specialty = 'cardiology' from public.documents where id = tests.doc('pending_for_santi'))
                and (select count(*) from public.requested_exams where source_document_id = tests.doc('pending_for_santi')) = 2,
  'Leaving the new fields out (older app versions) changes nothing');
select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}', '', '');
select tests.ok((select doctor_name is null and specialty is null from public.documents where id = tests.doc('pending_for_santi')),
  'An empty doctor or specialty clears it');
select tests.fails($$select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}', null, 'Not A Code')$$, 'check constraint', 'A specialty must be a code');

:as_santi
select tests.fails($$select public.update_document_details(tests.doc('pending_for_santi'), 'exam_request', 'Exam Request', '2026-10-02',
  'Hospital da Luz', 'consultations', '{}', null, null, '[]')$$,
  'Only the Super Admin', 'A member cannot edit the request');

-- Moving the request to another person moves its exams and their access.
:as_miguel
select public.move_document(tests.doc('pending_for_santi'), tests.member('Gui'), true, 'Wrong child');
select tests.ok((select bool_and(member_id = tests.member('Gui')) from public.requested_exams
                 where source_document_id = tests.doc('pending_for_santi')),
  'The exams move with their request');
:as_santi
select tests.ok((select count(*) from public.requested_exams) = 0, 'Santi loses access once it is moved away');
:as_gui
select tests.ok((select count(*) from public.requested_exams) = 2, 'Gui gains access');

-- Deleting the request removes its exams.
:as_miguel
select public.delete_document(tests.doc('pending_for_santi'), 'Duplicate');
select tests.ok((tests.last_audit('document.delete')).before_data ->> 'requested_exams' = '2',
  'Deleting is audited with the number of exams removed');
:as_system
select tests.ok((select count(*) from public.requested_exams where source_document_id = tests.doc('pending_for_santi')) = 0,
  'Deleting a request removes its exams');

-- Documents filed by older app versions (no new arguments) work as before.
:as_miguel
select public.record_document_extraction(tests.doc('santi_own_upload'), '{}', '{}',
  'blood_test', 'Blood Test', '2026-09-30', 'CUF', 'laboratory', null, null);
select tests.ok((public.confirm_document(tests.doc('santi_own_upload'), tests.member('Santi'), true,
  'blood_test', 'Blood Test', '2026-09-30', 'CUF', 'laboratory', '{}') ->> 'requested_exams')::int = 0,
  'confirm_document without the new arguments still files the document');

rollback;
