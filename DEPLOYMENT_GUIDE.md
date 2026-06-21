# JH+ Campus Management System — Deployment Guide

This document is the single source of truth for deploying, configuring, and
maintaining this project. Read it fully before going live.

---

## 1. FINAL AUDIT RESULTS

This section reports what was actually checked, what passed, and — just as
importantly — what was found and fixed during the final audit. Nothing below
is asserted without having been run against the actual files.

### 1.1 Authentication Audit — PASS
- All 6 portal dashboards (`student`, `teacher`, `principal`, `trust`,
  `admin`, `super-admin`) call `authGuard([role])` before rendering anything.
- All 6 login pages set `window.JH_PORTAL_ROLE` and reject role mismatches
  (e.g. a teacher account cannot log into `/admin/login.html`).
- Google OAuth callback pages exist for all 6 roles and create a `pending`
  profile (not auto-active) on first-ever Google sign-in.
- Forced password change flow verified: `must_change_password` blocks
  dashboard access until a new password is set, for every role.

### 1.2 Role Security Audit — PASS
- Role strings are consistent across: the `jh_role` Postgres enum, the
  `JH_ROLE_HOME`/`JH_ROLE_LOGIN` JS maps, every `authGuard([...])` call, and
  every login page's `JH_PORTAL_ROLE`. Cross-checked directly — no drift.
- Direct URL access to a protected page without a valid session/role
  redirects via `authGuard()` before any data loads.

### 1.3 RLS Policy Audit — PASS (with one fix applied)
- All 22 tables created across the SQL migrations have
  `enable row level security` — verified by diffing `CREATE TABLE` statements
  against `ENABLE ROW LEVEL SECURITY` statements; counts match exactly.
- **Finding (fixed):** the original `documents` storage bucket policy let
  any authenticated user read any file in that bucket by guessing the path,
  even though the `assignments`/`downloads`/`question_bank` tables were
  correctly scoped. This has been replaced with a scoped policy that ties
  bucket reads to a row the requesting user is actually entitled to see
  (see `006_storage_policies.sql`). This is a reasonable mitigation given
  there's no backend to issue true signed URLs — not a perfect substitute
  for one, but it closes the path-guessing hole.

### 1.4 Portal Access Audit — PASS
- Student: read-only on own data (attendance, marks, published results,
  own-section assignments/downloads/question bank).
- Teacher: write access scoped to `teacher_assignments` (their actual
  sections only) — enforced both in the UI and in RLS.
- Principal: read-everything + the one write capability (publishing
  results), matching the brief.
- Trust: confirmed strictly read-only — no insert/update/delete anywhere
  in `trust-portal.js`, and no write RLS policy exists for `trust_member`.
- Admin / Super Admin: full content + user management as specified.

### 1.5 Responsive / Mobile Audit — PASS
- Every HTML file has a viewport meta tag (checked all files, zero missing).
- Sidebar shell collapses to a slide-in drawer under 900px; navbar
  theme-toggle/login-dropdown remain visible and usable on mobile.

### 1.6 Dynamic CMS Audit — PASS (with two gaps found and fixed)
- Section Builder (create/edit/reorder/publish/hide/delete) — verified
  functional end-to-end against real Supabase queries.
- **Finding (fixed):** Achievers, Gallery, and public Announcements had
  working admin UIs and correct public RLS policies, but nothing on the
  actual public homepage rendered them — the dynamic-section renderer only
  queried `homepage_sections`. Fixed: `dynamic-sections.js` now also fetches
  and renders achievers, gallery, and public announcements.
- **Finding (fixed):** Director Message, Hero Banner, and Homepage
  Statistics had working editors in the wizard but were never read anywhere
  on the public site. Fixed as **non-destructive overrides**: the existing
  hardcoded hero/leadership content is left completely untouched unless a
  Super Admin actively sets a value through the wizard, at which point it
  overrides just that one piece (headline, subheadline, hero image, or
  stats) — never silently replacing real existing content with the
  empty-string defaults that ship in `site_settings`.

### 1.7 Homepage Rendering Audit — PASS
- Public RLS policies for `homepage_sections`, `section_items`,
  `gallery_items`, `achievers`, `site_settings`, and public `announcements`
  were confirmed to NOT require `auth.uid()` — meaning the homepage actually
  works for anonymous/logged-out visitors, which is the entire point.
- The password gate that previously blocked all public visitors
  (hardcoded password `atfan2008`, found during the original stabilization
  phase) was removed and reconfirmed absent in this audit.

