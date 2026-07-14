-- ============================================================
-- Progressive Overload Tracker — full schema
-- Paste this into Supabase SQL Editor and click Run
-- ============================================================

-- Tables
CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  muscle_group text NOT NULL DEFAULT 'upper',
  target_reps integer NOT NULL DEFAULT 12,
  sets integer NOT NULL DEFAULT 3,
  weight numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  reps_done integer NOT NULL,
  weight numeric NOT NULL,
  sets integer NOT NULL DEFAULT 1,
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- Policies — exercises
CREATE POLICY "select own exercises" ON exercises FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own exercises" ON exercises FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own exercises" ON exercises FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own exercises" ON exercises FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Policies — workout_logs
CREATE POLICY "select own logs" ON workout_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own logs" ON workout_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own logs" ON workout_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own logs" ON workout_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON workout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise_id ON workout_logs(exercise_id);

-- claim_device_data function (migrates anonymous data to a new account)
CREATE OR REPLACE FUNCTION public.claim_device_data(p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid; v_ex integer; v_lg integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN jsonb_build_object('exercises', 0, 'logs', 0);
  END IF;
  UPDATE public.exercises SET user_id = v_user_id WHERE device_id = p_device_id AND user_id IS NULL;
  GET DIAGNOSTICS v_ex = ROW_COUNT;
  UPDATE public.workout_logs SET user_id = v_user_id WHERE device_id = p_device_id AND user_id IS NULL;
  GET DIAGNOSTICS v_lg = ROW_COUNT;
  RETURN jsonb_build_object('exercises', v_ex, 'logs', v_lg);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_device_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_device_data(text) TO authenticated;
