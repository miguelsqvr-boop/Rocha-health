-- The same file can't be uploaded twice: one live copy per fingerprint per
-- family, with a message that only names what the uploader may see.
\ir roles.psql
begin;

-- Fingerprints on two filed documents: Santi's and Miguel's blood tests.
:as_system
update public.documents set content_hash = repeat('b', 64) where id = tests.doc('santi_blood');
update public.documents set content_hash = repeat('c', 64) where id = tests.doc('miguel_blood');

:as_miguel
select tests.ok((select (x ->> 'document_id') is not null
                 from public.create_document_upload(tests.member('Gui'), 'gui.pdf', 'application/pdf', 100, repeat('a', 64)) x),
  'A new file is uploaded with its fingerprint');
select tests.ok((select content_hash = repeat('a', 64) from public.documents where original_filename = 'gui.pdf'),
  'The fingerprint is stored on the document');
select tests.fails($$select public.create_document_upload(tests.member('Gui'), 'gui again.pdf', 'application/pdf', 100, repeat('a', 64))$$,
  'waiting for review', 'The same file is refused while the first copy waits for review');
select tests.fails($$select public.create_document_upload(null, 'gui.pdf', 'application/pdf', 100, repeat('a', 64))$$,
  'not added again', 'It is refused for "let AI identify" too');
select tests.fails($$select public.create_document_upload(tests.member('Santi'), 'santi.pdf', 'application/pdf', 100, repeat('b', 64))$$,
  'already in the records: Blood Test — Santi — 8 Sep 2026', 'A filed duplicate is refused, saying where the original is');
select tests.fails($$select public.create_document_upload(tests.member('Gui'), 'x.pdf', 'application/pdf', 100, 'not-a-fingerprint')$$,
  'Invalid file fingerprint', 'A malformed fingerprint is refused');

-- Deleting a document frees its fingerprint.
select public.delete_document((select id from public.documents where original_filename = 'gui.pdf'), 'Uploaded by mistake');
select tests.ok((select (x ->> 'document_id') is not null
                 from public.create_document_upload(tests.member('Gui'), 'gui.pdf', 'application/pdf', 100, repeat('a', 64)) x),
  'A deleted document''s file can be uploaded again');

-- Uploads without a fingerprint (older app versions) are not checked.
select tests.ok((select count(*) from (
                   select public.create_document_upload(tests.member('Gui'), 'old.pdf', 'application/pdf', 100)
                   union all
                   select public.create_document_upload(tests.member('Gui'), 'old.pdf', 'application/pdf', 100)) x) = 2,
  'The four-argument upload still works and does no duplicate check');

-- Members see details only for documents they can see.
:as_santi
select tests.fails($$select public.create_document_upload(tests.member('Santi'), 'mine.pdf', 'application/pdf', 100, repeat('b', 64))$$,
  'already in the records: Blood Test — Santi', 'Santi is told where his own copy is');
select tests.fails($$select public.create_document_upload(tests.member('Santi'), 'yours.pdf', 'application/pdf', 100, repeat('c', 64))$$,
  'already in the family''s records', 'A copy of Miguel''s document is refused for Santi');
select tests.ok(tests.error_message($$select public.create_document_upload(tests.member('Santi'), 'yours.pdf', 'application/pdf', 100, repeat('c', 64))$$)
                  not like '%Miguel%'
                and tests.error_message($$select public.create_document_upload(tests.member('Santi'), 'yours.pdf', 'application/pdf', 100, repeat('c', 64))$$)
                  not like '%Blood Test%',
  'The refusal names no one and nothing Santi cannot see');

-- The database itself allows one live copy per family, even under races.
:as_system
select tests.fails($$insert into public.documents (family_id, member_id, uploaded_by, status, original_filename, mime_type, size_bytes, storage_path, content_hash)
                     select family_id, member_id, uploaded_by, 'processing', 'race.pdf', 'application/pdf', 100, 'race/path.pdf', repeat('b', 64)
                     from public.documents where id = tests.doc('santi_blood')$$,
  'documents_one_copy_per_family', 'A second live row with the same fingerprint is rejected by the unique index');

rollback;