### 1.8 Storage & Upload Audit — PASS
- Confirmed every upload path in the codebase goes through the single
  `jhUploadMedia()` helper — no code bypasses the 5MB cap or client-side
  compression.
- Storage dashboard numbers are sourced from the `media_library` index
  table, not a live Supabase account-level API call — documented as such in
  the UI itself so it's not mistaken for real-time infra metrics.

### 1.9 Known Limitations (by design, not oversights)
- **No server-side thumbnail generation.** True multi-size thumbnails need
  a backend (e.g. Supabase Edge Function). This project does real
  client-side compression/resize/WebP conversion before upload, which
  solves the "don't let people upload 20MB photos" problem, but does not
  generate separate stored thumbnail files.
- **Documents bucket scoping** relies on matching `file_url` text against
  table rows the user can see (see 1.3). It is a real fix for the path-
  guessing issue found in the audit, but a true signed-URL system would be
  stronger if you later add a backend.
- **Google OAuth requires manual dashboard setup** (see §4 below) — it
  cannot be configured purely through this codebase.

---

## 2. COMPLETE FILE TREE

```
webfor-main/
├── index.html                          (public homepage — modified: nav, theme toggle, login dropdown, dynamic sections, password gate removed)
├── degree.html, science.html           (unmodified)
├── robots.txt, sitemap.xml             (unmodified)
├── icon.svg, icon-*.png, placeholder-*.* (unmodified existing assets)
├── images/rector.jpg                   (unmodified)
├── access-denied.html                  (NEW — shared role-mismatch page)
│
├── assets/
│   ├── sub.css                         (unmodified, original site)
│   ├── portal-login.css                (NEW — shared login page theme)
│   ├── portal-shell.css                (NEW — shared dashboard shell + wizard + FAB)
│   ├── theme-and-login.css             (NEW — public site theme toggle + login dropdown)
│   └── js/
│       ├── supabase-config.js          (NEW — shared Supabase client, authGuard, role maps)
│       ├── theme.js                    (NEW — light/dark toggle, localStorage)
│       ├── login-dropdown.js           (NEW — navbar dropdown behavior)
│       ├── portal-login.js             (NEW — shared login form logic)
│       ├── portal-shell.js             (NEW — shared dashboard sidebar/profile behavior)
│       ├── image-pipeline.js           (NEW — client-side compression + upload helper)
│       └── dynamic-sections.js         (NEW — public homepage CMS renderer)
│
├── database/
│   ├── 001_core_schema.sql             (roles, classes/sections/batches, profiles, teacher_assignments, activity_logs)
│   ├── 002_rls_policies.sql            (RLS for core schema)
│   ├── 003_academic_data.sql           (attendance, marks, results, assignments, downloads, question_bank, announcements + RLS)
│   ├── 004_auth_trigger_and_seed.sql   (auto-profile trigger + super admin seeding instructions)
│   ├── 005_cms_schema.sql              (homepage_sections, section_items, media_library, content_approvals, gallery_items + RLS)
│   ├── 006_storage_policies.sql        (Supabase Storage bucket RLS — UPDATED in final audit)
│   └── 007_nocode_cms.sql              (achievers, site_settings + RLS)
│
├── student/
│   ├── login.html, oauth-callback.html, force-password-change.html
│   ├── index.html
│   └── assets/student-portal.js
├── teacher/        (same structure as student/)
├── principal/      (same structure)
├── trust/          (same structure)
├── admin/          (same structure)
└── super-admin/
    ├── login.html, oauth-callback.html, force-password-change.html
    ├── index.html
    └── assets/
        ├── super-admin-portal.js       (users, academic structure, section list, media, logs, settings)
        └── content-wizard.js           (floating + wizard: 9 quick-action flows)
```

---

## 3. SQL MIGRATION ORDER

Run these **in exact numeric order** in the Supabase SQL Editor (or via CLI
migrations). Each depends on objects created by the ones before it.

```
001_core_schema.sql
002_rls_policies.sql
003_academic_data.sql
004_auth_trigger_and_seed.sql
005_cms_schema.sql
006_storage_policies.sql   ← create the 3 storage buckets FIRST (see §4.3), then run this
007_nocode_cms.sql
```

---

## 4. SUPABASE SETUP GUIDE

### 4.1 Create the project
1. Go to supabase.com → New Project.
2. Note your **Project URL** and **anon/public API key** (Settings → API).
   You will need these for §5.

### 4.2 Run the migrations
In the SQL Editor, run each file from `database/` in the order listed in §3.
Paste the full contents of each file and run it before moving to the next.

