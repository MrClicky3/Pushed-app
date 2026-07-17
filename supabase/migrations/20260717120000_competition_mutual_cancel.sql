-- ============================================================
-- Overload — mutual-agreement competition cancellation
--
-- Lets accepted participants end a pending/active competition early once
-- EVERY accepted participant has voted to cancel (both players in a duel,
-- or all players in a group). Votes are per-user and revocable; the
-- competition flips to 'cancelled' the moment the last accepted participant
-- votes. Distinguished from the existing auto-cancel (too few accepted
-- players at start_at) via `cancelled_reason`, so the results sheet can show
-- the right message for each.
--
-- Paste this into the Supabase SQL Editor and click Run (committing a
-- migration does not apply it — a human must run it against the live DB).
-- ============================================================

-- ── cancelled_reason ─────────────────────────────────────────
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS cancelled_reason text
    CHECK (cancelled_reason IN ('insufficient_players', 'mutual_agreement'));

-- Backfill: every cancellation before this migration was the auto-cancel path.
UPDATE public.competitions
  SET cancelled_reason = 'insufficient_players'
  WHERE status = 'cancelled' AND cancelled_reason IS NULL;

-- activate_competition's auto-cancel (<2 accepted at start_at) now tags its reason.
CREATE OR REPLACE FUNCTION public.activate_competition(p_competition_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c           public.competitions%ROWTYPE;
  p           public.competition_participants%ROWTYPE;
  v_accepted  int;
  v_total     int;
  v_first     timestamptz;
  v_base      numeric;
  v_base_days int;
BEGIN
  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.status <> 'pending' THEN RETURN; END IF;   -- already locked
  IF now() < c.start_at THEN RETURN; END IF;       -- not time yet

  SELECT count(*) FILTER (WHERE status = 'accepted')
    INTO v_accepted
  FROM public.competition_participants WHERE competition_id = c.id;

  IF v_accepted < 2 THEN
    UPDATE public.competitions
      SET status = 'cancelled', cancelled_reason = 'insufficient_players'
      WHERE id = c.id;
    RETURN;
  END IF;

  v_total := public._comp_day_span(c.start_at, c.end_at, c.timezone);

  IF c.track = 'volume' THEN
    FOR p IN SELECT * FROM public.competition_participants
             WHERE competition_id = c.id AND status = 'accepted' LOOP
      SELECT min(wl.created_at) INTO v_first
      FROM public.workout_logs wl
      WHERE wl.user_id = p.user_id
        AND wl.is_flagged = false
        AND coalesce(wl.set_type, 'working') <> 'warmup'
        AND wl.created_at < c.start_at;

      IF v_first IS NULL OR v_first > c.start_at - interval '7 days' THEN
        v_base := NULL;
        v_base_days := NULL;
      ELSE
        SELECT coalesce(sum(wl.weight * wl.reps_done), 0),
               count(DISTINCT (wl.created_at AT TIME ZONE c.timezone)::date)
          INTO v_base, v_base_days
        FROM public.workout_logs wl
        WHERE wl.user_id = p.user_id
          AND wl.is_flagged = false
          AND coalesce(wl.set_type, 'working') <> 'warmup'
          AND wl.created_at >= c.start_at - (v_total || ' days')::interval
          AND wl.created_at < c.start_at;
        IF coalesce(v_base_days, 0) = 0 THEN
          v_base := NULL;
          v_base_days := NULL;
        END IF;
      END IF;

      UPDATE public.competition_participants
        SET baseline_volume = v_base, baseline_days = v_base_days
      WHERE id = p.id;
    END LOOP;
  END IF;

  UPDATE public.competitions SET status = 'active' WHERE id = c.id;
END;
$$;

-- ── cancel votes ─────────────────────────────────────────────
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

-- Cast a cancel vote (idempotent). Once every accepted participant has
-- voted, the competition is cancelled immediately — no cron/lazy-advance
-- needed, this is a direct user action.
CREATE OR REPLACE FUNCTION public.vote_cancel_competition(p_competition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me         uuid := auth.uid();
  c            public.competitions%ROWTYPE;
  v_is_member  boolean;
  v_accepted   int;
  v_votes      int;
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

-- Retract a cancel vote. Harmless no-op once the competition already flipped
-- to cancelled (nothing left to revert to).
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

REVOKE EXECUTE ON FUNCTION public.vote_cancel_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.vote_cancel_competition(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.unvote_cancel_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unvote_cancel_competition(uuid) TO authenticated;

-- ── get_competition_standings: add per-row voted_cancel ────────
-- Return type is changing (new trailing column), so the function must be
-- dropped and recreated — CREATE OR REPLACE cannot change a RETURNS TABLE
-- signature.
DROP FUNCTION IF EXISTS public.get_competition_standings(uuid);

CREATE OR REPLACE FUNCTION public.get_competition_standings(p_competition_id uuid)
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

  -- Lazy state transitions.
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
           p.final_score, p.final_delta, NULL::int, p.final_rank, (p.user_id = v_me),
           false
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id AND p.status = 'accepted'
    ORDER BY p.final_rank NULLS LAST, pr.username;
    RETURN;
  END IF;

  IF c.status = 'cancelled' THEN
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           NULL::numeric, NULL::numeric, 0, NULL::int, (p.user_id = v_me),
           false
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

REVOKE EXECUTE ON FUNCTION public.get_competition_standings(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_competition_standings(uuid) TO authenticated;

-- ── get_my_competitions: surface cancelled_reason ───────────────
DROP FUNCTION IF EXISTS public.get_my_competitions();

CREATE OR REPLACE FUNCTION public.get_my_competitions()
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
  SELECT c.id, c.name, c.track, c.timezone, c.start_at, c.end_at, c.status, c.cancelled_reason, c.created_by,
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

REVOKE EXECUTE ON FUNCTION public.get_my_competitions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_competitions() TO authenticated;
