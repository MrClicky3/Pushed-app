-- ============================================================
-- Progressive Overload Tracker — set types + body weight
-- Paste this into Supabase SQL Editor and click Run
-- ============================================================

-- Set type on workout logs (warmup / working / drop)
ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS set_type text NOT NULL DEFAULT 'working';

-- Body weight log
CREATE TABLE IF NOT EXISTS body_weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE body_weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select own body weight" ON body_weight_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own body weight" ON body_weight_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own body weight" ON body_weight_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_body_weight_logs_user_id ON body_weight_logs(user_id);
