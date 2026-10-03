-- The Super Admin manages the whole family, and only their own family.
\ir roles.psql
begin;

:as_miguel
select tests.ok((select count(*) from public.family_members) = 5,
  'Miguel sees all five Rocha family members');
select tests.ok(not exists (select 1 from public.family_members where display_name = 'Olivia'),
  'Miguel does not see members of another family');
select tests.ok((select count(*) from public.documents) = 6,
  'Miguel sees every Rocha document, including pending uploads');
select tests.ok((select count(*) from public.health_results) = 4, 'Miguel sees every Rocha lab result');
select tests.ok((select count(*) from public.medications) = 1, 'Miguel sees members'' supplements');
select tests.ok((select count(*) from public.audit_log) > 0
                and not exists (select 1 from public.audit_log where family_id <> (select id from public.families)),
  'Miguel reads his family''s audit log and nothing else');

-- Manage members.
select tests.ok(tests.rows_affected($$update public.family_members set legal_name = 'Alice M. Rocha', name_aliases = '{"Alice Maria Rocha"}'
  where id = tests.member('Alice')$$) = 1, 'Miguel can edit identity fields on any profile');
select tests.ok(tests.rows_affected($$insert into public.family_members (family_id, display_name)
  select id, 'Avó' from public.families$$) = 1, 'Miguel can create a family member profile');
select tests.ok(tests.rows_affected($$insert into public.family_members (family_id, display_name)
  select id, 'Avô' from public.families returning id$$) = 1,
  'Miguel can read back the profile he just created (insert ... returning, as the API does)');
select tests.fails($$insert into public.family_members (family_id, display_name, user_id, status)
  select id, 'Sneaky', tests.user_id('stranger'), 'active' from public.families$$,
  'Send an invitation', 'New profiles cannot be linked to a login except through an invitation');
select tests.fails($$update public.family_members set user_id = tests.user_id('stranger') where id = tests.member('Alice')$$,
  'only change through an invitation', 'Miguel cannot attach an arbitrary login to a profile');
select tests.fails($$update public.family_members set status = 'active' where id = tests.member('Alice')$$,
  'accept their invitation', 'A profile without a login cannot be marked active');
select tests.fails($$insert into public.family_members (family_id, display_name)
  values ('99999999-9999-4999-8999-999999999999', 'Spy')$$,
  'row-level security', 'Miguel cannot add people to another family');

-- Data on behalf of any member.
select tests.ok(tests.rows_affected($$insert into public.wellness_entries (family_id, member_id, domain, metric, value, unit, recorded_at)
  select family_id, tests.member('Gui'), 'fitness', 'steps', 10432, 'steps', now() from public.family_members limit 1$$) = 1,
  'Miguel can add wellness data for Gui');
select tests.ok((select (x ->> 'document_id') is not null
                 from public.create_document_upload(tests.member('Alice'), 'alice.pdf', 'application/pdf', 100) x),
  'Miguel can upload for a member who has no login yet');
select tests.ok((select (x ->> 'document_id') is not null
                 from public.create_document_upload(null, 'unknown.pdf', 'application/pdf', 100) x),
  'Miguel can upload and let AI identify the patient');

-- Corrections are audited with before/after values.
select tests.ok(tests.rows_affected($$update public.health_results set value_numeric = 5.4
  where member_id = tests.member('Miguel') and analyte_name = 'HbA1c'$$) = 1,
  'Miguel can correct an extracted value');
select tests.ok((tests.last_audit('health_result.update')).summary = 'HbA1c 5.6 → 5.4'
                and ((tests.last_audit('health_result.update')).before_data ->> 'value_numeric')::numeric = 5.6
                and ((tests.last_audit('health_result.update')).after_data ->> 'value_numeric')::numeric = 5.4
                and (tests.last_audit('health_result.update')).actor_name = 'Miguel',
  'The correction is logged as "HbA1c 5.6 → 5.4" with before/after values');

-- View as: allowed for the Super Admin and logged.
select public.log_access('view_as.start', tests.member('Santi'), 'family_member', tests.member('Santi'), 'Viewing as Santi');
select tests.ok((tests.last_audit('view_as.start')).target_member_name = 'Santi'
                and (tests.last_audit('view_as.start')).actor_name = 'Miguel',
  'Starting "View as Santi" is recorded in the audit log');

-- Another family's admin sees none of it.
:as_outsider
select tests.ok((select count(*) from public.family_members) = 1
                and (select count(*) from public.documents) = 0
                and (select count(*) from public.health_results) = 0
                and (select count(*) from public.audit_log where family_id <> '99999999-9999-4999-8999-999999999999') = 0,
  'Another family''s Super Admin sees nothing of the Rocha family');
select tests.fails($$select public.move_document(tests.doc('santi_blood'), tests.member('Gui'), true)$$,
  'Only the Super Admin', 'Another family''s Super Admin cannot move Rocha documents');
select tests.fails($$select public.log_access('view_as.start', tests.member('Santi'))$$,
  'Only the Super Admin', 'Another family''s Super Admin cannot view as a Rocha member');

rollback;
