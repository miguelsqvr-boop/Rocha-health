-- Moving a document corrects who it belongs to; results and access follow.
\ir roles.psql
begin;

:as_miguel
select public.record_document_extraction(tests.doc('pending_for_santi'), '{}',
  jsonb_build_object('by_member', jsonb_build_object(
    tests.member('Santi')::text, jsonb_build_object('status', 'match'),
    tests.member('Gui')::text, jsonb_build_object('status', 'mismatch'))),
  'blood_test', 'Blood Test', '2026-09-30', 'CUF', 'laboratory', 'Santiago Rocha', null);
select public.confirm_document(tests.doc('pending_for_santi'), tests.member('Santi'), false,
  'blood_test', 'Blood Test', '2026-09-30', 'CUF', 'laboratory', '{}',
  jsonb_build_array(jsonb_build_object('analyte_name', 'Ferritin', 'value_numeric', 80, 'unit', 'ng/mL')));

-- Move Miguel's ECG to Santi (no identity check recorded -> needs confirmation).
select tests.fails($$select public.move_document(tests.doc('miguel_ecg'), tests.member('Santi'), false, 'Wrong person')$$,
  'identity_confirmation_required', 'Moving to a member the document was not checked against needs confirmation');
select public.move_document(tests.doc('miguel_ecg'), tests.member('Santi'), true, 'Uploaded under the wrong person');
select tests.ok((tests.last_audit('document.move')).summary = 'ECG — Miguel → Santi'
                and (tests.last_audit('document.move')).before_data ->> 'member_name' = 'Miguel'
                and (tests.last_audit('document.move')).after_data ->> 'member_name' = 'Santi'
                and (tests.last_audit('document.move')).metadata ->> 'reason' = 'Uploaded under the wrong person',
  'The move is logged as "ECG — Miguel → Santi" with the reason');

-- Move Gui's ECG to Santi: Gui must lose access immediately.
:as_gui
select tests.ok((select count(*) from public.documents where id = tests.doc('gui_ecg')) = 1, 'Gui sees his ECG before the move');
select public.log_access('document.view', tests.member('Gui'), 'document', tests.doc('gui_ecg'), 'ECG — 21 Aug 2026');
:as_miguel
select public.move_document(tests.doc('gui_ecg'), tests.member('Santi'), true);
:as_gui
select tests.ok((select count(*) from public.documents where id = tests.doc('gui_ecg')) = 0, 'Gui loses access once it is moved away');
:as_santi
select tests.ok((select count(*) from public.documents where id in (tests.doc('miguel_ecg'), tests.doc('gui_ecg'))) = 2,
  'Santi gains access to both moved documents');

-- Results follow their document.
:as_miguel
select public.move_document(tests.doc('pending_for_santi'), tests.member('Gui'), true);
select tests.ok((select member_id from public.health_results where analyte_name = 'Ferritin') = tests.member('Gui'),
  'Lab results move together with their document');
select tests.ok((select count(*) from public.audit_log where action = 'health_result.update') = 0,
  'Cascaded result moves are covered by the single move entry, not 1 entry per result');
:as_santi
select tests.ok((select count(*) from public.health_results where analyte_name = 'Ferritin') = 0,
  'Santi can no longer see the moved results');
:as_gui
select tests.ok((select count(*) from public.health_results where analyte_name = 'Ferritin') = 1,
  'Gui can see the results that were moved to him');
select tests.ok(exists (select 1 from public.notifications where title like '%added to your health records'),
  'Gui is notified that a record was added');

rollback;
