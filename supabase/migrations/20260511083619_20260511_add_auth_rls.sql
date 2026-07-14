/*
  # Add Auth-based RLS for exercises and workout_logs

  Migrates from anonymous device_id-based access to Supabase Auth user_id-based access.

  1. Changes to `exercises`
    - Add `user_id` column (uuid, references auth.users)
    - Drop old device_id policies (anon role)
    - Add new policies for authenticated users checking auth.uid() = user_id

  2. Changes to `workout_logs`
    - Add `user_id` column (uuid, references auth.users)
    - Drop old device_id policies (anon role)
    - Add new policies for authenticated users checking auth.uid() = user_id

  3. Indexes
    - Add indexes on user_id for both tables

  Note: device_id column is kept to avoid breaking existing rows, but new rows will use user_id.
*/

-- Add user_id to exercises
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE exercises ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to workout_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workout_logs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE workout_logs ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop old device_id-based policies on exercises
DROP POLICY IF EXISTS "Select own exercises" ON exercises;
DROP POLICY IF EXISTS "Insert own exercises" ON exercises;
DROP POLICY IF EXISTS "Update own exercises" ON exercises;
DROP POLICY IF EXISTS "Delete own exercises" ON exercises;

-- Drop old device_id-based policies on workout_logs
DROP POLICY IF EXISTS "Select own logs" ON workout_logs;
DROP POLICY IF EXISTS "Insert own logs" ON workout_logs;
DROP POLICY IF EXISTS "Update own logs" ON workout_logs;
DROP POLICY IF EXISTS "Delete own logs" ON workout_logs;

-- New auth-based policies for exercises
CREATE POLICY "Authenticated users can select own exercises"
  ON exercises FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert own exercises"
  ON exercises FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own exercises"
  ON exercises FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own exercises"
  ON exercises FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- New auth-based policies for workout_logs
CREATE POLICY "Authenticated users can select own logs"
  ON workout_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert own logs"
  ON workout_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own logs"
  ON workout_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own logs"
  ON workout_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for user_id lookups
CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON workout_logs(user_id);
