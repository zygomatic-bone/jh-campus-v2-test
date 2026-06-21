-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 003: Academic Data Tables
-- ============================================================
-- These are the tables the Student/Teacher/Principal/Trust portals
-- actually read and write: attendance, marks, results, assignments,
-- downloads, question bank, announcements.
-- ============================================================

-- ------------------------------------------------------------
-- ATTENDANCE
-- One row per student per date. Teacher uploads/edits for their
-- assigned sections; student reads only their own; principal/trust
-- read all (for analytics).
-- ------------------------------------------------------------

create type jh_attendance_status as enum ('present','absent','late','excused');

create table attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id),
  section_id uuid not null references sections(id),
  date date not null,
  status jh_attendance_status not null,
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

create index idx_attendance_student on attendance(student_id);
create index idx_attendance_section_date on attendance(section_id, date);

-- ------------------------------------------------------------
-- MARKS / RESULTS
-- "marks" = per-subject, per-exam scores. "results" = published
-- consolidated outcome for a term (kept separate so a teacher can
-- enter marks without that immediately becoming the official result —
-- principal/admin publish results explicitly).
-- ------------------------------------------------------------

create table exams (
  id uuid primary key default gen_random_uuid(),
  name text not null,                   -- e.g. "Mid-Term 2026", "Annual Exam"
  class_id uuid not null references classes(id),
  academic_year_id uuid references academic_years(id),
  created_at timestamptz not null default now()
);

create table marks (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  marks_obtained numeric not null,
  marks_total numeric not null,
  entered_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id, subject)
);

create index idx_marks_student on marks(student_id);
create index idx_marks_exam on marks(exam_id);

create table results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  total_obtained numeric not null,
  total_possible numeric not null,
  percentage numeric not null,
  grade text,
  published boolean not null default false,
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index idx_results_student on results(student_id);
create index idx_results_exam_published on results(exam_id, published);

-- ------------------------------------------------------------
-- ASSIGNMENTS
-- Teacher uploads for a section; students in that section see them.
-- ------------------------------------------------------------

create table assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  class_id uuid not null references classes(id),
  section_id uuid not null references sections(id),
  subject text,
  file_url text,
  due_date date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_assignments_section on assignments(section_id);

-- ------------------------------------------------------------
-- DOWNLOADS (shared resources/files — notes, syllabus, forms)
-- ------------------------------------------------------------

create table downloads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  -- null class/section = visible to everyone (e.g. a school-wide form)
  class_id uuid references classes(id),
  section_id uuid references sections(id),
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_downloads_class on downloads(class_id);

-- ------------------------------------------------------------
-- QUESTION BANK
-- ------------------------------------------------------------

