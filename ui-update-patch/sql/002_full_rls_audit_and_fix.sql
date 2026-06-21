-- ============================================================
-- FIX: Super Admin (and other staff roles) writes blocked
-- across the whole panel — not just Create User
-- ------------------------------------------------------------
-- SYMPTOMS REPORTED:
--   - Create User fails
--   - Profile creation fails
--   - Publishing actions fail
--   - Approval actions fail
--   - Other write operations fail
--   - Reads/dashboard load fine — only writes are blocked
--
-- This pattern (reads OK, writes blocked, "permission denied")
-- on a Supabase project is almost always one root cause: RLS is
-- enabled on these tables, and existing policies — if any —
-- only ever check the ROW BEING WRITTEN, never the ACTING
-- USER'S OWN ROLE. A super_admin trying to write someone else's
-- row, or any row that isn't "owned" by the current auth.uid(),
-- gets silently denied by Postgres before the write logic ever
-- runs.
--
-- This migration audits and fixes RLS across every table the
-- front-end actually writes to (verified directly against the
-- shipped JS, not assumed) — not just `profiles`.
-- ============================================================


-- ============================================================
-- STEP 0 — AUDIT FIRST (read-only — run this and review the
-- output before applying anything below)
-- ============================================================

-- 0a. Which of these tables have RLS enabled?
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relname in (
  'profiles','achievers','activity_logs','announcements','assignments',
  'attendance','batches','classes','content_approvals','downloads','exams',
  'gallery_items','homepage_sections','marks','media_library',
  'question_bank','results','section_items','sections','site_settings',
  'teacher_assignments'
)
order by relname;

-- 0b. What policies currently exist on each of these tables?
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in (
  'profiles','achievers','activity_logs','announcements','assignments',
  'attendance','batches','classes','content_approvals','downloads','exams',
  'gallery_items','homepage_sections','marks','media_library',
  'question_bank','results','section_items','sections','site_settings',
  'teacher_assignments'
)
order by tablename, cmd;

-- 0c. Confirm your own account's actual stored role + status —
-- this directly tests "is the current session recognized as
-- super_admin". Run this AS the super_admin user (e.g. via the
-- browser's network tab session, or by temporarily querying
-- with that user's JWT in the SQL editor's "Run as" feature if
-- available). In the plain SQL editor (which runs as postgres,
-- bypassing RLS) this just confirms the row's data is correct —
-- it does NOT prove RLS will recognize it; use 0d for that.
select id, email, role, status from public.profiles where role = 'super_admin';

-- 0d. Sanity check: does auth.uid() resolve at all when called
-- from a policy context vs. the SQL editor? In the SQL editor
-- (run as postgres/service role) auth.uid() returns NULL — that
-- is EXPECTED here and does not indicate a bug. The real test is
-- whether the app's anon-key session (a real logged-in browser
-- tab) can write. This migration's correctness depends on policy
-- logic, not on what auth.uid() shows in this editor.
select auth.uid();


-- ============================================================
-- STEP 1 — Helper function: get the ACTING (currently
-- authenticated) user's own role + status
-- ------------------------------------------------------------
-- SECURITY DEFINER lets this function read `profiles` on the
-- caller's behalf regardless of RLS — but it is hard-coded to
-- only ever look up auth.uid() (the caller itself), so it can't
-- be used to leak another user's data, and it avoids the classic
-- RLS self-recursion bug: a policy on `profiles` that queries
-- `profiles` directly inside its own USING/WITH CHECK clause can
-- deadlock or always-deny depending on evaluation order. Routing
-- through a SECURITY DEFINER function sidesteps that entirely.
-- ============================================================

create or replace function public.jh_current_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.jh_current_status()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select status from public.profiles where id = auth.uid()
$$;

-- Convenience wrapper used throughout this file: "is the caller
-- a super_admin?" Centralizing this in one function means if you
-- ever need to change the definition (e.g. also allow a future
-- 'owner' role), you change it ONCE.
--
-- IMPORTANT: this intentionally checks ROLE ONLY, not status.
-- An earlier draft of this migration also required status =
-- 'active', which creates a deadlock: every brand-new account
-- (including the very first super_admin ever created, via the
-- OAuth self-insert in oauth-callback.html) starts as status =
-- 'pending', and the only way to become 'active' is for an
-- active super_admin to approve them — but if the role-check
-- itself requires status = 'active', nobody could ever approve
-- the first account, and any super_admin whose status drifted to
-- pending/inactive for any reason would be silently locked out of
-- every write in the panel, which matches the exact symptom
-- reported ("role detection failing"). The app's own authGuard()
-- already redirects pending/inactive users away from the
-- dashboard at the UI layer — RLS does not need to duplicate that
-- check, and duplicating it here is what causes the lockout risk.
create or replace function public.jh_is_active_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  )
$$;

