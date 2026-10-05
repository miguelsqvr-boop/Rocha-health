<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rocha Health: rules for changing this codebase

This app holds a family's medical records. The access model is the product.
Read the "Privacy & access model" section of README.md before changing data access.
Current status, decisions and next steps are in `docs/HANDOFF.md`.

- **The database enforces access, not the UI.** Every health table has `family_id` + `member_id`, a composite foreign key to `family_members(family_id, id)`, RLS enabled, and policies that go through `app.member_ids_with('read' | 'upload' | 'write')`. A new health table must follow the same pattern and get tests in `supabase/tests/`.
- **Never use the service-role key for health data.** All reads and writes run with the signed-in user's Supabase client (`createSupabaseServerClient`). The only service-role use is sending invitation emails (`src/lib/supabase/admin.ts`).
- **Sensitive writes go through audited RPCs** (`supabase/migrations/*_family_rpcs.sql`), which re-check permissions with `auth.uid()` and call `app.write_audit`. Direct table writes are audited by the `app.audit_row_change` triggers. Reads of documents, exports, profile views and "View as" call `log_access`.
- **Wrong-person protection is a database rule**: a document can only be filed when its identity check matched the chosen member or a person explicitly confirmed it (`confirm_document`, `move_document`, constraint `filed_documents_have_confirmed_identity`). Don't add a filing path that bypasses it.
- **"View as" is read-only** and never uses the member's session. `route({ mutates: true })` rejects changes while it is active.
- **The AI assistant uses the same permissions**: tools resolve people only from rows RLS returns, and query with the user's client.
- **No ranking of family members.** Summaries compare a person only with their own history.
- Checks before pushing: `npm run typecheck`, `npm test`, `npm run build`, and `TEST_DATABASE_URL=postgres://… npm run test:db`.
