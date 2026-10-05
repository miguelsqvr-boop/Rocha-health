-- Every sensitive action is logged, and the log cannot be rewritten.
\ir roles.psql
begin;

select tests.ok((tests.last_audit('document.file')).summary = 'ECG — Gui — 21 Aug 2026',
  'Filing is logged as "<type> — <member> — <date>"');
select tests.ok((tests.last_audit('document.upload')).actor_name = 'Santi'
                and (tests.last_audit('document.upload')).target_member_name = 'Santi',
  'Uploads record who uploaded and for whom');
select tests.ok(tests.audit_count('member.invite') = 3 and tests.audit_count('member.activate') = 2,
  'Invitations and activations are logged');

-- Reads are logged with request context.
:as_santi
select set_config('request.headers', '{"x-rh-client-ip": "203.0.113.7", "x-rh-user-agent": "Safari/iPhone"}', true);
select public.log_access('document.view', tests.member('Santi'), 'document', tests.doc('santi_blood'), 'Blood Test — 8 Sep 2026');
select tests.ok((tests.last_audit('document.view')).actor_name = 'Santi'
                and (tests.last_audit('document.view')).summary = 'Blood Test — 8 Sep 2026'
                and (tests.last_audit('document.view')).ip_address = '203.0.113.7'
                and (tests.last_audit('document.view')).user_agent = 'Safari/iPhone',
  '"Santi viewed: Blood Test — 8 Sep 2026" is logged with IP and device');
select tests.fails($$select public.log_access('something.else', null)$$, 'Unknown audit action',
  'Only known access events can be logged');

-- A member cannot fake "view as" in the log.
select set_config('request.headers', jsonb_build_object('x-rh-view-as', tests.member('Gui'))::text, true);
select public.log_access('document.view', tests.member('Santi'), 'document', tests.doc('santi_blood'));
select tests.ok((tests.last_audit('document.view')).acting_as_member_id is null,
  'A non-admin cannot mark their actions as "viewing as" someone');

:as_miguel
select set_config('request.headers', jsonb_build_object('x-rh-view-as', tests.member('Santi'))::text, true);
select public.log_access('document.view', tests.member('Santi'), 'document', tests.doc('santi_blood'));
select tests.ok((tests.last_audit('document.view')).acting_as_member_id = tests.member('Santi')
                and (tests.last_audit('document.view')).actor_name = 'Miguel',
  'Actions during "View as Santi" are attributed to Miguel, acting as Santi');

-- Direct edits are captured with before/after values.
update public.family_members set date_of_birth = '2004-03-03' where id = tests.member('Santi');
select tests.ok((tests.last_audit('family_member.update')).before_data ->> 'date_of_birth' = '2004-03-02'
                and (tests.last_audit('family_member.update')).after_data ->> 'date_of_birth' = '2004-03-03'
                and (tests.last_audit('family_member.update')).after_data ? 'updated_at' = false,
  'Profile edits store only the changed fields, before and after');

-- Append-only, even for the database owner.
:as_system
select tests.fails($$update public.audit_log set summary = 'nothing happened'$$, 'append-only',
  'Audit entries cannot be edited');
select tests.fails($$delete from public.audit_log$$, 'append-only', 'Audit entries cannot be deleted');
:as_miguel
select tests.fails($$delete from public.audit_log$$, 'permission denied', 'The Super Admin cannot delete audit entries');

rollback;
