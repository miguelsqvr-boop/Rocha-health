# Handoff: where Rocha Health stands

_Last updated 4 Oct 2026, at the end of the first build session._

Read this, then `AGENTS.md` (rules for changing the code) and `README.md` (what the app does and how to set it up).

## Status

- All work is on branch `claude/family-access-model`, in pull request #1 into `main`. CI is green (typecheck, unit tests, build, database access tests).
- **Not deployed anywhere yet.** No Supabase project or Vercel site exists. Next step: set them up (see *Next steps*).
- The original brief was the "Family access, Super Admin & privacy model" spec: Super Admin (Miguel) manages the family; every member (Santi, Gui, Ben, Alice) has a private account that only sees their own records.

## What is built

- **Database** (`supabase/migrations/`): schema, row-level security, audited RPCs, private storage policies, append-only audit log, reference data (categories, 44 biomarkers including Portuguese lab names, preventive-care rules).
- **App** (Next.js 16): Family Health dashboard, Family Overview, upload wizard with wrong-person warnings, documents, members and invitations, permissions, audit log, settings, each person's My Health pages, View as, and a permission-scoped Claude assistant.
- **Tests**: 139 SQL access checks (`npm run test:db`), 31 unit tests (`npm test`), CI in `.github/workflows/ci.yml`.

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
- **Not verified yet:** a real Supabase project, the real Claude API (no key was available), real invitation emails, a Vercel deployment.

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

1. Merge PR #1 into `main`.
2. Create the Supabase project and run the three migrations in order (README → Setup).
3. Disable public sign-ups and create Miguel's user in Supabase Auth.
4. Deploy to Vercel with the environment variables in `.env.example`; set Supabase's Site URL and redirect URLs.
5. Sign in, set up the family, add Santi, Gui, Ben and Alice, and send invitations.
6. Upload a few real reports (e.g. CUF blood tests) and check extraction, identity matching and filing. Adjust the prompt in `src/lib/ai/extract.ts` or biomarker synonyms if needed.
7. Then pick from *Not built yet*.
