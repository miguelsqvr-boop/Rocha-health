# Rocha Health

Private health records for the Rocha family. The Super Admin (Miguel) can upload a pile of medical documents and the app identifies who each one belongs to, classifies it, extracts the results, and files it. Every family member gets their own login and sees only their own health information.

> "The Super Admin can manage the family's health data. Every family member owns their own health profile."

**Stack:** Next.js 16 (App Router) · Supabase (Postgres with row-level security, Auth, private Storage) · Claude (`claude-opus-5-5`) for document reading and the health assistant.

---

## Privacy & access model

### Roles

| Member | Own data | Family data | Admin |
|---|---|---|---|
| Super Admin (Miguel) | Full | Full | ✓ |
| Family member (Santi, Gui, Ben, Alice) | Full | None | No |

The Super Admin creates profiles, invites people, activates and deactivates accounts, uploads for anyone, corrects extracted values, moves documents filed under the wrong person, and manages categories, biomarkers, preventive-care rules, the audit log and exports. A family member can view and download their own records, upload their own documents, add their own wellness data, medications and supplements, edit permitted profile fields, export their own records and request corrections. They cannot see, search or change anyone else's information.

### Where it is enforced

Access is decided **in the database**, so a direct API request is rejected even if someone bypasses the UI.

1. **One access function.** `app.member_ids_with(capability)` returns the member ids the signed-in user may read, upload for, or write to: their own profile, everyone in a family they actively administer, and any unexpired, unrevoked grant (see *Future sharing* below). Deactivated accounts get nothing.
2. **Row-level security on every table.** Every health record has `family_id` and `member_id`, with a composite foreign key so the two can never disagree. All policies use the function above. Signed-out visitors have no table privileges at all.
3. **Audited RPCs for sensitive writes.** Uploading, filing, moving, deleting and editing documents, invitations and first-run setup are `SECURITY DEFINER` functions that re-check permission with `auth.uid()` and write one meaningful audit entry. Clients cannot write to `documents` or `audit_log` directly.
4. **Private storage.** One private bucket. File access follows the document row: a storage policy only allows reading a file if the caller can see its document under RLS. Files are opened through 60-second signed URLs created with the viewer's own session, after the permission check and an audit entry. No public URLs exist.
5. **Server layer.** Route handlers and pages use the signed-in user's Supabase client only. The service-role key is used for one thing: asking Supabase Auth to send an invitation email, after the invitation was created with the Super Admin's own session.
6. **UI.** Navigation and buttons mirror the rules (`src/lib/domain/permissions.ts`), but are never the protection.

### Wrong-person protection

Before a document is saved, its printed patient name and date of birth are compared with the chosen member's profile (full name, aliases, date of birth). Family members share surnames, so a surname alone never counts as a match; the first name (or a short form such as Santi/Santiago) has to agree.

- Clean match: "Document appears to belong to Santi ✓ Patient name matches ✓ Date of birth matches".
- Mismatch or uncertain: a prominent warning (*You selected Miguel Vieira da Rocha; the document appears to belong to Santiago Rocha*) with **Assign to Miguel / Assign to Santi / Cancel**. Saving is blocked until someone decides.
- The database enforces it too: `confirm_document` and `move_document` refuse to file under anyone whose check did not match unless the request explicitly acknowledges it, and a table constraint makes it impossible to store a filed document with an unconfirmed identity. Overrides record who confirmed and appear in the audit log.
- Until a document is confirmed, only the Super Admin and the uploader can see it, so a mis-assigned upload never shows up in someone else's records.

### View as

The Super Admin can preview exactly what a member sees. It never uses the member's session or password: the Super Admin keeps their own session, the app narrows the view to that member, admin pages and other profiles redirect back, all changes are refused, a banner ("Viewing as Santi · Return to Super Admin") is always visible, and start, end and every document opened are audited as *Miguel, viewing as Santi*.

### Audit log

Append-only (no API role can write to it; an update or delete raises an error even for the database owner). It records uploads, filing (`Blood Test — Santi — 12 Sep 2026`), moves (`ECG — Miguel → Santi`), corrections with before/after values (`HbA1c 5.6 → 5.4`), document views and downloads, profile views, exports, invitations, activations, permission changes, View as and assistant reads, with IP address and device.

### AI assistant

The assistant has tools (lab results, documents, overview, wellness) that resolve people only from the rows RLS returns for the person asking, and query with that person's own session. If Santi asks for Miguel's blood test, the tool answers "permission denied" and the assistant says so without revealing whether records exist. The Super Admin's assistant can use the whole family's data. During View as it is limited to the viewed member. Each person whose records it reads is audited.

### Future sharing

