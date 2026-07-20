/*
  # Routines and weekly schedule move into the database

  These two lived only in localStorage, so a user's routines never followed
  them to a second device and disappeared if they cleared their browser —
  while their logged workouts, which were in Supabase, survived. That split
  read as a bug to anyone who hit it.

  The tables were defined long ago in the root-level
  supabase_schedule_migration.sql but that file was never run against the
  production project, so production has no such tables. This migration is the
  canonical version: idempotent, safe to run against either project.

  useSchedule.ts lifts any pre-existing localStorage data into these tables the
  first time a signed-in user loads the app, remapping the old
  "routine-1721…" ids onto real uuids.
*/

CREATE TABLE IF NOT EXISTS public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  exercise_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  routine_id uuid REFERENCES public.routines(id) ON DELETE SET NULL,
  UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_routines_user_id ON public.routines(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_user_id ON public.schedule(user_id);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;

-- Split per-verb rather than FOR ALL so every path states its own WITH CHECK
-- and a row can never be written under someone else's user_id.
DROP POLICY IF EXISTS "Users own their routines" ON public.routines;
DROP POLICY IF EXISTS "routines self select" ON public.routines;
DROP POLICY IF EXISTS "routines self insert" ON public.routines;
DROP POLICY IF EXISTS "routines self update" ON public.routines;
DROP POLICY IF EXISTS "routines self delete" ON public.routines;

CREATE POLICY "routines self select" ON public.routines
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "routines self insert" ON public.routines
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "routines self update" ON public.routines
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "routines self delete" ON public.routines
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own their schedule" ON public.schedule;
DROP POLICY IF EXISTS "schedule self select" ON public.schedule;
DROP POLICY IF EXISTS "schedule self insert" ON public.schedule;
DROP POLICY IF EXISTS "schedule self update" ON public.schedule;
DROP POLICY IF EXISTS "schedule self delete" ON public.schedule;

CREATE POLICY "schedule self select" ON public.schedule
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedule self insert" ON public.schedule
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedule self update" ON public.schedule
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedule self delete" ON public.schedule
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
