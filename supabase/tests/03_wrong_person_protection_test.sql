-- Documents are never silently filed under the wrong person, and nobody sees
-- a document before its identity has been confirmed.
\ir roles.psql
begin;

-- Miguel selects himself, but the document says "Santiago Rocha".
:as_miguel
create temporary table upload as
  select (x ->> 'document_id')::uuid as id, x ->> 'storage_path' as path
  from public.create_document_upload(tests.member('Miguel'), 'santiago-ecg.pdf', 'application/pdf', 500) x;
select public.record_document_extraction((select id from upload), '{"patient_name": "Santiago Rocha"}',
  jsonb_build_object('suggested_member_id', tests.member('Santi'), 'by_member', jsonb_build_object(
    tests.member('Miguel')::text, jsonb_build_object('status', 'mismatch'),
    tests.member('Santi')::text, jsonb_build_object('status', 'match'))),
  'ecg', 'ECG', '2026-09-20', 'CUF', 'cardiology', 'Santiago Rocha', '2004-03-02');

-- Before confirmation the selected member must not see it.
:as_santi
select tests.ok((select count(*) from public.documents where id = (select id from upload)) = 0,
  'An unconfirmed upload is invisible to the member it might belong to');

:as_miguel
select tests.fails($$select public.confirm_document((select id from upload), tests.member('Miguel'), false,
    'ecg', 'ECG', '2026-09-20', 'CUF', 'cardiology', '{}', '[]')$$,
  'identity_confirmation_required', 'Filing under Miguel is refused while the name does not match');
select tests.ok((select status from public.documents where id = (select id from upload)) = 'ready_for_review', 'Nothing was filed');

-- Choosing the matching member files without extra confirmation.
select tests.ok((public.confirm_document((select id from upload), tests.member('Santi'), false,
    'ecg', 'ECG', '2026-09-20', 'CUF', 'cardiology', array['Health Records', 'Cardiology', 'ECGs', '2026', 'September'], '[]')
  ->> 'identity_override')::boolean = false,
  'Filing under Santi (identity match) succeeds without an override');
select tests.ok((select identity_status from public.documents where id = (select id from upload)) = 'match'
                and (select identity_confirmed_by from public.documents where id = (select id from upload)) is null,
  'The document records a clean identity match');

-- Explicitly overriding is possible, but recorded.
create temporary table upload2 as
  select (x ->> 'document_id')::uuid as id from public.create_document_upload(tests.member('Miguel'), 'unclear.pdf', 'application/pdf', 500) x;
select public.record_document_extraction((select id from upload2), '{}',
  jsonb_build_object('by_member', jsonb_build_object(tests.member('Miguel')::text, jsonb_build_object('status', 'uncertain'))),
  'blood_test', 'Blood Test', '2026-09-21', null, 'laboratory', null, null);
select public.confirm_document((select id from upload2), tests.member('Miguel'), true,
  'blood_test', 'Blood Test', '2026-09-21', null, 'laboratory', '{}', '[]');
select tests.ok((select identity_status from public.documents where id = (select id from upload2)) = 'uncertain'
                and (select identity_confirmed_by from public.documents where id = (select id from upload2)) = tests.user_id('miguel'),
  'An acknowledged override stores who confirmed the identity');
select tests.ok(((tests.last_audit('document.file')).metadata ->> 'identity_override')::boolean,
  'The override is flagged in the audit log');

-- A document never extracted (no identity check at all) also needs confirmation.
create temporary table upload3 as
  select (x ->> 'document_id')::uuid as id from public.create_document_upload(null, 'scan.png', 'image/png', 500) x;
select public.mark_document_failed((select id from upload3), 'Could not read the file');
select tests.fails($$select public.confirm_document((select id from upload3), tests.member('Gui'), false,
    'other', 'Scan', null, null, 'other', '{}', '[]')$$,
  'identity_confirmation_required', 'An unchecked document cannot be filed without confirmation');

-- The rule also holds below the API, as a table constraint.
:as_system
select tests.fails($$update public.documents set status = 'ready_for_review' where id = (select id from upload3);
  update public.documents set member_id = tests.member('Gui'), status = 'filed', identity_status = 'mismatch'
  where id = (select id from upload3)$$,
  'filed_documents_have_confirmed_identity', 'Even a direct database write cannot file an unconfirmed identity');

-- A member filing their own upload: if it is not theirs, they must confirm.
:as_santi
select public.record_document_extraction(tests.doc('santi_own_upload'), '{}',
  jsonb_build_object('by_member', jsonb_build_object(tests.member('Santi')::text, jsonb_build_object('status', 'mismatch'))),
  'blood_test', 'Blood Test', '2026-09-01', null, 'laboratory', 'Guilherme Rocha', null);
select tests.fails($$select public.confirm_document(tests.doc('santi_own_upload'), tests.member('Santi'), false,
    'blood_test', 'Blood Test', '2026-09-01', null, 'laboratory', '{}', '[]')$$,
  'identity_confirmation_required', 'A member is warned when their own upload names someone else');
select tests.fails($$select public.confirm_document(tests.doc('santi_own_upload'), tests.member('Gui'), true,
    'blood_test', 'Blood Test', '2026-09-01', null, 'laboratory', '{}', '[]')$$,
  'permission', 'A member cannot file their upload into someone else''s profile');

rollback;