create or replace function public.jh_is_active_role(target_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = target_role
  )
$$;

grant execute on function public.jh_current_role()        to authenticated;
grant execute on function public.jh_current_status()       to authenticated;
grant execute on function public.jh_is_active_super_admin() to authenticated;
grant execute on function public.jh_is_active_role(text)   to authenticated;


-- ============================================================
-- STEP 2 — Enable RLS everywhere (no-op if already on; this is
-- defensive in case any table was somehow left without RLS,
-- which would be a worse problem — wide-open writes — than the
-- one reported)
-- ============================================================

alter table public.profiles            enable row level security;
alter table public.achievers           enable row level security;
alter table public.activity_logs       enable row level security;
alter table public.announcements       enable row level security;
alter table public.assignments         enable row level security;
alter table public.attendance          enable row level security;
alter table public.batches             enable row level security;
alter table public.classes             enable row level security;
alter table public.content_approvals   enable row level security;
alter table public.downloads           enable row level security;
alter table public.exams               enable row level security;
alter table public.gallery_items       enable row level security;
alter table public.homepage_sections   enable row level security;
alter table public.marks               enable row level security;
alter table public.media_library       enable row level security;
alter table public.question_bank       enable row level security;
alter table public.results             enable row level security;
alter table public.section_items       enable row level security;
alter table public.sections            enable row level security;
alter table public.site_settings       enable row level security;
alter table public.teacher_assignments enable row level security;


-- ============================================================
-- STEP 3 — PROFILES
-- ------------------------------------------------------------
-- Two distinct legitimate INSERT paths exist in the actual app
-- code (verified in oauth-callback.html on every portal):
--   (a) A brand-new OAuth user inserting THEIR OWN first-time
--       profile row (id = auth.uid()), status defaults to
--       'pending' until staff approves it.
--   (b) A super_admin inserting a profile row for SOMEONE ELSE
--       (Create User flow).
-- A policy that only allowed (b) would break (a) — first-time
-- Google sign-in would fail for every new user. Both are
-- included below.
-- ============================================================

-- ---- SELECT ----
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.jh_current_role() in ('super_admin', 'admin', 'principal', 'trust_member')
);

-- ---- INSERT ----
drop policy if exists "profiles_insert_self_or_super_admin" on public.profiles;
create policy "profiles_insert_self_or_super_admin"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or public.jh_is_active_super_admin()
);

-- ---- UPDATE ----
drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
)
with check (
  id = auth.uid()
  or public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
);

-- ---- DELETE ----
drop policy if exists "profiles_delete_super_admin_only" on public.profiles;
create policy "profiles_delete_super_admin_only"
on public.profiles
for delete
to authenticated
using (
  public.jh_is_active_super_admin()
);


-- ============================================================
-- STEP 4 — SUPER-ADMIN-ONLY CMS TABLES
-- ------------------------------------------------------------
-- Verified against super-admin-portal.js + content-wizard.js:
-- batches, classes, sections, homepage_sections, section_items,
-- media_library, site_settings are written ONLY from the
-- super_admin-gated portal. Reads need to be broader (other
-- portals read classes/sections for their own dashboards), but
-- writes are super_admin-only for all of these.
-- ============================================================

-- ---- batches ----
drop policy if exists "batches_select_authenticated" on public.batches;
create policy "batches_select_authenticated"
on public.batches for select to authenticated using (true);

drop policy if exists "batches_write_super_admin" on public.batches;
create policy "batches_write_super_admin"
on public.batches for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- classes ----
drop policy if exists "classes_select_authenticated" on public.classes;
create policy "classes_select_authenticated"
on public.classes for select to authenticated using (true);

drop policy if exists "classes_write_super_admin" on public.classes;
create policy "classes_write_super_admin"
on public.classes for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- sections ----
drop policy if exists "sections_select_authenticated" on public.sections;
create policy "sections_select_authenticated"
on public.sections for select to authenticated using (true);

