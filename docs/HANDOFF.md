# Handoff: where Rocha Health stands

_Last updated 25 Oct 2026: exam requests, results that need attention with "Why might this be?", reference ranges on every chart the labs allow (white-cell differential in the catalogue, units merged)._

Read this, then `AGENTS.md` (rules for changing the code) and `README.md` (what the app does and how to set it up).

## Status

- The first build was merged into `main` (pull request #1, 5 Oct 2026). CI is green (typecheck, unit tests, build, database access tests).
- **Supabase: set up (24 Oct 2026).** See *Supabase project* below. The database is ready; Auth settings still need a few dashboard clicks.
- **Vercel: not deployed yet.** Next step after the Supabase dashboard settings (see *Next steps*).
- The original brief was the "Family access, Super Admin & privacy model" spec: Super Admin (Miguel) manages the family; every member (Santi, Gui, Ben, Alice) has a private account that only sees their own records.

## Supabase project

| | |
|---|---|
| Organisation | **Rocha Family** (Free plan), separate from Miguel's paid "miguelsqvr-boop's Org" |
| Project | ref `fvbcsyrmqpuyaepysruz`, URL `https://fvbcsyrmqpuyaepysruz.supabase.co`, region West EU (Ireland, `eu-west-1`). Its display name is still the default "miguelsqvr-boop's Project"; rename it under Settings → General if you like. |
| Database | The first three migrations applied and checked on 24 Oct 2026; `20261025000100_word_documents` (accept .docx) and `20261025000200_duplicate_uploads` (one live copy of a file per family) applied on 25 Oct 2026, their functions byte-identical to the repo. The first three: a fingerprint of every function, policy, column, constraint, index, trigger, privilege, bucket and reference row matched a local build of the repo's migrations. `family_rpcs` was pasted into the SQL editor on Windows, so its 13 functions contain `\r\n` line endings; apart from that they are byte-identical. Signed-in users with no profile see only the built-in reference data; signed-out requests get "permission denied". |
| Security advisor | Two expected notices: `wearable_credentials` has RLS with no policies (service role only, by design), and signed-in users can execute the 11 `SECURITY DEFINER` RPCs (each re-checks `auth.uid()` and permissions). Nothing reachable by `anon`. |
| Exam requests and lab links | `20261025000300_lab_test_links` adds the white-cell differential (% and absolute) to the catalogue, unlinks 5 results linked to a test they can't be (urine-strip words, the electrophoresis albumin %) and links the existing differential results, with one audit entry per person. `20261025000400_exam_requests` adds `documents.doctor_name`/`specialty`, the `requested_exams` table (RLS, read only through `member_ids_with('read')`, written only by `confirm_document`/`update_document_details`), and extends those RPCs and `delete_document`. |
| Migration history | Supabase lists `family_access_model`, `reference_data`, `word_documents` and `duplicate_uploads` under the timestamps they were applied (20261024…, 20261025161859, 20261025170856); `family_rpcs` isn't listed because it went through the SQL editor. Before ever using the Supabase CLI against this project, run `supabase migration repair --status reverted 20261024103817 20261024105037 20261025161859 20261025170856` and `supabase migration repair --status applied 20261003000100 20261003000200 20261003000300 20261025000100 20261025000200` so `db push` doesn't try to re-run them. |
| Free plan | Paused after about a week with little activity (Supabase emails a warning first; resume from the dashboard), no automatic backups, 500 MB database / 1 GB files. Export records regularly, and consider moving the project to a paid organisation (Settings → General → Transfer project) once real records are in. |
| Claude's access | The Supabase connector in Claude was authorised for the Rocha Family organisation to do this setup. Switch it back to "miguelsqvr-boop's Org" (Customize → Connectors → Supabase) before real medical records are uploaded, so Claude sessions can't reach this database. |

## What is built

- **Database** (`supabase/migrations/`): schema, row-level security, audited RPCs, private storage policies, append-only audit log, reference data (categories, 44 biomarkers including Portuguese lab names, preventive-care rules).
- **App** (Next.js 16): Family Health dashboard, Family Overview, upload wizard with wrong-person warnings, documents, members and invitations, permissions, audit log, settings, each person's My Health pages, View as, and a permission-scoped Claude assistant.
- **Tests**: 181 SQL access checks (`npm run test:db`, run twice: once as an older Supabase project that grants new tables to API roles automatically, once as a newer one that doesn't), 55 unit tests (`npm test`), CI in `.github/workflows/ci.yml`.

## Key decisions (and why)

| Decision | Why |
|---|---|
| Next.js + Supabase + Claude (`claude-opus-5-5`) | The repo was empty; the spec asks for row-level security, private buckets and signed URLs, which Supabase provides. |
| One access function, `app.member_ids_with()`, used by every policy | A single place decides access; future grants (doctor, caregiver, temporary) already work through it. |
| Sensitive writes only through `SECURITY DEFINER` RPCs | Each re-checks permission with `auth.uid()` and writes one meaningful audit entry. |
| "Audit already written" flag is per statement (`statement_timestamp()`), not per transaction | A transaction-wide flag let a later edit in the same transaction skip the audit log (bug found in testing). |
| Storage paths contain no member id | File access follows the document row, so moving a document moves access with it. |
| Identity is checked at extraction against every member the uploader may file for; the database requires an explicit acknowledgement when it isn't a match | Wrong-person protection can't be bypassed from the UI or API. |
| Unconfirmed uploads visible only to the Super Admin and uploader | A document uploaded under the wrong person never appears in that person's records. |
| View as = Super Admin's own session + a validated cookie; read-only; audited | Never uses the member's login; the database only records "acting as" if the actor really is that member's admin. |
| Service-role key used only for invitation emails | All health data access runs as the signed-in user. |
| Invite emails return the session in the URL fragment; `/invite/accept` reads it and calls `setSession` | The cookie-based Supabase client forces PKCE and ignores implicit-flow links (bug found in testing). |
| `bootstrap_family` only works while no family exists | The first sign-in becomes Super Admin; public sign-ups should be disabled in Supabase. |
| Claude extraction: structured output, effort `high`, `fallbacks: "default"`; assistant: tool runner, effort `medium` | Accuracy for medical documents; assistant tools only see people RLS returns. |
| Dates always shown as "12 Sep 2026" (fixed month names) | Locale data varies ("Sep" vs "Sept"). |
| No ranking anywhere | Spec: a health-management tool, not a competition. |

## How it was verified

- SQL tests run as Miguel, Santi, Gui, an invited member, another family's admin, a doctor with a grant, a signed-in stranger and a signed-out visitor.
- A 35-step browser walkthrough ran against local Postgres + PostgREST, with a small stand-in for Supabase Auth/Storage and a mock Claude endpoint. That harness lived only in the session's scratch space and is **not** in the repo. It found three bugs, all fixed: the member insert read-back policy, invite-link sign-in, and the audit flag scope.
- The schema on the real Supabase project was compared with the repo's migrations (see *Supabase project*).
- **Not verified yet:** the real Claude API (no key was available), real invitation emails, a Vercel deployment, sign-in on the real project.

## Not built yet / known gaps

- Wearable sync (tables, permissions and private token storage exist; no provider connected).
- UI for granular sharing (the database supports view-only, upload-only, full, temporary, doctor and caregiver grants).
- Notifications: shown in-app, but no "mark as read" action and no email or push delivery.
- Preventive care: no button to record a completed check-up yet (the `preventive_care_completions` table exists and is counted).
- Medications and supplements can be added but not edited, stopped or deleted from the UI.
- Settings: biomarkers, categories and preventive rules can be added or overridden, but not deleted.
- A doctor or caregiver grantee without a family profile can't upload yet (`require_active_member`).
- If removing a deleted document's file from storage fails, the file stays orphaned (unreachable through the app); a cleanup job would remove it.

## Next steps

1. Supabase dashboard (Claude's connector can't change Auth settings):
   - **Authentication → Sign In / Providers:** turn off *Allow new users to sign up* (keep the Email provider on).
   - **Authentication → Users → Add user → Create new user:** Miguel's email and a password, with *Auto Confirm User* ticked.
2. Deploy to Vercel (import the GitHub repo) with the environment variables in `.env.example`. `vercel.json` pins the functions to Dublin (`dub1`), next to the database in `eu-west-1`:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://fvbcsyrmqpuyaepysruz.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the project's publishable key (Settings → API Keys, `sb_publishable_…`)
   - `SUPABASE_SERVICE_ROLE_KEY` = the secret key (`sb_secret_…`); server only, used just for invitation emails
   - `ANTHROPIC_API_KEY`, and `NEXT_PUBLIC_SITE_URL` = the Vercel address
3. Back in Supabase, **Authentication → URL Configuration:** Site URL = the Vercel address; redirect URLs `https://<app>/auth/callback` and `https://<app>/invite/accept`.
4. Sign in as Miguel; the first sign-in sets up the family and makes him Super Admin. Add Santi, Gui, Ben and Alice under **Members**.
5. Family logins. Supabase's built-in email only reaches members of the Supabase organisation (Miguel), so either:
   - set up custom SMTP (**Authentication → Emails → SMTP settings**; e.g. a Gmail account with an app password), after which invitations and sign-in links are emailed; or
   - create each person's login under **Authentication → Users → Add user** (temporary password, *Auto Confirm User*), have them sign in at `/login`, then open the invitation link from **Members** and accept it (they can set their own password there).
6. Switch Claude's Supabase connector back to "miguelsqvr-boop's Org".
7. Upload a few real reports (e.g. CUF blood tests) and check extraction, identity matching and filing. Adjust the prompt in `src/lib/ai/extract.ts` or biomarker synonyms if needed.
8. Then pick from *Not built yet*.