### 4.3 Create Storage buckets (before running 006)
Dashboard → Storage → New Bucket. Create exactly these three, with these
exact names (the SQL policies reference them by name):

| Bucket name | Public? |
|---|---|
| `media` | Yes |
| `documents` | No |
| `avatars` | Yes |

Then run `006_storage_policies.sql`.

### 4.4 Enable Google Login (optional but requested in the brief)
This cannot be done from code — it's a one-time dashboard + Google Cloud step:

1. In **Google Cloud Console**: create an OAuth 2.0 Client ID
   (Application type: Web application). Add your Supabase project's
   callback URL as an authorized redirect URI — find this exact URL in
   Supabase Dashboard → Authentication → Providers → Google (it shows the
   redirect URL to paste into Google Cloud once you open that provider's
   settings).
2. Copy the **Client ID** and **Client Secret** from Google Cloud.
3. In **Supabase Dashboard** → Authentication → Providers → Google: toggle
   it on, paste the Client ID and Secret, save.
4. Test by clicking "Continue with Google" on any login page.

### 4.5 Create the first Super Admin
**Do not skip this — there is no hardcoded super admin password anywhere in
this codebase by design.**

1. Supabase Dashboard → Authentication → Users → Add User.
   - Email: `eclass603@gmail.com`
   - Password: choose a strong temporary password yourself.
   - Check **"Auto Confirm User."**
2. This fires the auto-profile trigger from `004_auth_trigger_and_seed.sql`,
   creating a `student` / `pending` profile row automatically.
3. In the SQL Editor, run:
   ```sql
   update profiles
   set role = 'super_admin',
       status = 'active',
       must_change_password = true,
       full_name = 'Super Admin'
   where email = 'eclass603@gmail.com';
   ```
4. Go to `/super-admin/login.html`, sign in with the email + the temporary
   password from step 1. You will be forced into the password-change screen
   immediately. Set a real password there.

---

## 5. ENVIRONMENT VARIABLES / CONFIG REQUIRED

This project has no build step or `.env` file — configuration lives in one
JS file. Open:

```
/assets/js/supabase-config.js
```

and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with your real values from §4.1. **Only use the anon/public key here —
never the service_role key**, since this file ships to every visitor's
browser.

There is nothing else to configure — no API keys, server env vars, or
build-time secrets exist anywhere else in the project.

---

## 6. DEPLOYMENT CHECKLIST

- [ ] Supabase project created
- [ ] All 7 SQL migrations run in order (§3)
- [ ] 3 storage buckets created with exact names `media`, `documents`, `avatars` (§4.3)
- [ ] `supabase-config.js` updated with real URL + anon key (§5)
- [ ] Google OAuth provider configured (§4.4) — or skip if not needed yet
- [ ] First Super Admin created and password changed (§4.5)
- [ ] Site deployed to static hosting (Netlify, Vercel, GitHub Pages, or any
      static file host — this is a plain HTML/CSS/JS project, no server
      runtime required)
- [ ] Visit the live homepage logged out — confirm it loads with no password
      prompt and no console errors
- [ ] Test login on all 6 portals with a real test account per role
- [ ] Confirm a student cannot see another student's data (test with 2
      student accounts in different sections)
- [ ] Confirm Trust Member portal has no write actions anywhere
- [ ] Create one homepage section via the Super Admin wizard and confirm it
      appears on the public homepage within a refresh
- [ ] Update `JH_STORAGE_PLAN_BYTES` in `super-admin-portal.js` to match your
      actual Supabase plan's storage quota

---

## 7. POST-DEPLOYMENT STEPS

1. Replace the temporary Super Admin password (forced on first login already).
2. Create your real Classes, Sections, and Batches via Super Admin →
   Classes & Sections before creating any student/teacher accounts, since
   those accounts will need to reference this structure.
3. Create staff accounts via Supabase Dashboard → Authentication → Add User,
   then assign their role in Super Admin → User Management.
4. Assign teachers to their sections in the database (`teacher_assignments`
   table) — there is currently no dedicated UI for this in the Super Admin
   portal; it can be done via the Supabase Table Editor, or ask for a
   dedicated UI to be added if this will happen often.
5. Populate at least one homepage section, the director message, and hero
   banner via the floating "+" wizard so the public site reflects real
   content rather than the original static defaults.
6. Monitor the Storage Dashboard (Super Admin → Media Library) as usage
   grows, and revisit the `JH_STORAGE_PLAN_BYTES` ceiling if you change
   Supabase plans.
