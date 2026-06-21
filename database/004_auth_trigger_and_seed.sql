-- ============================================================
-- JH+ CAMPUS MANAGEMENT SYSTEM
-- Migration 004: Auth Trigger + Super Admin Seeding
-- ============================================================

-- ------------------------------------------------------------
-- AUTO-CREATE PROFILE ON SIGNUP
-- Fires when a new row appears in auth.users (i.e. right after
-- someone signs up). Default role is 'student' with status
-- 'pending' — an admin must assign the correct role before the
-- account can do anything (RLS on profiles_update_admin handles
-- that). This prevents a random signup from silently becoming
-- a teacher or admin.
--
-- NOTE: Google OAuth signups are handled separately in each
-- portal's oauth-callback.html, which inserts a profile row
-- itself with the EXPECTED role for that portal (still status =
-- 'pending' until approved). This trigger only covers the
-- email/password signup path, if you choose to expose one.
-- ------------------------------------------------------------

create or replace function jh_handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, email, role, status, auth_provider)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'student',
    'pending',
    'password'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function jh_handle_new_user();

-- ============================================================
-- SUPER ADMIN SEEDING — DO THIS MANUALLY, ONE TIME ONLY
-- ============================================================
-- This is intentionally NOT automated and NOT a hardcoded password
-- in any file. Run these steps yourself, once, after deploying:
--
-- STEP 1 — Create the auth user
-- ------------------------------------------------------------
-- In the Supabase Dashboard:
--   Authentication -> Users -> Add User
--   Email:    eclass603@gmail.com
--   Password: <choose a strong password yourself, write it down nowhere>
--   ✅ Check "Auto Confirm User"
--
-- This creates the auth.users row, which fires the trigger above
-- and creates a 'student' / 'pending' profile automatically.
--
-- STEP 2 — Promote that profile to super_admin
-- ------------------------------------------------------------
-- Run this in the SQL editor, replacing the UUID with the actual
-- id shown for that user in Authentication -> Users:
--
--   update profiles
--   set role = 'super_admin',
--       status = 'active',
--       must_change_password = true,
--       full_name = 'Super Admin'
--   where email = 'eclass603@gmail.com';
--
-- The must_change_password = true means the very first login will
-- redirect to /super-admin/force-password-change.html before any
-- dashboard access is granted — so even the password you set in
-- Step 1 gets replaced immediately by something only the real
-- Super Admin knows.
--
-- STEP 3 — Verify
-- ------------------------------------------------------------
-- Log in at /super-admin/login.html with the email + the password
-- from Step 1. You should be forced into the password-change screen
-- immediately. Set a new password there. From then on, normal login
-- applies.
-- ============================================================
