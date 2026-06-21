-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 002: Row Level Security Policies
-- ============================================================
-- This is the layer that actually matters for security.
-- authGuard() in the client only controls navigation/UX — a user
-- could bypass it entirely by calling the Supabase API directly.
-- These policies are what actually stop a student from reading
-- another student's marks, or a teacher from editing grades for
-- a section they don't teach.
--
-- Convention used throughout: every table has RLS enabled, and
-- every policy is written as restrictively as possible — default
-- deny, explicit allow.
-- ============================================================

alter table profiles enable row level security;
alter table classes enable row level security;
alter table sections enable row level security;
alter table batches enable row level security;
alter table academic_years enable row level security;
alter table teacher_assignments enable row level security;
alter table activity_logs enable row level security;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------

-- Everyone can read their own profile.
create policy "profiles_select_own"
on profiles for select
using (id = auth.uid());

-- Staff (teacher/principal/trust_member/admin/super_admin) can read
-- all profiles — needed for rosters, analytics, approvals.
-- Students can only ever see their own row (handled by the policy above;
-- there is no broader student-select policy).
create policy "profiles_select_staff"
on profiles for select
using (
  jh_current_role() in ('teacher','principal','trust_member','admin','super_admin')
);

-- Users may update limited fields on their own profile (handled at the
-- application layer by only sending safe columns — Postgres RLS does not
-- do column-level restriction directly, so the API layer must only
-- ever submit: full_name, phone, profile_photo_url for self-updates).
create policy "profiles_update_own"
on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- Only admin/super_admin can update OTHER users' profiles (role changes,
-- status changes, password-reset flags, academic assignment, etc).
create policy "profiles_update_admin"
on profiles for update
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- Only admin/super_admin can create new profiles directly (normal signup
-- flow inserts via a SECURITY DEFINER trigger on auth.users instead —
-- see 003 — this policy covers admin-created accounts).
create policy "profiles_insert_admin"
on profiles for insert
with check (jh_current_role() in ('admin','super_admin'));

-- Only super_admin can delete profiles. Admin cannot delete users —
-- deactivate via status='inactive' instead.
create policy "profiles_delete_super_admin"
on profiles for delete
using (jh_current_role() = 'super_admin');

-- ------------------------------------------------------------
-- ACADEMIC STRUCTURE (classes / sections / batches / academic_years)
-- Readable by all authenticated staff + students (needed for
-- dropdowns, filters, displaying "Class: 1st PUC" on a profile).
-- Writable only by admin/super_admin.
-- ------------------------------------------------------------

create policy "classes_select_authenticated"
on classes for select
using (auth.uid() is not null);

create policy "classes_write_admin"
on classes for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

create policy "sections_select_authenticated"
on sections for select
using (auth.uid() is not null);

create policy "sections_write_admin"
on sections for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

create policy "batches_select_authenticated"
on batches for select
using (auth.uid() is not null);

create policy "batches_write_admin"
on batches for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

create policy "academic_years_select_authenticated"
on academic_years for select
using (auth.uid() is not null);

create policy "academic_years_write_admin"
on academic_years for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- ------------------------------------------------------------
-- TEACHER ASSIGNMENTS
-- Teachers can see their own assignments (to know which sections
-- they can upload marks/attendance for). Admins manage all.
-- ------------------------------------------------------------

create policy "teacher_assignments_select_own"
on teacher_assignments for select
using (teacher_id = auth.uid());

create policy "teacher_assignments_select_admin"
on teacher_assignments for select
using (jh_current_role() in ('principal','trust_member','admin','super_admin'));

create policy "teacher_assignments_write_admin"
on teacher_assignments for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- ------------------------------------------------------------
-- ACTIVITY LOGS
-- Only admin/super_admin can read logs. Any authenticated user's
-- actions can be logged (insert), but never read back except by staff.
-- ------------------------------------------------------------

create policy "activity_logs_select_admin"
on activity_logs for select
using (jh_current_role() in ('admin','super_admin'));

create policy "activity_logs_insert_authenticated"
on activity_logs for insert
with check (auth.uid() is not null);

-- No update/delete policy on activity_logs at all — logs are append-only
-- by design. Even super_admin cannot edit/delete a log row through the API.
