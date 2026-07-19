-- ============================================================
-- Overload — Competitions redesign (2026-07-19)
--
-- Run this whole file in the Supabase SQL Editor. The editor wraps a script
-- in ONE transaction, so a single error rolls the entire thing back and
-- nothing changes — if that happens, copy the red error text out; the last
-- statement here prints a verification table when it succeeds.
--
-- WHAT THIS DOES
--   1. Retires the consistency track. Existing consistency competitions are
--      converted to the streak track (there is no consistency scoring left
--      anywhere, in the DB or the client).
--   2. volume  → raw working-set volume (kg) accumulated inside the window.
--                No more %Δ vs a frozen baseline; `delta` is always NULL now.
--   3. streak  → the participant's current workout streak, read from
--                user_stats.current_streak (client-pushed via set_my_stats —
--                the schedule needed to compute streaks lives only in
--                localStorage, so the server cannot derive it).
--   4. Caps competitions at 6 players (creator + 5 invitees).
--   5. Includes the mutual-cancel feature (competition_cancel_votes,
--      vote/unvote RPCs, cancelled_reason). This was written as migration
--      20260717120000 but was never actually run against this database, so
--      it is folded in here — that is why "cancel competition" did nothing.
--
-- Safe to re-run.
-- ============================================================

-- ── 1. track constraint + data migration ─────────────────────
-- Drop whatever the track CHECK is actually named (it is auto-named, and a
-- previous partial run may have left a second one behind).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.competitions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%track%'
  LOOP
    EXECUTE format('ALTER TABLE public.competitions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Convert legacy consistency competitions to streak before re-adding the
-- constraint, so no row can violate it.
UPDATE public.competitions SET track = 'streak' WHERE track = 'consistency';

ALTER TABLE public.competitions
  ADD CONSTRAINT competitions_track_check CHECK (track IN ('volume', 'streak'));

-- ── 2. cancelled_reason ──────────────────────────────────────
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.competitions'::regclass
      AND conname = 'competitions_cancelled_reason_check'
  ) THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_cancelled_reason_check
      CHECK (cancelled_reason IN ('insufficient_players', 'mutual_agreement'));
  END IF;
END $$;

UPDATE public.competitions
  SET cancelled_reason = 'insufficient_players'
  WHERE status = 'cancelled' AND cancelled_reason IS NULL;

-- ── 3. cancel votes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competition_cancel_votes (
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voted_at timestamptz DEFAULT now(),
  PRIMARY KEY (competition_id, user_id)
);

ALTER TABLE public.competition_cancel_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cancel votes member read" ON public.competition_cancel_votes;
CREATE POLICY "cancel votes member read" ON public.competition_cancel_votes
  FOR SELECT TO authenticated
  USING (public.is_competition_member(competition_id, auth.uid()));

