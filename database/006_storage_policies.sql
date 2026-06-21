-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 006: Storage Bucket Policies
-- ============================================================
-- Run this AFTER creating the buckets below in the Supabase
-- Dashboard (Storage -> New Bucket). This file only sets the
-- RLS policies on storage.objects scoped to each bucket — it
-- cannot create the buckets themselves via plain SQL in all
-- Supabase versions, so create them first:
--
--   1. "media"       — public bucket (images/videos for CMS sections, gallery)
--   2. "documents"   — private bucket (assignments, downloads, question bank, results PDFs)
--   3. "avatars"     — public bucket (profile photos)
--
-- Dashboard steps: Storage -> New Bucket -> name it exactly as
-- above -> toggle "Public bucket" ON for media/avatars, OFF for documents.
-- ============================================================

-- ------------------------------------------------------------
-- MEDIA bucket (public read, staff write)
-- ------------------------------------------------------------
create policy "media_public_read"
on storage.objects for select
using (bucket_id = 'media');

create policy "media_staff_write"
on storage.objects for insert
with check (
  bucket_id = 'media'
  and jh_current_role() in ('teacher','admin','super_admin')
);

create policy "media_staff_update"
on storage.objects for update
using (
  bucket_id = 'media'
  and jh_current_role() in ('teacher','admin','super_admin')
);

create policy "media_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'media'
  and jh_current_role() in ('admin','super_admin')
);

-- ------------------------------------------------------------
-- DOCUMENTS bucket (private)
-- ------------------------------------------------------------
-- IMPORTANT FINDING FROM FINAL AUDIT: a blanket "any authenticated
-- user can read any file in this bucket" policy would let a student
-- enumerate/guess storage paths and read another section's files,
-- even though the `assignments`/`downloads`/`question_bank` TABLES
-- correctly scope by section/class. Storage objects don't know
-- about those relationships on their own, so we restrict bucket
-- reads to staff roles here, and serve students via signed URLs
-- generated server-side... but there is no server in this project.
--
-- PRACTICAL FIX: students read documents via the file_url stored in
-- assignments/downloads/question_bank rows, which is only visible to
-- them because the TABLE's RLS already scopes it correctly. To stop
-- path guessing, this policy ties bucket reads to a matching row in
-- one of those tables that the requesting student is entitled to see.
-- This still relies on those table policies being correct (audited
-- above and confirmed section/class scoped), but removes the blanket
-- "any authenticated user, any path" hole.
create policy "documents_scoped_read"
on storage.objects for select
using (
  bucket_id = 'documents'
  and (
    jh_current_role() in ('teacher','principal','trust_member','admin','super_admin')
    or exists (
      select 1 from assignments a
      join profiles p on p.id = auth.uid()
      where a.file_url like '%' || storage.objects.name
        and a.section_id = p.section_id
    )
    or exists (
      select 1 from downloads d
      join profiles p on p.id = auth.uid()
      where d.file_url like '%' || storage.objects.name
        and (d.class_id is null or d.class_id = p.class_id)
    )
    or exists (
      select 1 from question_bank q
      join profiles p on p.id = auth.uid()
      where q.file_url like '%' || storage.objects.name
        and (q.class_id is null or q.class_id = p.class_id)
    )
  )
);

create policy "documents_staff_write"
on storage.objects for insert
with check (
  bucket_id = 'documents'
  and jh_current_role() in ('teacher','admin','super_admin')
);

create policy "documents_staff_update"
on storage.objects for update
using (
  bucket_id = 'documents'
  and jh_current_role() in ('teacher','admin','super_admin')
);

create policy "documents_staff_delete"
on storage.objects for delete
using (
  bucket_id = 'documents'
  and jh_current_role() in ('admin','super_admin')
);

-- ------------------------------------------------------------
-- AVATARS bucket (public read, each user manages only their own
-- avatar — path convention enforced at upload time as
-- `avatars/{user_id}/...`)
-- ------------------------------------------------------------
create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_own_write"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_own_update"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_own_delete"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
