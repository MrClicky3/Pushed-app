-- ============================================================
-- Overload — Competitions scheduled-transition PLACEHOLDER
--
-- The competition RPCs already advance state lazily (activate_competition /
-- finalize_competition run whenever someone reads a competition that has
-- crossed its start_at / end_at), so scoring and badges are always correct on
-- view without any cron. This migration adds the *mechanism* for doing it on
-- a timer — a single sweep function a scheduler can call — but leaves the
-- actual schedule commented out. Enable it when you want activation /
-- finalization (and finisher/medal badges) to happen promptly instead of on
-- next view.
-- ============================================================

-- Sweep every competition that has crossed a boundary and advance it. Safe to
-- call repeatedly: activate/finalize are both idempotent and guarded by
-- start_at / end_at, so this only ever moves a competition forward.
CREATE OR REPLACE FUNCTION public.run_due_competition_transitions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cid uuid;
  n   int := 0;
BEGIN
  FOR cid IN
    SELECT id FROM public.competitions
    WHERE (status = 'pending' AND now() >= start_at)
       OR (status = 'active'  AND now() >= end_at)
  LOOP
    PERFORM public.activate_competition(cid);  -- lock roster / auto-cancel
    PERFORM public.finalize_competition(cid);  -- rank + award badges + freeze
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Intended caller is the scheduler (service_role), never the browser.
REVOKE EXECUTE ON FUNCTION public.run_due_competition_transitions() FROM PUBLIC, anon, authenticated;

-- ── Enable scheduling (PLACEHOLDER — run once to turn it on) ───
-- Supabase ships pg_cron. To advance competitions every 5 minutes, uncomment
-- and run the two statements below in the SQL editor:
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--     'competition-transitions',
--     '*/5 * * * *',
--     $$ SELECT public.run_due_competition_transitions(); $$
--   );
--
-- To change the cadence, re-run cron.schedule with the same job name. To stop
-- it: SELECT cron.unschedule('competition-transitions');
--
-- (Alternatively, call run_due_competition_transitions() from a scheduled
-- Supabase Edge Function using the service_role key.)