-- ── 4. standings ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_competition_standings(
  p_comp_id uuid,
  p_as_of timestamptz
)
RETURNS TABLE (user_id uuid, score numeric, delta numeric, scored_days int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c       public.competitions%ROWTYPE;
  p       public.competition_participants%ROWTYPE;
  v_as_of timestamptz;
  v_val   numeric;
  v_days  int;
BEGIN
  SELECT * INTO c FROM public.competitions WHERE id = p_comp_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_as_of := least(p_as_of, c.end_at);

  FOR p IN SELECT * FROM public.competition_participants
           WHERE competition_id = p_comp_id AND status = 'accepted' LOOP

    IF v_as_of <= c.start_at THEN
      -- Not started yet.
      user_id := p.user_id; score := 0; delta := NULL; scored_days := 0;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Distinct in-competition days with at least one counting set — drives
    -- the finisher badge on both tracks.
    SELECT count(DISTINCT (wl.created_at AT TIME ZONE c.timezone)::date)
      INTO v_days
    FROM public.workout_logs wl
    WHERE wl.user_id = p.user_id
      AND wl.is_flagged = false
      AND coalesce(wl.set_type, 'working') <> 'warmup'
      AND wl.created_at >= c.start_at
      AND wl.created_at < v_as_of;

    IF c.track = 'streak' THEN
      -- Current streak as pushed by the client. Day-granular and
      -- client-authored, so this reads as-of the call, not exactly end_at.
      SELECT coalesce(us.current_streak, 0)
        INTO v_val
      FROM public.user_stats us
      WHERE us.user_id = p.user_id;
      IF v_val IS NULL THEN v_val := 0; END IF;
    ELSE
      -- volume: raw working volume inside the window (kg).
      SELECT coalesce(sum(wl.weight * wl.reps_done), 0)
        INTO v_val
      FROM public.workout_logs wl
      WHERE wl.user_id = p.user_id
        AND wl.is_flagged = false
        AND coalesce(wl.set_type, 'working') <> 'warmup'
        AND wl.created_at >= c.start_at
        AND wl.created_at < v_as_of;
    END IF;

    user_id     := p.user_id;
    score       := coalesce(v_val, 0);
    delta       := NULL;
    scored_days := coalesce(v_days, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── 5. activation ────────────────────────────────────────────
-- Baseline freezing is gone with the %Δ scoring; activation is now purely the
-- roster lock. Keeps the cancelled_reason tagging from the mutual-cancel work.
CREATE OR REPLACE FUNCTION public.activate_competition(p_competition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c          public.competitions%ROWTYPE;
  v_accepted int;
BEGIN
  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.status <> 'pending' THEN RETURN; END IF;
  IF now() < c.start_at THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE status = 'accepted')
    INTO v_accepted
  FROM public.competition_participants WHERE competition_id = c.id;

  IF v_accepted < 2 THEN
    UPDATE public.competitions
      SET status = 'cancelled', cancelled_reason = 'insufficient_players'
      WHERE id = c.id;
    RETURN;
  END IF;

  UPDATE public.competitions SET status = 'active' WHERE id = c.id;
END;
$$;

-- ── 6. cancel RPCs ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vote_cancel_competition(p_competition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me        uuid := auth.uid();
  c           public.competitions%ROWTYPE;
  v_is_member boolean;
  v_accepted  int;
  v_votes     int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF c.status NOT IN ('pending', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants
    WHERE competition_id = p_competition_id AND user_id = v_me AND status = 'accepted'
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_participant');
  END IF;

  INSERT INTO public.competition_cancel_votes (competition_id, user_id)
  VALUES (p_competition_id, v_me)
  ON CONFLICT (competition_id, user_id) DO NOTHING;

  SELECT count(*) INTO v_accepted
  FROM public.competition_participants
  WHERE competition_id = p_competition_id AND status = 'accepted';

  SELECT count(*) INTO v_votes
  FROM public.competition_cancel_votes
  WHERE competition_id = p_competition_id;

  IF v_accepted > 0 AND v_votes >= v_accepted THEN
    UPDATE public.competitions
      SET status = 'cancelled', cancelled_reason = 'mutual_agreement'
      WHERE id = p_competition_id;
    RETURN jsonb_build_object('ok', true, 'cancelled', true, 'votes', v_votes, 'needed', v_accepted);
  END IF;

  RETURN jsonb_build_object('ok', true, 'cancelled', false, 'votes', v_votes, 'needed', v_accepted);
END;
$$;

CREATE OR REPLACE FUNCTION public.unvote_cancel_competition(p_competition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.competition_cancel_votes
  WHERE competition_id = p_competition_id AND user_id = v_me;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 7. standings RPC (adds voted_cancel) ─────────────────────
DROP FUNCTION IF EXISTS public.get_competition_standings(uuid);

CREATE FUNCTION public.get_competition_standings(p_competition_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  status text,
  score numeric,
  delta numeric,
  scored_days int,
  rank int,
  is_self boolean,
  voted_cancel boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  c    public.competitions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_competition_member(c.id, v_me) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF c.status = 'pending' AND now() >= c.start_at THEN
    PERFORM public.activate_competition(c.id);
    SELECT * INTO c FROM public.competitions WHERE id = c.id;
  END IF;
  IF c.status = 'active' AND now() >= c.end_at THEN
    PERFORM public.finalize_competition(c.id);
    SELECT * INTO c FROM public.competitions WHERE id = c.id;
  END IF;

  IF c.status = 'completed' THEN
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           p.final_score, p.final_delta, 0, p.final_rank, (p.user_id = v_me), false
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id AND p.status = 'accepted'
    ORDER BY p.final_rank NULLS LAST, pr.username;
    RETURN;
  END IF;

  IF c.status = 'cancelled' THEN
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           NULL::numeric, NULL::numeric, 0, NULL::int, (p.user_id = v_me), false
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id
    ORDER BY pr.username;
    RETURN;
  END IF;

  IF c.status = 'pending' THEN
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           NULL::numeric, NULL::numeric, 0, NULL::int, (p.user_id = v_me),
           EXISTS (
             SELECT 1 FROM public.competition_cancel_votes cv
             WHERE cv.competition_id = c.id AND cv.user_id = p.user_id
           )
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id AND p.status <> 'declined'
    ORDER BY pr.username;
    RETURN;
  END IF;

  -- Active: compute live and rank (ties share a rank: 1,2,2,4).
  RETURN QUERY
  WITH s AS (
    SELECT * FROM public.compute_competition_standings(c.id, now())
  ),
  ranked AS (
    SELECT s.*, rank() OVER (ORDER BY s.score DESC) AS rnk
    FROM s
  )
  SELECT r.user_id, pr.username, pr.display_name, pr.avatar_url, 'accepted'::text,
         r.score, r.delta, r.scored_days, r.rnk::int, (r.user_id = v_me),
         EXISTS (
           SELECT 1 FROM public.competition_cancel_votes cv
           WHERE cv.competition_id = c.id AND cv.user_id = r.user_id
         )
  FROM ranked r
  JOIN public.profiles pr ON pr.id = r.user_id
  ORDER BY r.rnk, pr.username;
END;
$$;

-- ── 8. list RPC (adds cancelled_reason) ──────────────────────
DROP FUNCTION IF EXISTS public.get_my_competitions();

CREATE FUNCTION public.get_my_competitions()
RETURNS TABLE (
  id uuid,
  name text,
  track text,
  timezone text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
  cancelled_reason text,
  created_by uuid,
  is_creator boolean,
  my_status text,
  participant_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  cid  uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR cid IN
    SELECT c.id FROM public.competitions c
    JOIN public.competition_participants p ON p.competition_id = c.id AND p.user_id = v_me
    WHERE (c.status = 'pending' AND now() >= c.start_at)
       OR (c.status = 'active'  AND now() >= c.end_at)
  LOOP
    PERFORM public.activate_competition(cid);
    PERFORM public.finalize_competition(cid);
  END LOOP;

  RETURN QUERY
  SELECT c.id, c.name, c.track, c.timezone, c.start_at, c.end_at, c.status,
         c.cancelled_reason, c.created_by,
         (c.created_by = v_me),
         mp.status,
         (SELECT count(*)::int FROM public.competition_participants p2
          WHERE p2.competition_id = c.id AND p2.status = 'accepted')
  FROM public.competitions c
  JOIN public.competition_participants mp
    ON mp.competition_id = c.id AND mp.user_id = v_me
  ORDER BY
    CASE c.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1
                  WHEN 'completed' THEN 2 ELSE 3 END,
    c.end_at DESC;
END;
$$;

-- ── 9. creation (6-player cap, new tracks) ───────────────────
CREATE OR REPLACE FUNCTION public.create_competition(
  p_name text,
  p_track text,
  p_participant_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text DEFAULT 'UTC',
  p_scheduled_days smallint[] DEFAULT NULL   -- kept for signature stability; unused
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_comp uuid;
  v_tz   text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_ids  uuid[];
  v_id   uuid;
  v_n    int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF p_track NOT IN ('volume', 'streak') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_track');
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_window');
  END IF;
  IF p_end_at <= now() OR p_start_at < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_window');
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  -- Accepted friends only; self and duplicates dropped. The unnest gets an
  -- explicit column alias (t(uid)) so `uid` can never be read as a whole-row
  -- reference to the table alias.
  SELECT array_agg(DISTINCT t.uid) INTO v_ids
  FROM unnest(coalesce(p_participant_ids, '{}'::uuid[])) AS t(uid)
  WHERE t.uid <> v_me
    AND EXISTS (
      SELECT 1 FROM public.friendships fr
      WHERE fr.status = 'accepted'
        AND ((fr.requester_id = v_me AND fr.addressee_id = t.uid)
          OR (fr.addressee_id = v_me AND fr.requester_id = t.uid))
    );

  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_participants');
  END IF;
  IF v_n > 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_players');
  END IF;

  INSERT INTO public.competitions (name, track, created_by, timezone, start_at, end_at, status)
  VALUES (trim(p_name), p_track, v_me, v_tz, p_start_at, p_end_at, 'pending')
  RETURNING id INTO v_comp;

  INSERT INTO public.competition_participants (competition_id, user_id, status, scheduled_days)
  VALUES (v_comp, v_me, 'accepted', p_scheduled_days);

  FOREACH v_id IN ARRAY v_ids LOOP
    INSERT INTO public.competition_participants (competition_id, user_id, status)
    VALUES (v_comp, v_id, 'invited')
    ON CONFLICT (competition_id, user_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'competition_id', v_comp, 'invited', v_n);
END;
$$;

-- ── 10. grants ───────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.compute_competition_standings(uuid, timestamptz) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.get_competition_standings(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_competition_standings(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_competitions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_competitions() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.activate_competition(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.vote_cancel_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.vote_cancel_competition(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unvote_cancel_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unvote_cancel_competition(uuid) TO authenticated;

-- Let PostgREST notice the changed function signatures immediately.
NOTIFY pgrst, 'reload schema';

-- ── 11. verification ─────────────────────────────────────────
-- Every row must say OK. If you see this table at all, the script committed.
SELECT 'tracks in use'  AS what,
       coalesce(string_agg(DISTINCT track, ', '), '(none)') AS detail,
       CASE WHEN count(*) FILTER (WHERE track = 'consistency') = 0
            THEN 'OK' ELSE 'FAIL — consistency rows remain' END AS result
FROM public.competitions
UNION ALL
SELECT 'cancel vote RPC',
       'vote_cancel_competition',
       CASE WHEN to_regprocedure('public.vote_cancel_competition(uuid)') IS NOT NULL
            THEN 'OK' ELSE 'FAIL — missing' END
UNION ALL
SELECT 'cancel votes table',
       'competition_cancel_votes',
       CASE WHEN to_regclass('public.competition_cancel_votes') IS NOT NULL
            THEN 'OK' ELSE 'FAIL — missing' END
UNION ALL
SELECT 'standings returns voted_cancel',
       'get_competition_standings',
       CASE WHEN (SELECT count(*) FROM information_schema.routines
                  WHERE routine_schema = 'public'
                    AND routine_name = 'get_competition_standings') = 1
            THEN 'OK' ELSE 'FAIL' END
UNION ALL
SELECT 'cancelled_reason column',
       'competitions.cancelled_reason',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'competitions'
                           AND column_name = 'cancelled_reason')
            THEN 'OK' ELSE 'FAIL' END;