`member_access_grants` already supports view-only, upload-only and full access, expiry (temporary access) and caregiver or doctor relationships, and the access function honours them. For now no UI creates grants: there are two roles, Super Admin and family member.

---

## Upload workflow

1. **+ Upload Health Document**
2. *Who is this for?* Large family-member cards, or **Let AI identify automatically**
3. Drop one or many PDFs or photos (up to 20 MB each)
4. Each file is stored privately and read by Claude
5. Patient, document type, date, provider, results and biomarkers are identified. Results are matched to biomarker definitions (including Portuguese lab names) and flagged against the lab's reference range.
6. *Ready to Save*: `Santi — Blood Test — 8 Sep 2026 · 4 results found · 3 high confidence · 1 needs review`
7. Confirm (or fix values, the date, or the person)
8. Stored, filed (`Santi → Health Records → Laboratory → Blood Tests → 2026 → September`), added to the timeline, charts and dashboards, and searchable.

## Screens

- **Family Health** (`/admin`): each person's latest record and area statuses (Cardiovascular, Metabolic, Sleep, Fitness), each compared only with their own history.
- **Family Overview** (`/admin/overview`): who has recent data, what is missing, recent uploads, upcoming preventive care, completeness and recent activity. No ranking, no "best/worst".
- **Documents**, **Members**, **Permissions**, **Audit Log**, **Settings** (categories, biomarkers, preventive-care rules, integrations).
- **My Health** (`/m/<member>`): Overview, Health Records, Lab Results, Trends, Sleep, Fitness, Body Composition, Medications, Supplements, Preventive Care, Longevity, Documents, Assistant, Settings. The same pages serve the member, the Super Admin opening a profile, and View as.

---

## Setup

### 1. Supabase

1. Create a Supabase project (Postgres 15+).
2. Apply the migrations in `supabase/migrations/` in order: `supabase link --project-ref <ref>` then `supabase db push`, or paste them into the SQL editor.
3. **Authentication → Sign In / Providers:** turn off *Allow new users to sign up* so only invited people get accounts. Create Miguel's user under **Authentication → Users → Add user**.
4. **Authentication → URL Configuration:** set the Site URL and add `https://<your-app>/auth/callback` and `https://<your-app>/invite/accept` as redirect URLs.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All data access, always as the signed-in user |
| `SUPABASE_SERVICE_ROLE_KEY` | Only to send invitation emails |
| `ANTHROPIC_API_KEY` | Document reading and the assistant |
| `NEXT_PUBLIC_SITE_URL` | Links in invitations |

### 3. Run

```bash
npm install
npm run dev
```

Sign in as Miguel. The first person to sign in to an empty installation sets up the family and becomes its Super Admin (the database refuses this once a family exists). Then add family members under **Members** and invite them. If invitation email isn't configured, the app shows a link to share; it only works for the invited email address and expires after 7 days.

Documents are sent to the Claude API only to be read; requests use server-side fallbacks (`fallbacks: "default"`) so a declined request is retried on Anthropic's recommended fallback model.

## Tests

```bash
npm run typecheck
npm test                      # identity matching, filing, biomarkers, summaries, preventive care
npm run build
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

`test:db` creates a scratch database on any Postgres 15+ server, applies a small stand-in for Supabase's `auth` and `storage` schemas, runs the migrations, and checks the access model as Miguel, Santi, Gui, an invited member, another family's admin, a doctor with a grant, a signed-in stranger, and a signed-out visitor: member isolation (including direct requests by id), Super Admin scope, wrong-person protection, moves, invitations and deactivation, private storage and signed-URL access, the append-only audit log, and future grants. CI runs all of the above (`.github/workflows/ci.yml`).

## Project layout

```
supabase/migrations/   schema, RLS, audited RPCs, storage policies, reference data
supabase/tests/        database access-model tests (plain SQL, run.sh)
src/lib/domain/        pure logic: identity matching, filing taxonomy, biomarkers, summaries, preventive care
src/lib/auth/          who is signed in, View as, member access
src/lib/ai/            Claude document extraction and the permission-scoped assistant
src/lib/documents/     upload → read → identify → review pipeline
src/app/api/           route handlers (all run as the signed-in user)
src/app/admin/         Family Admin screens
src/app/m/[memberId]/  a person's health profile (My Health)
```

## Not done yet

- Wearable integrations: the data model, permissions and private token storage exist, but no provider sync is connected yet.
- Granular sharing UI (view-only, upload-only, temporary, doctor/caregiver): supported by the database, not exposed.
- Notification delivery beyond the in-app list (email or push).
- The two-statement deletion leaves a file in storage if removing it fails after the document was deleted; the file is no longer reachable through the app, but a periodic cleanup job would remove such orphans.
