-- ============================================================
-- Overload — Competitions: start the clock on acceptance
--
-- Previously the start time was fixed at creation (the next midnight), which
-- meant a competition could auto-cancel if the invited friend accepted after
-- that moment. Now a competition is created with NO start time; it sits in
-- "waiting for players" until it first becomes viable — the creator plus at
-- least one accepted friend (2 accepted) — at which point start_at is anchored
-- to the next midnight in the competition's locked timezone and end_at =
-- start_at + duration. One accepted friend is enough to run.
--
-- Re-runnable: additive column, nullable relaxations, and CREATE OR REPLACE /
-- DROP … IF EXISTS throughout.
-- ============================================================

-- start_at / end_at are unknown until the roster is viable.
ALTER TABLE public.competitions ALTER COLUMN start_at DROP NOT NULL;
ALTER TABLE public.competitions ALTER COLUMN end_at   DROP NOT NULL;

-- The chosen length, captured at creation and used to derive end_at on accept.
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS duration_days int;

-- ── create_competition — now takes a duration, not a start/end window ──
-- Replaces the old (…, start_at, end_at, …) signature.
DROP FUNCTION IF EXISTS public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]);

CREATE OR REPLACE FUNCTION public.create_competition(
  p_name text,
  p_track text,
  p_participant_ids uuid[],
  p_duration_days int,
  p_timezone text DEFAULT 'UTC',
  p_scheduled_days smallint[] DEFAULT NULL   -- creator's schedule snapshot (consistency track)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_comp  uuid;
  v_tz    text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_id    uuid;
  v_count int := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF p_track NOT IN ('consistency','volume') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_track');
  END IF;
  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 365 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_duration');
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  -- No start/end yet — anchored when the roster becomes viable (see accept).
  INSERT INTO public.competitions (name, track, created_by, timezone, start_at, end_at, duration_days, status)
  VALUES (trim(p_name), p_track, v_me, v_tz, NULL, NULL, p_duration_days, 'pending')
  RETURNING id INTO v_comp;

  INSERT INTO public.competition_participants (competition_id, user_id, status, scheduled_days)
  VALUES (v_comp, v_me, 'accepted', p_scheduled_days);

  FOR v_id IN
    SELECT DISTINCT x FROM unnest(coalesce(p_participant_ids, '{}'::uuid[])) AS x
    WHERE x <> v_me
      AND EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = v_me AND f.addressee_id = x)
            OR (f.addressee_id = v_me AND f.requester_id = x))
      )
  LOOP
    INSERT INTO public.competition_participants (competition_id, user_id, status)
    VALUES (v_comp, v_id, 'invited')
    ON CONFLICT (competition_id, user_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    DELETE FROM public.competitions WHERE id = v_comp;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_participants');
  END IF;

  RETURN jsonb_build_object('ok', true, 'competition_id', v_comp, 'invited', v_count);
END;
$$;

-- ── accept — anchor the start once the roster is viable ───────
CREATE OR REPLACE FUNCTION public.accept_competition_invite(
  p_competition_id uuid,
  p_scheduled_days smallint[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me       uuid := auth.uid();
  c          public.competitions%ROWTYPE;
  v_accepted int;
  v_start    timestamptz;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  -- Can accept while pending and before the roster locks (start not reached).
  IF c.status <> 'pending' OR (c.start_at IS NOT NULL AND now() >= c.start_at) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'roster_locked');
  END IF;

  UPDATE public.competition_participants
    SET status = 'accepted',
        scheduled_days = coalesce(p_scheduled_days, scheduled_days)
  WHERE competition_id = p_competition_id AND user_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_invited');
  END IF;

  -- First time it becomes viable (creator + 1 accepted friend), start the
  -- clock: next midnight in the locked timezone. Later accepts don't move it.
  IF c.start_at IS NULL THEN
    SELECT count(*) FILTER (WHERE status = 'accepted') INTO v_accepted
    FROM public.competition_participants WHERE competition_id = p_competition_id;

    IF v_accepted >= 2 THEN
      v_start := (date_trunc('day', (now() AT TIME ZONE c.timezone)) + interval '1 day')
                 AT TIME ZONE c.timezone;
      UPDATE public.competitions
        SET start_at = v_start,
            end_at   = v_start + (c.duration_days || ' days')::interval
      WHERE id = p_competition_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── activate — guard against a not-yet-anchored (NULL start) comp ──
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
  IF c.start_at IS NULL THEN RETURN; END IF;       -- roster not viable yet
  IF now() < c.start_at THEN RETURN; END IF;       -- not time yet

  SELECT count(*) FILTER (WHERE status = 'accepted')
    INTO v_accepted
  FROM public.competition_participants WHERE competition_id = c.id;

  IF v_accepted < 2 THEN
    UPDATE public.competitions SET status = 'cancelled' WHERE id = c.id;
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

-- Re-grant the new create_competition signature (the old one was dropped).
REVOKE EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], int, text, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], int, text, smallint[]) TO authenticated;