drop policy if exists "sections_write_super_admin" on public.sections;
create policy "sections_write_super_admin"
on public.sections for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- homepage_sections ----
-- Public-readable: the homepage itself reads published sections
-- with no login at all (anon role), so SELECT must allow anon too.
drop policy if exists "homepage_sections_select_public" on public.homepage_sections;
create policy "homepage_sections_select_public"
on public.homepage_sections for select to anon, authenticated using (true);

drop policy if exists "homepage_sections_write_super_admin" on public.homepage_sections;
create policy "homepage_sections_write_super_admin"
on public.homepage_sections for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- section_items ----
drop policy if exists "section_items_select_public" on public.section_items;
create policy "section_items_select_public"
on public.section_items for select to anon, authenticated using (true);

drop policy if exists "section_items_write_super_admin" on public.section_items;
create policy "section_items_write_super_admin"
on public.section_items for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- media_library ----
drop policy if exists "media_library_select_super_admin" on public.media_library;
create policy "media_library_select_super_admin"
on public.media_library for select to authenticated
using (public.jh_is_active_super_admin());

drop policy if exists "media_library_write_super_admin" on public.media_library;
create policy "media_library_write_super_admin"
on public.media_library for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- site_settings ----
-- Public-readable (dynamic-sections.js reads this with no login,
-- e.g. for site-wide toggles shown on the public homepage).
drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public"
on public.site_settings for select to anon, authenticated using (true);

drop policy if exists "site_settings_write_super_admin" on public.site_settings;
create policy "site_settings_write_super_admin"
on public.site_settings for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());


-- ============================================================
-- STEP 5 — SHARED CONTENT TABLES (written by super_admin via
-- the wizard AND/OR by admin/teacher from their own portals —
-- verified per table against the actual write sites in the app)
-- ============================================================

-- ---- achievers ---- (insert: super_admin only, per content-wizard.js)
drop policy if exists "achievers_select_public" on public.achievers;
create policy "achievers_select_public"
on public.achievers for select to anon, authenticated using (true);

drop policy if exists "achievers_write_super_admin" on public.achievers;
create policy "achievers_write_super_admin"
on public.achievers for all to authenticated
using (public.jh_is_active_super_admin())
with check (public.jh_is_active_super_admin());

-- ---- gallery_items ---- (insert: super_admin via wizard, OR admin per admin-portal.js)
drop policy if exists "gallery_items_select_public" on public.gallery_items;
create policy "gallery_items_select_public"
on public.gallery_items for select to anon, authenticated using (true);

drop policy if exists "gallery_items_write_staff" on public.gallery_items;
create policy "gallery_items_write_staff"
on public.gallery_items for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'));

-- ---- announcements ---- (insert: super_admin via wizard, admin, AND teacher — all verified)
drop policy if exists "announcements_select_public_or_staff" on public.announcements;
create policy "announcements_select_public_or_staff"
on public.announcements for select to anon, authenticated using (true);

drop policy if exists "announcements_write_staff" on public.announcements;
create policy "announcements_write_staff"
on public.announcements for all to authenticated
using (
  public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
  or public.jh_is_active_role('teacher')
)
with check (
  public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
  or public.jh_is_active_role('teacher')
);

-- ---- downloads ---- (insert: super_admin via wizard, admin, AND teacher)
drop policy if exists "downloads_select_public" on public.downloads;
create policy "downloads_select_public"
on public.downloads for select to anon, authenticated using (true);

drop policy if exists "downloads_write_staff" on public.downloads;
create policy "downloads_write_staff"
on public.downloads for all to authenticated
using (
  public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
  or public.jh_is_active_role('teacher')
)
with check (
  public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
  or public.jh_is_active_role('teacher')
);


-- ============================================================
-- STEP 6 — ADMIN-PORTAL TABLE: content_approvals
-- ------------------------------------------------------------
-- admin-portal.js only ever UPDATEs this table (approve/reject
-- workflow) — no insert/delete site found in the app, so this
-- intentionally only grants UPDATE + SELECT to admin/super_admin.
-- If you later add an insert path, extend this policy.
-- ============================================================

drop policy if exists "content_approvals_select_staff" on public.content_approvals;
create policy "content_approvals_select_staff"
on public.content_approvals for select to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'));

drop policy if exists "content_approvals_update_staff" on public.content_approvals;
create policy "content_approvals_update_staff"
on public.content_approvals for update to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'));


