-- Medical files live in a private bucket. Signed URLs can only be created for
-- objects the caller can SELECT, so these policies decide every download.
\ir roles.psql
begin;

select tests.ok((select public from storage.buckets where id = 'health-documents') = false,
  'The health-documents bucket is private');

:as_santi
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('santi_blood')) = 1,
  'Santi can access the file of his own filed blood test');
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('miguel_blood')) = 0,
  'Santi cannot access the file of Miguel''s blood test');
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('pending_for_santi')) = 0,
  'Santi cannot open a file uploaded for him that has not been confirmed');
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('santi_own_upload')) = 1,
  'Santi can open his own pending upload');
select tests.ok((select count(*) from storage.objects) = 2, 'Santi can list exactly two files');

-- Uploads only into a reserved path, by its uploader, while processing.
select tests.fails($$insert into storage.objects (bucket_id, name) values ('health-documents', 'anything/else.pdf')$$,
  'row-level security', 'Uploading to an unreserved path is refused');
select tests.fails($$insert into storage.objects (bucket_id, name)
  values ('health-documents', replace(tests.doc_path('miguel_blood'), 'original', 'copy'))$$,
  'row-level security', 'Uploading next to someone else''s document is refused');
select tests.ok(tests.rows_affected($$update storage.objects set name = name || '.bak'
  where name = tests.doc_path('santi_blood')$$) = 0, 'Files cannot be renamed or overwritten');
select tests.ok(tests.rows_affected($$update storage.objects set metadata = '{}' $$) = 0,
  'No storage update policy exists');
select tests.ok(tests.rows_affected($$delete from storage.objects where name = tests.doc_path('santi_blood')$$) = 0,
  'Santi cannot delete his filed document''s file');

-- Deleting: the document first (audited RPC), then its file.
select public.delete_document(tests.doc('santi_own_upload'), 'Uploaded by mistake');
select tests.ok(tests.rows_affected($$delete from storage.objects where name = tests.doc_path('santi_own_upload')$$) = 1,
  'The uploader can remove the file of a document he deleted');

:as_miguel
select tests.ok((select count(*) from storage.objects) = 5, 'Miguel can access every remaining Rocha file');
select tests.ok(tests.rows_affected($$delete from storage.objects where name = tests.doc_path('miguel_blood')$$) = 0,
  'Even the Super Admin cannot remove a file without deleting its document first');

-- When the Super Admin deletes a filed document, the member loses the file.
select public.delete_document(tests.doc('santi_blood'), 'Duplicate');
:as_santi
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('santi_blood')) = 0,
  'A deleted document''s file is no longer readable by the member');
:as_miguel
select tests.ok(tests.rows_affected($$delete from storage.objects where name = tests.doc_path('santi_blood')$$) = 1,
  'The Super Admin removes the file of the document he deleted');

-- Moving a document moves file access with it.
select public.move_document(tests.doc('miguel_blood'), tests.member('Santi'), true);
:as_santi
select tests.ok((select count(*) from storage.objects where name = tests.doc_path('miguel_blood')) = 1,
  'After a move, the new owner can open the file');

:as_outsider
select tests.ok((select count(*) from storage.objects) = 0, 'Another family cannot see any Rocha files');
:as_anon
select tests.ok((select count(*) from storage.objects) = 0, 'Signed-out visitors cannot see any files');

rollback;