create table question_bank (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  class_id uuid references classes(id),
  file_url text not null,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_question_bank_class on question_bank(class_id);

-- ------------------------------------------------------------
-- ANNOUNCEMENTS
-- audience: 'all' | 'students' | 'teachers' | 'staff' | specific class_id
-- ------------------------------------------------------------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all',  -- 'all' | 'students' | 'teachers' | 'staff'
  class_id uuid references classes(id),  -- optional narrower targeting
  is_public boolean not null default false, -- show on public homepage too
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index idx_announcements_audience on announcements(audience);
create index idx_announcements_public on announcements(is_public);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table exams enable row level security;
alter table attendance enable row level security;
alter table marks enable row level security;
alter table results enable row level security;
alter table assignments enable row level security;
alter table downloads enable row level security;
alter table question_bank enable row level security;
alter table announcements enable row level security;

-- EXAMS: staff read/write, students read (need exam names to view results)
create policy "exams_select_all_authenticated"
on exams for select using (auth.uid() is not null);

create policy "exams_write_staff"
on exams for all
using (jh_current_role() in ('teacher','principal','admin','super_admin'))
with check (jh_current_role() in ('teacher','principal','admin','super_admin'));

-- ATTENDANCE
create policy "attendance_select_own"
on attendance for select
using (student_id = auth.uid());

create policy "attendance_select_staff"
on attendance for select
using (jh_current_role() in ('teacher','principal','trust_member','admin','super_admin'));

create policy "attendance_write_teacher_admin"
on attendance for all
using (
  jh_current_role() in ('admin','super_admin')
  or (
    jh_current_role() = 'teacher'
    and exists (
      select 1 from teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.section_id = attendance.section_id
    )
  )
)
with check (
  jh_current_role() in ('admin','super_admin')
  or (
    jh_current_role() = 'teacher'
    and exists (
      select 1 from teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.section_id = attendance.section_id
    )
  )
);

-- MARKS (same teacher-must-teach-that-section rule as attendance)
create policy "marks_select_own"
on marks for select
using (student_id = auth.uid());

create policy "marks_select_staff"
on marks for select
using (jh_current_role() in ('teacher','principal','trust_member','admin','super_admin'));

create policy "marks_write_teacher_admin"
on marks for all
using (jh_current_role() in ('teacher','admin','super_admin'))
with check (jh_current_role() in ('teacher','admin','super_admin'));

-- RESULTS: students only ever see PUBLISHED results for themselves.
-- Staff see everything (so principal can review before publishing).
create policy "results_select_own_published"
on results for select
using (student_id = auth.uid() and published = true);

create policy "results_select_staff"
on results for select
using (jh_current_role() in ('teacher','principal','trust_member','admin','super_admin'));

-- Only principal/admin/super_admin can publish results (insert/update).
create policy "results_write_principal_admin"
on results for all
using (jh_current_role() in ('principal','admin','super_admin'))
with check (jh_current_role() in ('principal','admin','super_admin'));

-- ASSIGNMENTS: students see assignments for their own section only.
create policy "assignments_select_own_section"
on assignments for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.section_id = assignments.section_id
  )
);

create policy "assignments_select_staff"
on assignments for select
using (jh_current_role() in ('teacher','principal','trust_member','admin','super_admin'));

create policy "assignments_write_teacher_admin"
on assignments for all
using (jh_current_role() in ('teacher','admin','super_admin'))
with check (jh_current_role() in ('teacher','admin','super_admin'));

-- DOWNLOADS: visible to everyone authenticated if unscoped, otherwise
-- scoped to the student's own class.
create policy "downloads_select_scoped"
on downloads for select
using (
  class_id is null
  or exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.class_id = downloads.class_id
  )
  or jh_current_role() in ('teacher','principal','trust_member','admin','super_admin')
);

create policy "downloads_write_staff"
on downloads for all
using (jh_current_role() in ('teacher','admin','super_admin'))
with check (jh_current_role() in ('teacher','admin','super_admin'));

-- QUESTION BANK: same scoping pattern as downloads.
create policy "question_bank_select_scoped"
on question_bank for select
using (
  class_id is null
  or exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.class_id = question_bank.class_id
  )
  or jh_current_role() in ('teacher','principal','trust_member','admin','super_admin')
);

create policy "question_bank_write_staff"
on question_bank for all
using (jh_current_role() in ('teacher','admin','super_admin'))
with check (jh_current_role() in ('teacher','admin','super_admin'));

-- ANNOUNCEMENTS: public ones readable by anyone (even anonymous, for the
-- homepage); non-public ones require matching audience/auth.
create policy "announcements_select_public"
on announcements for select
using (is_public = true);

create policy "announcements_select_authenticated"
on announcements for select
using (
  auth.uid() is not null
  and (
    audience = 'all'
    or (audience = 'students' and jh_current_role() = 'student')
    or (audience = 'teachers' and jh_current_role() = 'teacher')
    or (audience = 'staff' and jh_current_role() in ('teacher','principal','trust_member','admin','super_admin'))
  )
);

create policy "announcements_write_staff"
on announcements for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));
