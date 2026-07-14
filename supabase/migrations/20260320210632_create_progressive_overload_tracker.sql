/*
  # Progressive Overload Tracker Schema

  1. Helper Functions
    - `get_device_id()` - extracts device ID from request headers for RLS

  2. New Tables
    - `exercises`
      - `id` (uuid, primary key)
      - `device_id` (text, not null) - identifies the anonymous device/user
      - `name` (text, not null) - exercise name (e.g., "Bench press")
      - `muscle_group` (text, not null, default 'upper') - category (upper, lower, push, pull, legs, core)
      - `target_reps` (integer, not null, default 12) - target reps per set
      - `sets` (integer, not null, default 3) - target number of sets
      - `weight` (numeric, not null, default 0) - current working weight in kg
      - `created_at` (timestamptz, default now())
    - `workout_logs`
      - `id` (uuid, primary key)
      - `device_id` (text, not null) - identifies the anonymous device/user
      - `exercise_id` (uuid, foreign key -> exercises.id, cascade delete)
      - `reps_done` (integer, not null) - actual reps completed per set
      - `weight` (numeric, not null) - weight used in this session
      - `sets` (integer, not null, default 1) - number of sets completed
      - `comment` (text, default '') - optional notes
      - `created_at` (timestamptz, default now())

  3. Security
    - RLS enabled on both tables
    - All policies restrict access to rows matching the device_id from the x-device-id request header
    - Separate SELECT, INSERT, UPDATE, DELETE policies for each table

  4. Indexes
    - device_id on both tables for filtering
    - exercise_id on workout_logs for joins
    - created_at DESC on workout_logs for chronological queries
*/

CREATE OR REPLACE FUNCTION get_device_id() RETURNS text AS $$
BEGIN
  RETURN coalesce(
    current_setting('request.headers', true)::json->>'x-device-id',
    ''
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  name text NOT NULL,
  muscle_group text NOT NULL DEFAULT 'upper',
  target_reps integer NOT NULL DEFAULT 12,
  sets integer NOT NULL DEFAULT 3,
  weight numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own exercises"
  ON exercises FOR SELECT TO anon
  USING (device_id = get_device_id());

CREATE POLICY "Insert own exercises"
  ON exercises FOR INSERT TO anon
  WITH CHECK (device_id = get_device_id());

CREATE POLICY "Update own exercises"
  ON exercises FOR UPDATE TO anon
  USING (device_id = get_device_id())
  WITH CHECK (device_id = get_device_id());

CREATE POLICY "Delete own exercises"
  ON exercises FOR DELETE TO anon
  USING (device_id = get_device_id());

CREATE TABLE IF NOT EXISTS workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  reps_done integer NOT NULL,
  weight numeric NOT NULL,
  sets integer NOT NULL DEFAULT 1,
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own logs"
  ON workout_logs FOR SELECT TO anon
  USING (device_id = get_device_id());

CREATE POLICY "Insert own logs"
  ON workout_logs FOR INSERT TO anon
  WITH CHECK (device_id = get_device_id());

CREATE POLICY "Update own logs"
  ON workout_logs FOR UPDATE TO anon
  USING (device_id = get_device_id())
  WITH CHECK (device_id = get_device_id());

CREATE POLICY "Delete own logs"
  ON workout_logs FOR DELETE TO anon
  USING (device_id = get_device_id());

CREATE INDEX IF NOT EXISTS idx_exercises_device_id ON exercises(device_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_device_id ON workout_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise_id ON workout_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_created_at ON workout_logs(created_at DESC);
