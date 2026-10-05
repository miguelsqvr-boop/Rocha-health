-- Granular sharing is not exposed in the UI yet, but the access rules already
-- honour grants: view only, upload only, full, temporary, doctor/caregiver.
\ir roles.psql
begin;

:as_doctor
select tests.ok((select count(*) from public.documents) = 0, 'A doctor with no grant sees nothing');

:as_miguel
insert into public.member_access_grants (family_id, subject_member_id, grantee_user_id, access_level, relationship, expires_at, granted_by)
select family_id, id, tests.user_id('doctor'), 'view', 'doctor', now() + interval '30 days', auth.uid()
from public.family_members where id = tests.member('Santi');
select tests.ok((tests.last_audit('access_grant.create')).target_member_name = 'Santi', 'Granting access is audited');

:as_doctor
select tests.ok((select count(*) from public.documents) = 1
                and (select count(*) from public.health_results) = 2
                and not exists (select 1 from public.health_results where member_id <> tests.member('Santi')),
  'A doctor with temporary view access sees Santi''s filed records only');
select tests.ok((select count(*) from public.documents where id = tests.doc('pending_for_santi')) = 0,
  'View access does not include unconfirmed uploads');
select tests.fails($$select public.create_document_upload(tests.member('Santi'), 'x.pdf', 'application/pdf', 10)$$,
  'not active', 'View-only access cannot upload');

-- Expired grants stop working.
:as_system
update public.member_access_grants set expires_at = now() - interval '1 minute' where grantee_user_id = tests.user_id('doctor');
:as_doctor
select tests.ok((select count(*) from public.documents) = 0, 'An expired grant gives no access');

-- Upload-only for a family member: can upload for Ben, cannot read Ben.
:as_miguel
insert into public.member_access_grants (family_id, subject_member_id, grantee_user_id, access_level, granted_by)
select family_id, id, tests.user_id('santi'), 'upload', auth.uid() from public.family_members where id = tests.member('Ben');
:as_santi
select tests.ok((select count(*) from public.family_members where id = tests.member('Ben')) = 0,
  'Upload-only access does not reveal Ben''s profile');
select tests.ok((select (x ->> 'document_id') is not null
                 from public.create_document_upload(tests.member('Ben'), 'ben.pdf', 'application/pdf', 10) x),
  'Upload-only access lets Santi upload for Ben');

-- Revoking takes effect immediately.
:as_miguel
update public.member_access_grants set revoked_at = now() where grantee_user_id = tests.user_id('santi');
:as_santi
select tests.fails($$select public.create_document_upload(tests.member('Ben'), 'ben2.pdf', 'application/pdf', 10)$$,
  'permission', 'A revoked grant no longer allows uploads');

-- Members cannot grant themselves access.
select tests.fails($$insert into public.member_access_grants (family_id, subject_member_id, grantee_user_id, access_level)
  values ((select family_id from public.family_members limit 1), tests.member('Miguel'), auth.uid(), 'full')$$,
  'row-level security', 'A member cannot grant himself access to someone else');

rollback;
