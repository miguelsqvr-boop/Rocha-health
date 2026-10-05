-- Invitations, deactivation and the "at least one Super Admin" rule.
\ir roles.psql
begin;

-- Ben was invited but has not accepted: no access yet.
:as_ben
select tests.ok((select count(*) from public.family_members) = 0, 'An invited member has no access before accepting');

-- Someone else cannot use Ben's invitation.
:as_stranger
select tests.fails($$select public.accept_invitation(tests.token('ben'))$$, 'different email',
  'An invitation only works for the email it was sent to');
select tests.fails($$select public.accept_invitation('not-a-real-token')$$, 'invalid or has expired',
  'A made-up token is rejected');

:as_ben
select tests.ok(public.accept_invitation(tests.token('ben')) = tests.member('Ben'), 'Ben accepts his invitation');
select tests.ok((select count(*) from public.family_members) = 1, 'Ben now sees his own profile');
select tests.fails($$select public.accept_invitation(tests.token('ben'))$$, 'already linked',
  'An invitation cannot be reused');

-- Santi's old token was consumed.
:as_stranger
select tests.fails($$select public.accept_invitation(tests.token('santi'))$$, 'invalid or has expired',
  'An accepted invitation cannot be used again by anyone');

-- Deactivating Gui removes all of his access.
:as_miguel
select tests.ok(tests.rows_affected($$update public.family_members set status = 'deactivated' where id = tests.member('Gui')$$) = 1,
  'Miguel deactivates Gui');
:as_gui
select tests.ok((select count(*) from public.family_members) = 0
                and (select count(*) from public.documents) = 0
                and (select count(*) from public.health_results) = 0
                and (select count(*) from public.notifications) = 0,
  'A deactivated member can no longer see anything, including his own records');
select tests.fails($$select public.create_document_upload(tests.member('Gui'), 'x.pdf', 'application/pdf', 10)$$,
  'not active', 'A deactivated member cannot upload');
:as_miguel
select tests.ok((select count(*) from public.documents where member_id = tests.member('Gui')) = 1,
  'Gui''s records are kept and remain visible to the Super Admin');
update public.family_members set status = 'active' where id = tests.member('Gui');
:as_gui
select tests.ok((select count(*) from public.documents) = 1, 'Reactivating Gui restores his access');

-- The family always keeps an active Super Admin.
:as_miguel
select tests.fails($$update public.family_members set role = 'member' where id = tests.member('Miguel')$$,
  'at least one active Super Admin', 'The last Super Admin cannot demote himself');
select tests.fails($$update public.family_members set status = 'deactivated' where id = tests.member('Miguel')$$,
  'cannot deactivate your own account', 'The Super Admin cannot deactivate himself');
select tests.fails($$delete from public.family_members where id = tests.member('Miguel')$$,
  'cannot delete your own profile', 'The Super Admin cannot delete himself');

-- Promoting a second Super Admin works and grants full family access.
update public.family_members set role = 'super_admin' where id = tests.member('Santi');
:as_santi
select tests.ok((select count(*) from public.family_members) = 5, 'A promoted Super Admin sees the whole family');
:as_miguel
update public.family_members set role = 'member' where id = tests.member('Santi');
:as_santi
select tests.ok((select count(*) from public.family_members) = 1, 'Demotion takes effect immediately');

rollback;
