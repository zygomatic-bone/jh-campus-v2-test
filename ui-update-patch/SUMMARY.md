# Patch: Super Admin panel-wide write failures — full RLS audit + fix

## Root Cause

**Not a Super Admin detection bug.** The dashboard correctly identifies the
account as `super_admin` — that's why reads work and the UI renders
correctly. The failure is specifically in **Row Level Security (RLS)
policies**, and it's structural, not isolated to one table:

Every policy that exists (or is missing) on these tables checks the
**row being written**, never the **role of the user performing the
write**. Concretely:

- If there's **no INSERT/UPDATE/DELETE policy at all** on a table, RLS
  denies every write outright — reads still work if a SELECT policy
  exists, which is exactly the "I can see data but can't change it"
  symptom you're seeing.
- If a policy exists but is scoped like `id = auth.uid()` ("you can only
  touch your own row"), it actively **blocks** a super_admin from writing
  someone else's row — which is the whole point of an admin panel.
- This same gap repeats across every CMS table the Super Admin panel
  touches: `profiles`, `homepage_sections`, `section_items`,
  `media_library`, `site_settings`, `batches`, `classes`, `sections`,
  `achievers`, `gallery_items`, `announcements`, `downloads`,
  `activity_logs` — confirmed by reading every `.from(table)` call in the
  shipped JS, not assumed.

This explains every symptom in your report as **one root cause appearing
in multiple places**, not four separate problems:

| Symptom | Table affected | Why |
|---|---|---|
| Create User fails | `profiles` | No INSERT policy lets super_admin insert a row for someone else |
| Profile creation fails | `profiles` | Same as above |
| Publishing actions fail | `homepage_sections`, `section_items` | No UPDATE/DELETE policy scoped to super_admin's role |
| Approval actions fail | `profiles` (user approval), `content_approvals` | Same INSERT/UPDATE gap |
| "Other write operations fail" | `batches`, `classes`, `sections`, `media_library`, `site_settings`, `achievers`, `gallery_items`, `announcements`, `downloads` | Same gap, same pattern, every table |

**A second, separate bug** (found during investigation, not in your
report): the Create User button calls `supabase.auth.signUp()` directly
from the browser. `signUp()` always signs the **current browser** into
the account it just created — so even with RLS fixed, creating a user
would log the Super Admin out of their own session. This needs a
server-side fix (an Edge Function), which is included below, since no
RLS policy can fix a session-management issue.

## Why role detection looked broken

You listed "Super Admin role detection is failing" and "current account
is not being recognized as super_admin" as hypotheses. Based on the code
audit, **the role IS being recognized correctly** — `authGuard(["super_admin"])`
gates page access and the dashboard loads, which only happens if the role
check passes. What actually fails is a *second*, *independent* role check
— inside Postgres's RLS evaluation — which the front-end has no visibility
into at all. The app correctly knows you're a super_admin; the database
doesn't have a policy that asks the same question. These are two separate
systems that were never wired to agree.

One important trap I caught and avoided: an earlier draft of this fix
required `status = 'active'` in addition to `role = 'super_admin'` for
every write check. That would have created a **self-deadlock** — every
brand-new account (including the very first super_admin ever created,
via Google OAuth) starts as `status = 'pending'`, and the only way to
become `'active'` is for an active super_admin to approve them. If the
write-check itself requires `status = 'active'`, nobody could ever
perform that first approval. The final migration checks **role only**,
matching what `authGuard()` already does at the application layer.

## SQL Changes Required

File: `sql/002_full_rls_audit_and_fix.sql`

1. **Step 0 — Audit (read-only).** Run this first. It lists which tables
   have RLS enabled and what policies currently exist, so you can compare
   against what this migration is about to create and catch any naming
   collisions before applying.
2. **Step 1 — Helper functions.**
   - `jh_current_role()` / `jh_current_status()` — read-only lookups of
     the caller's own row.
   - `jh_is_active_super_admin()` / `jh_is_active_role(role)` — boolean
     helpers used throughout the policies below. Despite the name
     ("active"), these check **role only**, deliberately, for the
     deadlock reason explained above. All four are `SECURITY DEFINER`,
     which lets them read `profiles` regardless of RLS — but they are
     hard-coded to only ever look up `auth.uid()` (the caller itself),
     so they can't be used to leak another user's data, and they sidestep
     the classic RLS self-recursion bug where a policy on `profiles`
     queries `profiles` directly inside its own check.
3. **Step 2 — Enable RLS** on all 21 tables (no-op if already on;
   defensive in case any table was left without RLS entirely, which
   would be a worse problem than the one reported).
4. **Step 3 — `profiles` policies.** SELECT (own row or staff), INSERT
   (own row — covers first-time OAuth signup — OR super_admin creating
   someone else), UPDATE (own row or super_admin/admin), DELETE
   (super_admin only).
5. **Step 4 — Super-admin-only CMS tables**: `batches`, `classes`,
   `sections`, `homepage_sections`, `section_items`, `media_library`,
   `site_settings`. Public-facing tables (`homepage_sections`,
   `section_items`, `site_settings`) also grant SELECT to the `anon`
   role, since the public homepage reads these with no login.
6. **Step 5 — Shared content tables**: `achievers` (super_admin only, per
   the wizard), `gallery_items` and `announcements` and `downloads`
   (super_admin, admin, and — for the latter two — teacher, since
   teacher-portal.js also inserts into these).
7. **Step 6 — `content_approvals`**: SELECT + UPDATE for admin/super_admin
   (no insert/delete site exists in the current app, so none granted —
   extend this if you add one later).
8. **Step 7 — Academic tables audited for completeness** (not in your
   report, but the ticket asked for a complete audit): `assignments`,
   `attendance`, `marks`, `question_bank` (teacher writes), `results`
   (principal writes), `exams` (read-only — no write site found),
   `teacher_assignments` (read-only, scoped to the assigned teacher or
   staff — **verify this table actually has a `teacher_id` column before
   applying**, see the inline note in the SQL file).
9. **Step 8 — `activity_logs`**: INSERT for any role that logs actions
   (super_admin, admin); no UPDATE/DELETE granted to anyone — logs should
   stay immutable.
10. **Step 9 — Verify**: re-lists every policy so you can confirm what
    was actually created.

**You must run this migration yourself** in the Supabase SQL editor — I
don't have access to your live project to execute it directly.

## Updated Migration / Files Changed

```
ui-update-patch/
├── sql/
│   └── 002_full_rls_audit_and_fix.sql             [NEW — supersedes the
│                                                      profiles-only fix
│                                                      from the previous
│                                                      patch; this is the
│                                                      one to run]
├── supabase/
│   └── functions/
│       └── admin-create-user/
│           └── index.ts                            [NEW]
└── super-admin/
    └── assets/
        └── super-admin-portal.js                    [MODIFIED — Create
                                                         User handler only]
```

- **`sql/002_full_rls_audit_and_fix.sql`** — the complete fix described
  above. This replaces (supersedes) the narrower profiles-only migration
  from the prior patch; you don't need both, just this one.
- **`supabase/functions/admin-create-user/index.ts`** — re-verifies the
  caller's role server-side (never trusts the client), creates the auth
  user via the Admin API (no session impact on the caller), then inserts
  the profile row using the service-role client. Supports all five
  creatable roles.
- **`super-admin/assets/super-admin-portal.js`** — only the Create User
  click handler changed, to call the Edge Function instead of
  `signUp()`. Every other write in this file (approve, activate,
  deactivate, edit, delete, role-select, publish/unpublish/hide/delete
  sections, media delete) needed **no JS changes** — those were already
  calling the right Supabase methods; they just needed the database to
  stop blocking them.

## Verification Steps

After applying the SQL migration and deploying the Edge Function:

1. **Audit check**: re-run Step 0's policy listing and confirm all 42
   policies appear against the expected tables.
2. **Profiles — Create**: log in as Super Admin, create a Teacher. Confirm
   (a) no permission error, (b) you are **not** logged out, (c) the new
   teacher appears in the Users list with `must_change_password = true`.
3. **Profiles — Approve/Activate/Deactivate**: if any pending users exist,
   click Approve — confirm status flips to Active with no error. Toggle
   Deactivate/Activate on an existing user.
4. **Profiles — Edit/Delete**: edit a user's name, confirm it saves. Delete
   a test user, confirm it disappears from the list and the row is gone.
5. **Publishing — Sections**: go to the Sections tab, create a new section
   via the wizard, then Publish it, then Unpublish it, then Hide/Show it,
   then Delete it. Each should succeed without a permission error.
6. **Media**: upload a file in the Media tab, then delete it.
7. **Content wizard — Achievers / Gallery / Announcements / Downloads**:
   add one of each via "+ Create New Section" → the relevant wizard flow,
   confirm each insert succeeds (note: there is still no list/manage view
   for these four beyond what the wizard itself shows — that's a separate,
   already-flagged limitation, not something this patch addresses).
8. **Cross-check a non-super-admin role**: log in as a Teacher and confirm
   they can still create an assignment/take attendance/enter marks — this
   confirms the academic-table policies in Step 7 didn't accidentally
   tighten things for roles other than super_admin.
9. **Negative test**: log in as a Student and confirm they **cannot** write
   to `homepage_sections`, `profiles` (other than their own row), or any
   admin table — open the browser console and try
   `sb.from('homepage_sections').delete().eq('id', 'anything')` — it
   should return a permission-denied error. This confirms the fix didn't
   overshoot into "everyone can write everything."

## Remaining Limitations

- **I cannot see your actual live RLS policies.** This migration is
  built entirely from reading the application's own write calls — it's
  thorough, but the Step 0 audit is not optional. Run it first and check
  for naming collisions with policies that may already exist under
  different names.
- **`teacher_assignments` column name is unverified** — I found a read
  call but no schema file ships with this deploy package to confirm the
  actual column is called `teacher_id`. Check Step 0c's column listing
  for this table before applying that one policy; if the column name
  differs, edit it before running.
- **CORS in the Edge Function is wide open (`*`)** for ease of testing.
  Tighten to your real domain(s) before production use.
- **`exams` has no write policy** — I found no insert/update call against
  this table anywhere in the shipped code, so only a read policy was
  added. If a "create exam" UI exists that I didn't find, or ships later,
  add a matching write policy following the same pattern as `results`.
- **Achievers/Gallery/Announcements/Downloads still have no manage UI**
  beyond the content wizard's "Add" flow (list/edit/unpublish/delete for
  these four) — this is the same gap flagged in the previous patch's
  conversation and is unrelated to RLS; it's a missing front-end view,
  not a permissions problem.
- **Orphaned auth users**: any earlier failed Create User attempts (before
  this fix) may have left `auth.users` rows with no matching `profiles`
  row. These won't appear in the Users list and can't log in. Worth
  checking Authentication → Users against `profiles` for orphans and
  cleaning up manually.
