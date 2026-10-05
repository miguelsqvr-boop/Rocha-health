-- A family member can only ever reach their own health information, even
-- with direct API requests that name another member's ids.
\ir roles.psql
begin;

:as_santi
select tests.ok((select count(*) from public.family_members) = 1
                and (select display_name from public.family_members) = 'Santi',
  'Santi sees only his own profile, not the family list');
select tests.ok((select count(*) from public.family_members where id = tests.member('Miguel')) = 0,
  'Santi cannot fetch Miguel''s profile by id');
select tests.ok((select count(*) from public.documents where member_id = tests.member('Miguel')) = 0,
  'Santi cannot fetch Miguel''s documents by member_id');
select tests.ok((select count(*) from public.documents where id = tests.doc('miguel_blood')) = 0,
  'Santi cannot fetch Miguel''s blood test by document id');
select tests.ok((select count(*) from public.documents d where d.status = 'filed') = 1,
  'Santi sees exactly one filed document: his own blood test');
select tests.ok((select count(*) from public.health_results) = 2
                and not exists (select 1 from public.health_results where member_id <> tests.member('Santi')),
  'Santi sees only his own lab results');
select tests.ok((select count(*) from public.health_results where analyte_name ilike '%hba1c%') = 1,
  'Searching results for HbA1c returns only Santi''s value');
select tests.ok(not exists (select 1 from public.member_timeline where member_id <> tests.member('Santi')),
  'Timeline view only contains Santi''s events');
select tests.ok((select count(*) from public.medications) = 1, 'Santi sees only his own supplements');
select tests.ok((select count(*) from public.audit_log) = 0, 'Members cannot read the audit log');
select tests.ok((select count(*) from public.invitations) = 0, 'Members cannot read invitations');
select tests.ok(not exists (select 1 from public.notifications where subject_member_id <> tests.member('Santi')),
  'Santi only receives notifications about himself');

-- Writes against other members.
select tests.fails($$insert into public.medications (family_id, member_id, name)
  select family_id, tests.member('Miguel'), 'Injected' from public.family_members limit 1$$,
  'row-level security', 'Santi cannot add a medication to Miguel''s profile');
select tests.fails($$insert into public.wellness_entries (family_id, member_id, domain, metric, value, recorded_at)
  select family_id, tests.member('Gui'), 'sleep', 'sleep_hours', 8, now() from public.family_members limit 1$$,
  'row-level security', 'Santi cannot add wellness data for Gui');
select tests.ok(tests.rows_affected($$update public.family_members set display_name = 'Hacked'
  where id = tests.member('Miguel')$$) = 0, 'Santi cannot edit Miguel''s profile');
select tests.ok(tests.rows_affected($$delete from public.medications where member_id = tests.member('Miguel')$$) = 0,
  'Santi cannot delete Miguel''s medications');
select tests.ok(tests.rows_affected($$update public.health_results set value_numeric = 1
  where member_id = tests.member('Miguel')$$) = 0, 'Santi cannot change Miguel''s results');
select tests.ok(tests.rows_affected($$update public.health_results set value_numeric = 1$$) = 0,
  'Santi cannot edit his own extracted lab results (corrections go through a request)');
select tests.fails($$update public.documents set member_id = tests.member('Santi')
  where id = tests.doc('miguel_blood')$$, 'permission denied', 'Santi cannot reassign documents directly');
select tests.fails($$insert into public.audit_log (action) values ('forged')$$, 'permission denied',
  'Nobody can write to the audit log directly');

-- Own profile: permitted fields only.
select tests.ok(tests.rows_affected($$update public.family_members set display_name = 'Santiago', phone = '+351 900 000 000'
  where id = tests.member('Santi')$$) = 1, 'Santi can edit his display name and phone');
select tests.fails($$update public.family_members set role = 'super_admin' where id = tests.member('Santi')$$,
  'Ask the Super Admin', 'Santi cannot promote himself to Super Admin');
select tests.fails($$update public.family_members set date_of_birth = '1999-01-01' where id = tests.member('Santi')$$,
  'Ask the Super Admin', 'Santi cannot change the identity fields used for document matching');

-- Own data.
select tests.ok(tests.rows_affected($$insert into public.wellness_entries (family_id, member_id, domain, metric, value, unit, recorded_at)
  select family_id, id, 'sleep', 'sleep_hours', 7.5, 'h', now() from public.family_members$$) = 1,
  'Santi can add his own wellness data');
select tests.ok(tests.rows_affected($$insert into public.correction_requests (family_id, member_id, entity_type, entity_id, message)
  select family_id, member_id, 'health_result', id, 'This LDL value looks wrong' from public.health_results limit 1$$) = 1,
  'Santi can request a correction to his own record');
select tests.fails($$insert into public.correction_requests (family_id, member_id, entity_type, message)
  values ((select family_id from public.family_members), tests.member('Miguel'), 'other', 'x')$$,
  'row-level security', 'Santi cannot file correction requests about Miguel');

-- RPCs re-check permissions server-side.
select tests.fails($$select public.create_document_upload(tests.member('Miguel'), 'x.pdf', 'application/pdf', 10)$$,
  'permission', 'Santi cannot upload documents for Miguel');
select tests.fails($$select public.create_document_upload(null, 'x.pdf', 'application/pdf', 10)$$,
  'Super Admin', 'Only the Super Admin can upload without choosing a member');
select tests.fails($$select public.move_document(tests.doc('santi_blood'), tests.member('Gui'), true)$$,
  'Only the Super Admin', 'Santi cannot move documents');
select tests.fails($$select public.confirm_document(tests.doc('pending_for_santi'), tests.member('Santi'), true,
  'blood_test', 't', '2026-01-01', null, null, '{}', '[]')$$,
  'not found', 'Santi cannot confirm a document Miguel is still reviewing');
select tests.fails($$select public.log_access('document.view', tests.member('Miguel'), 'document', tests.doc('miguel_blood'))$$,
  'do not have access', 'Santi cannot even log a view of Miguel''s records');
select tests.fails($$select public.log_access('view_as.start', tests.member('Gui'))$$,
  'Only the Super Admin', 'Santi cannot use View as');
select tests.fails($$select public.create_invitation(tests.member('Alice'), 'alice@rocha.family')$$,
  'Only the Super Admin', 'Santi cannot invite family members');
select tests.fails($$select public.delete_document(tests.doc('santi_blood'))$$,
  'permission', 'Santi cannot delete a filed document');

-- Signed in, but not in any family.
:as_stranger
select tests.ok((select count(*) from public.family_members) = 0
                and (select count(*) from public.documents) = 0
                and (select count(*) from public.health_results) = 0
                and (select count(*) from public.families) = 0,
  'A signed-in stranger sees nothing');
select tests.fails($$select public.bootstrap_family('Takeover', 'Mallory')$$, 'already set up',
  'Nobody can create a second family once the family exists');

-- Signed out.
:as_anon
select tests.fails($$select count(*) from public.documents$$, 'permission denied', 'Signed-out visitors cannot query documents');
select tests.fails($$select count(*) from public.health_results$$, 'permission denied', 'Signed-out visitors cannot query results');
select tests.fails($$select public.create_document_upload(null, 'x.pdf', 'application/pdf', 10)$$, 'permission denied',
  'Signed-out visitors cannot call RPCs');

rollback;
