-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 001: Core Schema — Roles, Academic Structure, Profiles
-- ============================================================
-- Run this in the Supabase SQL editor (or via CLI migration) on a
-- fresh project. Migrations are numbered and must run in order:
--   001_core_schema.sql   (this file)
--   002_rls_policies.sql
--   003_academic_data.sql
--   004_cms_schema.sql
--   005_storage_policies.sql
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type jh_role as enum (
  'student',
  'teacher',
  'principal',
  'trust_member',
  'admin',
  'super_admin'
);

create type jh_status as enum (
  'pending',   -- created via Google OAuth, awaiting admin approval/role confirmation
  'active',
  'inactive'
);

-- ------------------------------------------------------------
-- ACADEMIC STRUCTURE
-- Super Admin manages these. Everything downstream (attendance,
-- marks, assignments, analytics) filters by class/section/batch,
-- so this structure is created first and referenced everywhere.
-- ------------------------------------------------------------

create table academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,           -- e.g. "2026-27"
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                   -- e.g. "1st PUC", "Hifz", "Degree 1st Year"
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (name)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,                   -- e.g. "Science A", "Section A"
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,           -- e.g. "2026", "2027"
  academic_year_id uuid references academic_years(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PROFILES
-- One row per authenticated user (id = auth.users.id). Holds the
-- role used by authGuard() and RLS, plus full student academic
-- fields. Non-student roles simply leave the academic columns null.
-- ------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  full_name text not null,
  email text not null unique,
  phone text,
  role jh_role not null,
  status jh_status not null default 'active',

  profile_photo_url text,
  auth_provider text not null default 'password',  -- 'password' | 'google'
  must_change_password boolean not null default false,

  -- Student-only academic fields (null for all other roles)
  student_id text unique,               -- school-issued roll/admission number
  class_id uuid references classes(id) on delete set null,
  section_id uuid references sections(id) on delete set null,
  batch_id uuid references batches(id) on delete set null,

  -- Teacher-only: which classes/sections they teach (kept simple here;
  -- expanded in 003_academic_data.sql with a proper join table for
  -- teachers who teach multiple sections/subjects).

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role);
create index idx_profiles_class on profiles(class_id);
create index idx_profiles_section on profiles(section_id);
create index idx_profiles_batch on profiles(batch_id);
create index idx_profiles_status on profiles(status);

-- Keep updated_at current automatically.
create or replace function jh_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function jh_set_updated_at();

-- ------------------------------------------------------------
-- TEACHER <-> SECTION ASSIGNMENTS
-- A teacher can teach multiple sections and/or subjects.
-- ------------------------------------------------------------

create table teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  subject text,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, section_id, subject)
);

create index idx_teacher_assignments_teacher on teacher_assignments(teacher_id);
create index idx_teacher_assignments_section on teacher_assignments(section_id);

-- ------------------------------------------------------------
-- ACTIVITY LOG (used by Admin/Super Admin "Logs" feature)
-- ------------------------------------------------------------

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,                 -- e.g. "user.created", "section.published"
  target_table text,
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_logs_actor on activity_logs(actor_id);
create index idx_activity_logs_created on activity_logs(created_at desc);

-- ------------------------------------------------------------
-- HELPER FUNCTION: current user's role
-- Used heavily by RLS policies in 002_rls_policies.sql.
-- SECURITY DEFINER + stable so it can be used inside policies
-- without recursive RLS evaluation issues.
-- ------------------------------------------------------------

create or replace function jh_current_role()
returns jh_role
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function jh_current_status()
returns jh_status
language sql
security definer
stable
as $$
  select status from profiles where id = auth.uid();
$$;
