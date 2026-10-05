-- The Rocha family, built through the same RPCs and policies the app uses.
--   Miguel  Super Admin (active)
--   Santi   member (active)       Gui  member (active)
--   Ben     member (invited, has not accepted)
--   Alice   member (profile only, no login)
-- Plus a second family (Outsider), a doctor with no family membership, and a
-- signed-in stranger.
\ir roles.psql

insert into tests.users (name, id, email) values
  ('miguel',   '11111111-1111-4111-8111-111111111111', 'miguel@rocha.family'),
  ('santi',    '22222222-2222-4222-8222-222222222222', 'santi@rocha.family'),
  ('gui',      '33333333-3333-4333-8333-333333333333', 'gui@rocha.family'),
  ('ben',      '44444444-4444-4444-8444-444444444444', 'ben@rocha.family'),
  ('outsider', '66666666-6666-4666-8666-666666666666', 'admin@outsider.family'),
  ('doctor',   '77777777-7777-4777-8777-777777777777', 'doctor@clinic.example'),
  ('stranger', '88888888-8888-4888-8888-888888888888', 'stranger@example.com');
insert into auth.users (id, email) select id, email from tests.users;

-- Miguel sets up the family and becomes Super Admin.
:as_miguel
select public.bootstrap_family('Rocha', 'Miguel', 'Miguel Vieira da Rocha', '1980-05-14');

insert into public.family_members (family_id, display_name, legal_name, date_of_birth, sex, sort_order)
select f.id, v.display_name, v.legal_name, v.dob::date, v.sex, v.sort_order
from public.families f,
  (values ('Santi', 'Santiago Rocha', '2004-03-02', 'male', 1),
          ('Gui', 'Guilherme Rocha', '2007-07-19', 'male', 2),
          ('Ben', 'Benjamim Rocha', '2010-11-30', 'male', 3),
          ('Alice', 'Alice Rocha', '2014-01-08', 'female', 4)) as v(display_name, legal_name, dob, sex, sort_order);

insert into tests.members select display_name, id from public.family_members;  -- stable ids for tests
select tests.remember_token('santi', public.create_invitation(tests.member('Santi'), 'santi@rocha.family'));
select tests.remember_token('gui', public.create_invitation(tests.member('Gui'), 'gui@rocha.family'));
select tests.remember_token('ben', public.create_invitation(tests.member('Ben'), 'ben@rocha.family'));

:as_santi
select public.accept_invitation(tests.token('santi'));
:as_gui
select public.accept_invitation(tests.token('gui'));

-- A second, unrelated family on the same database.
:as_system
insert into public.families (id, name) values ('99999999-9999-4999-8999-999999999999', 'Outsider');
insert into public.family_members (family_id, user_id, role, status, display_name)
values ('99999999-9999-4999-8999-999999999999', tests.user_id('outsider'), 'super_admin', 'active', 'Olivia');

-- Documents. Miguel uploads and files on behalf of the family.
:as_miguel
create temporary table fixture_upload (label text, member text, title text, doc_type text, doc_date date, results jsonb, assessment jsonb);
insert into fixture_upload values
  ('santi_blood', 'Santi', 'Blood Test', 'blood_test', '2026-09-08',
     '[{"code": "hba1c", "analyte_name": "HbA1c", "value_numeric": 5.2, "unit": "%"},
       {"code": "ldl_cholesterol", "analyte_name": "LDL cholesterol", "value_numeric": 98, "unit": "mg/dL"}]', null),
  ('miguel_blood', 'Miguel', 'Blood Test', 'blood_test', '2026-09-12',
     '[{"code": "hba1c", "analyte_name": "HbA1c", "value_numeric": 5.6, "unit": "%"},
       {"code": "ldl_cholesterol", "analyte_name": "LDL cholesterol", "value_numeric": 142, "unit": "mg/dL", "confidence": "needs_review"}]', null),
  ('miguel_ecg', 'Miguel', 'ECG', 'ecg', '2026-08-02', '[]', null),
  ('gui_ecg', 'Gui', 'ECG', 'ecg', '2026-08-21', '[]', null);

do $$
declare r record; v_doc uuid; v_path text; v_member uuid;
begin
  for r in select * from fixture_upload loop
    v_member := tests.member(r.member);
    select (x ->> 'document_id')::uuid, x ->> 'storage_path' into v_doc, v_path
    from public.create_document_upload(v_member, r.label || '.pdf', 'application/pdf', 2048) x;
    perform tests.remember_doc(r.label, v_doc);
    insert into storage.objects (bucket_id, name, owner) values ('health-documents', v_path, auth.uid());
    perform public.record_document_extraction(v_doc, '{}'::jsonb,
      coalesce(r.assessment, jsonb_build_object('by_member', jsonb_build_object(v_member::text, jsonb_build_object('status', 'match')))),
      r.doc_type, r.title, r.doc_date, 'CUF', 'laboratory', null, null);
    perform public.confirm_document(v_doc, v_member, false, r.doc_type, r.title, r.doc_date, 'CUF', 'laboratory',
      array['Health Records', 'Laboratory', r.title || 's', to_char(r.doc_date, 'YYYY'), trim(to_char(r.doc_date, 'Month'))],
      (select coalesce(jsonb_agg(res || jsonb_build_object('biomarker_id', b.id)), '[]'::jsonb)
         from jsonb_array_elements(r.results) res
         left join public.biomarkers b on b.code = res ->> 'code'));
  end loop;
end $$;

-- Miguel uploads a document for Santi that has not been confirmed yet.
do $$
declare v jsonb;
begin
  v := public.create_document_upload(tests.member('Santi'), 'pending.pdf', 'application/pdf', 1024);
  perform tests.remember_doc('pending_for_santi', (v ->> 'document_id')::uuid);
  insert into storage.objects (bucket_id, name, owner) values ('health-documents', v ->> 'storage_path', auth.uid());
end $$;

-- Santi uploads one of his own documents (still processing).
:as_santi
do $$
declare v jsonb;
begin
  v := public.create_document_upload(tests.member('Santi'), 'my-scan.png', 'image/png', 4096);
  perform tests.remember_doc('santi_own_upload', (v ->> 'document_id')::uuid);
  insert into storage.objects (bucket_id, name, owner) values ('health-documents', v ->> 'storage_path', auth.uid());
end $$;
insert into public.medications (family_id, member_id, kind, name, dose, started_on)
select family_id, id, 'supplement', 'Vitamin D3', '2000 IU', '2026-01-10' from public.family_members;

:as_system
