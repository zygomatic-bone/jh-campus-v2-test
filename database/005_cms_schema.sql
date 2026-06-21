-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 005: CMS Schema — Dynamic Sections + Media Library
-- ============================================================

-- ------------------------------------------------------------
-- HOMEPAGE SECTIONS
-- Super Admin creates/edits/reorders these. The public homepage
-- (index.html) fetches published, visible sections client-side
-- and renders them into a designated container — see the
-- "Dynamic Section Renderer" note in the Admin Portal report.
-- ------------------------------------------------------------

create type jh_section_layout as enum ('grid', 'cards', 'gallery', 'timeline', 'statistics', 'custom');

create table homepage_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- internal name, e.g. "BM Superhit Batch"
  slug text not null unique,              -- url-safe identifier
  layout jh_section_layout not null default 'cards',
  banner_url text,
  description text,
  display_order int not null default 0,
  is_published boolean not null default false,  -- draft vs live
  is_hidden boolean not null default false,      -- published but temporarily hidden
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_homepage_sections_order on homepage_sections(display_order);
create index idx_homepage_sections_published on homepage_sections(is_published, is_hidden);

create trigger trg_homepage_sections_updated_at
before update on homepage_sections
for each row execute function jh_set_updated_at();

-- ------------------------------------------------------------
-- SECTION ITEMS
-- The actual content within a section: cards, images, videos,
-- buttons, documents. One flexible table rather than five
-- separate ones, since item shape varies by layout type.
-- ------------------------------------------------------------

create type jh_item_type as enum ('card', 'image', 'video', 'button', 'document', 'stat');

create table section_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references homepage_sections(id) on delete cascade,
  item_type jh_item_type not null,
  title text,
  subtitle text,
  body text,
  media_url text,
  link_url text,
  stat_value text,                        -- for 'stat' type, e.g. "98%"
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_section_items_section on section_items(section_id, display_order);

-- ------------------------------------------------------------
-- MEDIA LIBRARY (metadata table — actual files live in Supabase
-- Storage; this table indexes them for the Media Library UI)
-- ------------------------------------------------------------

create type jh_media_type as enum ('image', 'video', 'pdf', 'document');

create table media_library (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  media_type jh_media_type not null,
  size_bytes bigint,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_media_library_type on media_library(media_type);

-- ------------------------------------------------------------
-- CONTENT APPROVALS
-- Generic approval queue used by Admin Portal — e.g. a teacher's
-- announcement, a gallery upload, etc. flagged for review before
-- going live. Kept generic (target_table/target_id) rather than
-- one table per content type.
-- ------------------------------------------------------------

create type jh_approval_status as enum ('pending', 'approved', 'rejected');

create table content_approvals (
  id uuid primary key default gen_random_uuid(),
  target_table text not null,
  target_id uuid not null,
  submitted_by uuid references profiles(id) on delete set null,
  status jh_approval_status not null default 'pending',
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_content_approvals_status on content_approvals(status);

-- ------------------------------------------------------------
-- GALLERY (public-facing photo gallery, separate from media_library
-- which is the internal asset index — gallery is curated for display)
-- ------------------------------------------------------------

create table gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  caption text,
  display_order int not null default 0,
  is_published boolean not null default false,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_gallery_items_published on gallery_items(is_published, display_order);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table homepage_sections enable row level security;
alter table section_items enable row level security;
alter table media_library enable row level security;
alter table content_approvals enable row level security;
alter table gallery_items enable row level security;

-- Public can read published+visible sections (no login required —
-- this powers the public homepage's dynamic section renderer).
create policy "homepage_sections_select_public"
on homepage_sections for select
using (is_published = true and is_hidden = false);

-- Staff (admin/super_admin) can see everything including drafts.
create policy "homepage_sections_select_admin"
on homepage_sections for select
using (jh_current_role() in ('admin','super_admin'));

create policy "homepage_sections_write_admin"
on homepage_sections for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- Section items inherit visibility from their parent section.
create policy "section_items_select_public"
on section_items for select
using (
  exists (
    select 1 from homepage_sections hs
    where hs.id = section_items.section_id
      and hs.is_published = true and hs.is_hidden = false
  )
);

create policy "section_items_select_admin"
on section_items for select
using (jh_current_role() in ('admin','super_admin'));

create policy "section_items_write_admin"
on section_items for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- Media library: only staff who can upload content need to browse it.
create policy "media_library_select_staff"
on media_library for select
using (jh_current_role() in ('teacher','admin','super_admin'));

create policy "media_library_write_staff"
on media_library for all
using (jh_current_role() in ('teacher','admin','super_admin'))
with check (jh_current_role() in ('teacher','admin','super_admin'));

-- Content approvals: submitter can see their own; admin sees all.
create policy "content_approvals_select_own"
on content_approvals for select
using (submitted_by = auth.uid());

create policy "content_approvals_select_admin"
on content_approvals for select
using (jh_current_role() in ('admin','super_admin'));

create policy "content_approvals_insert_authenticated"
on content_approvals for insert
with check (auth.uid() is not null);

create policy "content_approvals_update_admin"
on content_approvals for update
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

-- Gallery: published items public; admin sees/manages all.
create policy "gallery_items_select_public"
on gallery_items for select
using (is_published = true);

create policy "gallery_items_select_admin"
on gallery_items for select
using (jh_current_role() in ('admin','super_admin'));

create policy "gallery_items_write_admin"
on gallery_items for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));
