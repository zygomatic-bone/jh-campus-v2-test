-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 007: No-Code CMS Enhancements
-- Achievers, Site Settings (director message / hero / homepage stats)
-- ============================================================

-- ------------------------------------------------------------
-- ACHIEVERS
-- ------------------------------------------------------------

create table achievers (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  photo_url text,
  achievement text not null,           -- e.g. "NEET 2026 — AIR 412"
  rank_label text,                     -- e.g. "AIR 412", "Gold Medalist"
  class_label text,                    -- free text, e.g. "12th PUC Science, Batch 2026"
  is_featured boolean not null default false,
  display_order int not null default 0,
  is_published boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_achievers_published on achievers(is_published, display_order);
create index idx_achievers_featured on achievers(is_featured);

create trigger trg_achievers_updated_at
before update on achievers
for each row execute function jh_set_updated_at();

-- ------------------------------------------------------------
-- SITE SETTINGS
-- Single-row-per-key store for things the Super Admin edits
-- directly: director message, hero banner, homepage statistics.
-- Using a key/value table (rather than one column per setting)
-- so future settings can be added without a migration.
-- ------------------------------------------------------------

create table site_settings (
  key text primary key,                -- e.g. 'director_message', 'hero_banner', 'homepage_stats'
  value jsonb not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Seed the keys the homepage already expects, with sensible
-- defaults so the public site never renders a missing-data gap.
insert into site_settings (key, value) values
  ('director_message', '{"name": "", "title": "", "message": "", "photo_url": ""}'),
  ('hero_banner', '{"image_url": "", "headline": "", "subheadline": ""}'),
  ('homepage_stats', '{"items": []}')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table achievers enable row level security;
alter table site_settings enable row level security;

create policy "achievers_select_public"
on achievers for select
using (is_published = true);

create policy "achievers_select_admin"
on achievers for select
using (jh_current_role() in ('admin','super_admin'));

create policy "achievers_write_admin"
on achievers for all
using (jh_current_role() in ('admin','super_admin'))
with check (jh_current_role() in ('admin','super_admin'));

create policy "site_settings_select_public"
on site_settings for select
using (true);  -- public homepage needs to read these without login

create policy "site_settings_write_super_admin"
on site_settings for all
using (jh_current_role() = 'super_admin')
with check (jh_current_role() = 'super_admin');

-- ------------------------------------------------------------
-- section_items already supports buttons (item_type = 'button',
-- title = button text, link_url = button URL) and stats
-- (item_type = 'stat', stat_value), so no schema change needed
-- there — see 005_cms_schema.sql.
-- ------------------------------------------------------------