-- ============================================================
-- STEP 7 — TEACHER / PRINCIPAL ACADEMIC TABLES
-- ------------------------------------------------------------
-- Not in the original bug report, but audited for completeness
-- since the ticket asked for a COMPLETE audit across CMS-managed
-- tables. These follow the same "acting role" pattern. Adjust
-- the student-facing SELECT scoping (e.g. "only their own
-- attendance/marks") if your `attendance`/`marks`/`results`
-- tables have a student_id column to scope by — verify the
-- actual column name in your schema before tightening further.
-- ============================================================

-- ---- assignments ---- (teacher writes, everyone authenticated can read)
drop policy if exists "assignments_select_authenticated" on public.assignments;
create policy "assignments_select_authenticated"
on public.assignments for select to authenticated using (true);

drop policy if exists "assignments_write_teacher" on public.assignments;
create policy "assignments_write_teacher"
on public.assignments for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'));

-- ---- attendance ---- (teacher writes/upserts)
drop policy if exists "attendance_select_authenticated" on public.attendance;
create policy "attendance_select_authenticated"
on public.attendance for select to authenticated using (true);

drop policy if exists "attendance_write_teacher" on public.attendance;
create policy "attendance_write_teacher"
on public.attendance for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'));

-- ---- marks ---- (teacher upserts)
drop policy if exists "marks_select_authenticated" on public.marks;
create policy "marks_select_authenticated"
on public.marks for select to authenticated using (true);

drop policy if exists "marks_write_teacher" on public.marks;
create policy "marks_write_teacher"
on public.marks for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'));

-- ---- question_bank ---- (teacher inserts)
drop policy if exists "question_bank_select_authenticated" on public.question_bank;
create policy "question_bank_select_authenticated"
on public.question_bank for select to authenticated using (true);

drop policy if exists "question_bank_write_teacher" on public.question_bank;
create policy "question_bank_write_teacher"
on public.question_bank for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('teacher'));

-- ---- exams ---- (no write site found in current app code —
-- read-only policy only; add a write policy here if/when a
-- create-exam UI ships)
drop policy if exists "exams_select_authenticated" on public.exams;
create policy "exams_select_authenticated"
on public.exams for select to authenticated using (true);

-- ---- results ---- (principal upserts)
drop policy if exists "results_select_authenticated" on public.results;
create policy "results_select_authenticated"
on public.results for select to authenticated using (true);

drop policy if exists "results_write_principal" on public.results;
create policy "results_write_principal"
on public.results for all to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('principal'))
with check (public.jh_is_active_super_admin() or public.jh_is_active_role('principal'));

-- ---- teacher_assignments ---- (read-only site found; no write
-- call detected in teacher-portal.js beyond line 31's read —
-- read-only policy only, matching current app behavior)
drop policy if exists "teacher_assignments_select_own_or_staff" on public.teacher_assignments;
create policy "teacher_assignments_select_own_or_staff"
on public.teacher_assignments for select to authenticated
using (
  teacher_id = auth.uid()
  or public.jh_is_active_super_admin()
  or public.jh_is_active_role('principal')
);
-- NOTE: if teacher_assignments has no `teacher_id` column, this
-- policy will error on apply — check Step 0c's column listing for
-- this table and adjust the column name before running.


-- ============================================================
-- STEP 8 — activity_logs
-- ------------------------------------------------------------
-- Write-only audit trail. Any staff role that performs logged
-- actions needs INSERT. Nobody needs UPDATE/DELETE (logs should
-- be immutable) — intentionally not granted.
-- ============================================================

drop policy if exists "activity_logs_select_staff" on public.activity_logs;
create policy "activity_logs_select_staff"
on public.activity_logs for select to authenticated
using (public.jh_is_active_super_admin() or public.jh_is_active_role('admin'));

drop policy if exists "activity_logs_insert_staff" on public.activity_logs;
create policy "activity_logs_insert_staff"
on public.activity_logs for insert to authenticated
with check (
  public.jh_is_active_super_admin()
  or public.jh_is_active_role('admin')
);


-- ============================================================
-- STEP 9 — VERIFY
-- ============================================================

select tablename, policyname, cmd, roles
from pg_policies
where tablename in (
  'profiles','achievers','activity_logs','announcements','assignments',
  'attendance','batches','classes','content_approvals','downloads','exams',
  'gallery_items','homepage_sections','marks','media_library',
  'question_bank','results','section_items','sections','site_settings',
  'teacher_assignments'
)
order by tablename, cmd;
