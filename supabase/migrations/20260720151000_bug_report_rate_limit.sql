/*
  # Durable rate-limit store for /api/report

  api/report.ts sends email through Resend on every call. It verified the
  caller was signed in but did not limit how often they could call it, so any
  tester could drain the Resend quota and flood the maintainer's inbox.

  A counter in the serverless function's memory would not work — each
  invocation may land on a fresh instance — so the counter lives here.

  One row per accepted report. The function counts the caller's rows in the
  trailing hour before sending and refuses past the limit.
*/

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user_created
  ON public.bug_reports (user_id, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- The caller may only ever see or add their own rows, so the count they are
-- limited against cannot be read or inflated by anyone else.
DROP POLICY IF EXISTS "bug_reports self select" ON public.bug_reports;
CREATE POLICY "bug_reports self select" ON public.bug_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bug_reports self insert" ON public.bug_reports;
CREATE POLICY "bug_reports self insert" ON public.bug_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy: a user must not be able to erase their own
-- history to reset the limit.
