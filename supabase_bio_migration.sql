-- ============================================================
-- Overload — profile bio
-- Paste this into the Supabase SQL Editor and click Run.
--
-- Adds a short bio field to profiles. No new RLS policies needed — the
-- existing "profiles public read" / "profiles self update" policies
-- (supabase_social_migration.sql) already cover this column.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text CHECK (char_length(bio) <= 160);
