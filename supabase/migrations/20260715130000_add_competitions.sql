-- ============================================================
-- Overload — time-boxed Competitions
--
-- Reuses the existing social layer (profiles, friendships, user_stats) and
-- the set-logging table (workout_logs). Adds head-to-head / group challenges
-- on two tracks: consistency (% of your own scheduled routine days completed)
-- and volume (% change vs a frozen baseline).
--
-- Design notes that the rules below depend on:
--
--   * SERVER-AUTHORITATIVE. Standings are always computed live from
--     workout_logs by SECURITY DEFINER RPCs. The client never submits or
--     caches a score. Once a competition is completed the final ranks are
--     frozen onto competition_participants, so later log edits can never
--     retroactively change a finished competition.
--
--   * TIMEZONE. Every day-boundary calculation uses the competition's own
--     locked IANA timezone (competitions.timezone), captured from the creator
--     at creation — never the viewer's device timezone.
--
--   * SCHEDULE SNAPSHOT. Routines & the weekly schedule live only in the
--     client (localStorage) — see AGENTS.md; they are intentionally NOT in
--     Supabase, so the server cannot read a participant's schedule. For the
--     consistency track we therefore freeze the participant's scheduled
--     weekdays into competition_participants.scheduled_days when they accept.
--     That snapshot is configuration (frozen, provided once), not a score:
--     the score itself is still computed server-side from workout_logs.
--
--   * WEEKDAY CONVENTION. scheduled_days uses Mon=0 … Sun=6, matching
--     src/lib/streak.ts ((getDay()+6)%7). In SQL that is isodow-1.
--
-- Paste this into the Supabase SQL Editor and click Run (committing a
-- migration does not apply it — a human must run it against the live DB).
-- ============================================================

-- ── set-logging: outlier flags ────────────────────────────────
-- Flagged sets stay in the table (never deleted) but are excluded from all
-- competition scoring.
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS flag_reason text;

-- Outlier guard: a single working set whose volume (weight × reps) is more
-- than 3× the user's own rolling average for that exercise is flagged on
-- insert and excluded from scoring. Needs at least 3 prior non-flagged
-- working sets of that exercise (in the trailing 90 days) before it will
-- flag anything, so early logs are never spuriously flagged.
CREATE OR REPLACE FUNCTION public.flag_outlier_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n   int;
  v_avg numeric;
  v_vol numeric;
BEGIN
  -- Only authenticated, non-warmup, positive-volume sets can be outliers.
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.set_type, 'working') = 'warmup' THEN RETURN NEW; END IF;
  v_vol := coalesce(NEW.weight, 0) * coalesce(NEW.reps_done, 0);
  IF v_vol <= 0 THEN RETURN NEW; END IF;

  SELECT count(*), avg(wl.weight * wl.reps_done)
    INTO v_n, v_avg
  FROM public.workout_logs wl
  WHERE wl.user_id = NEW.user_id
    AND wl.exercise_id = NEW.exercise_id
    AND coalesce(wl.set_type, 'working') <> 'warmup'
    AND wl.is_flagged = false
    AND wl.created_at >= now() - interval '90 days';

  IF v_n >= 3 AND v_avg > 0 AND v_vol > 3 * v_avg THEN
    NEW.is_flagged := true;
    NEW.flag_reason := 'outlier_3x';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_outlier_set ON public.workout_logs;
CREATE TRIGGER trg_flag_outlier_set
  BEFORE INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.flag_outlier_set();

-- ── competitions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
  track text NOT NULL CHECK (track IN ('consistency','volume')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',      -- locked from creator at creation
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','completed','cancelled')),
  created_at timestamptz DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_competitions_created_by ON public.competitions(created_by);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);

-- ── competition_participants ──────────────────────────────────
-- baseline_volume, scheduled_days, and the final_* columns are all frozen
-- snapshots (see header). scheduled_days / final_* are additions the rules
-- require; they extend this new table, they do not recreate anything.
CREATE TABLE IF NOT EXISTS public.competition_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited','accepted','declined')),
  baseline_volume numeric,        -- volume track: Σ over the prior window, frozen at start_at (NULL → derive from first 3 in-competition days)
  baseline_days smallint,         -- volume track: distinct training days that baseline_volume spans (for per-day rate)
  scheduled_days smallint[],      -- consistency track: frozen scheduled weekdays (Mon=0…Sun=6)
  final_score numeric,            -- frozen by finalize_competition()
  final_delta numeric,            -- frozen by finalize_competition() (volume %Δ; NULL for consistency)
  final_rank int,                 -- frozen by finalize_competition()
  joined_at timestamptz DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_participants_comp ON public.competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_participants_user ON public.competition_participants(user_id);

-- ── badges ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('gold','silver','bronze','finisher')),
  awarded_at timestamptz DEFAULT now(),
  -- One tier per (user, competition) → finalize is idempotent and can be
  -- re-run safely.
  UNIQUE (user_id, competition_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_badges_user ON public.badges(user_id);

-- Helper index for the outlier trigger's rolling-average lookup.
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_exercise_created
  ON public.workout_logs(user_id, exercise_id, created_at);

-- ============================================================
-- RLS
-- Competition / participant / badge rows are visible only to the people in
-- the competition (invited or accepted) and its creator. All writes go
-- through the SECURITY DEFINER RPCs below, so there are no write policies.
-- ============================================================

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- Membership check as a SECURITY DEFINER function so the participant SELECT
-- policy does not recurse into competition_participants' own RLS.
CREATE OR REPLACE FUNCTION public.is_competition_member(p_comp uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competition_participants cp
    WHERE cp.competition_id = p_comp AND cp.user_id = p_user
  ) OR EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = p_comp AND c.created_by = p_user
  );
$$;

CREATE POLICY "competitions member read" ON public.competitions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_competition_member(id, auth.uid()));

CREATE POLICY "participants member read" ON public.competition_participants
  FOR SELECT TO authenticated
  USING (public.is_competition_member(competition_id, auth.uid()));

-- Badges are visible to the owner, to co-participants of the awarding
-- competition, and to accepted friends (so the badge shelf renders on a
-- friend's profile). Non-competition badges (competition_id NULL) fall back
-- to owner + friends.
CREATE POLICY "badges visible read" ON public.badges
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (competition_id IS NOT NULL AND public.is_competition_member(competition_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = badges.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = badges.user_id))
    )
  );

-- ============================================================
-- Internal helpers (owner-only; called from the definer RPCs)
-- ============================================================

-- Number of whole competition days, in the competition timezone. A window
-- [start,end) that spans N calendar days (end exclusive) returns N.
CREATE OR REPLACE FUNCTION public._comp_day_span(p_start timestamptz, p_end timestamptz, p_tz text)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT greatest(
    1,
    ((p_end - interval '1 microsecond') AT TIME ZONE p_tz)::date
      - (p_start AT TIME ZONE p_tz)::date + 1
  );
$$;

-- Live standings for a competition's accepted participants, computed from
-- source logs as-of p_as_of. Returns one row per accepted participant.
--   score  : the ranking value (consistency % or volume %Δ)
--   delta  : volume %Δ (NULL for consistency)
--   scored_days : distinct in-competition days the participant "scored"
--                 (completed a scheduled day / logged a counting set) — used
--                 for the finisher badge and the ≥1-day gate.
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
  c            public.competitions%ROWTYPE;
  p            public.competition_participants%ROWTYPE;
  v_as_of      timestamptz;
  v_total_days int;
  -- volume
  v_current    numeric;
  v_baseline   numeric;
  v_base_days  int;
  v_cur_rate   numeric;
  v_base_rate  numeric;
  -- consistency
  v_scheduled  int;
  v_completed  int;
BEGIN
  SELECT * INTO c FROM public.competitions WHERE id = p_comp_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_as_of := least(p_as_of, c.end_at);
  IF v_as_of <= c.start_at THEN
    -- Not started yet: everyone sits at zero.
    FOR p IN SELECT * FROM public.competition_participants
             WHERE competition_id = p_comp_id AND status = 'accepted' LOOP
      user_id := p.user_id; score := 0; delta := NULL; scored_days := 0;
      RETURN NEXT;
    END LOOP;
    RETURN;
  END IF;

  v_total_days := public._comp_day_span(c.start_at, c.end_at, c.timezone);

  FOR p IN SELECT * FROM public.competition_participants
           WHERE competition_id = p_comp_id AND status = 'accepted' LOOP

    IF c.track = 'volume' THEN
      -- In-competition working volume so far (flagged sets excluded).
      SELECT coalesce(sum(wl.weight * wl.reps_done), 0)
        INTO v_current
      FROM public.workout_logs wl
      WHERE wl.user_id = p.user_id
        AND wl.is_flagged = false
        AND coalesce(wl.set_type, 'working') <> 'warmup'
        AND wl.created_at >= c.start_at
        AND wl.created_at < v_as_of;

      -- Distinct counting days so far.
      SELECT count(DISTINCT (wl.created_at AT TIME ZONE c.timezone)::date)
        INTO scored_days
      FROM public.workout_logs wl
      WHERE wl.user_id = p.user_id
        AND wl.is_flagged = false
        AND coalesce(wl.set_type, 'working') <> 'warmup'
        AND wl.created_at >= c.start_at
        AND wl.created_at < v_as_of;

      IF p.baseline_volume IS NOT NULL THEN
        -- Frozen prior-history baseline (Σ over the prior window and the
        -- number of training days it spanned).
        v_baseline  := p.baseline_volume;
        v_base_days := coalesce(p.baseline_days, 1);
      ELSE
        -- Fallback: the participant's first 3 in-competition counting days.
        SELECT coalesce(sum(d.day_vol), 0), count(*)
          INTO v_baseline, v_base_days
        FROM (
          SELECT sum(wl.weight * wl.reps_done) AS day_vol
          FROM public.workout_logs wl
          WHERE wl.user_id = p.user_id
            AND wl.is_flagged = false
            AND coalesce(wl.set_type, 'working') <> 'warmup'
            AND wl.created_at >= c.start_at
            AND wl.created_at < v_as_of
          GROUP BY (wl.created_at AT TIME ZONE c.timezone)::date
          ORDER BY (wl.created_at AT TIME ZONE c.timezone)::date
          LIMIT 3
        ) d;
      END IF;

      -- Compare per-training-day volume: current rate vs baseline rate. Using
      -- training days (not calendar days) on both sides means rest days never
      -- distort the %Δ, and a short fallback baseline stays comparable to the
      -- full competition.
      IF v_baseline IS NULL OR v_baseline <= 0 OR coalesce(v_base_days, 0) = 0 THEN
        delta := NULL;              -- no usable baseline yet
        score := 0;
      ELSE
        v_cur_rate  := v_current / greatest(scored_days, 1);
        v_base_rate := v_baseline / greatest(v_base_days, 1);
        delta := round((v_cur_rate - v_base_rate) / v_base_rate * 100, 1);
        score := delta;
      END IF;

      user_id := p.user_id;
      RETURN NEXT;

    ELSE  -- consistency
      delta := NULL;
      IF p.scheduled_days IS NULL OR array_length(p.scheduled_days, 1) IS NULL THEN
        -- No schedule captured → nothing to be consistent against.
        user_id := p.user_id; score := 0; scored_days := 0;
        RETURN NEXT;
        CONTINUE;
      END IF;

      -- Scheduled day-occurrences in [start, as_of) in the locked tz, and how
      -- many of them had at least one non-flagged working set (one completion
      -- per scheduled day — reuses the "did they train that day" concept
      -- rather than reimplementing it).
      WITH days AS (
        SELECT gd::date AS d
        FROM generate_series(
          (c.start_at AT TIME ZONE c.timezone)::date,
          ((v_as_of - interval '1 microsecond') AT TIME ZONE c.timezone)::date,
          interval '1 day'
        ) gd
      ),
      scheduled AS (
        SELECT d FROM days
        WHERE (extract(isodow FROM d)::int - 1) = ANY (p.scheduled_days)
      ),
      completed AS (
        SELECT s.d
        FROM scheduled s
        WHERE EXISTS (
          SELECT 1 FROM public.workout_logs wl
          WHERE wl.user_id = p.user_id
            AND wl.is_flagged = false
            AND coalesce(wl.set_type, 'working') <> 'warmup'
            AND wl.created_at >= c.start_at
            AND wl.created_at < v_as_of
            AND (wl.created_at AT TIME ZONE c.timezone)::date = s.d
        )
      )
      SELECT (SELECT count(*) FROM scheduled), (SELECT count(*) FROM completed)
        INTO v_scheduled, v_completed;

      scored_days := coalesce(v_completed, 0);
      IF coalesce(v_scheduled, 0) = 0 THEN
        score := 0;
      ELSE
        score := round(v_completed::numeric / v_scheduled * 100, 1);
      END IF;

      user_id := p.user_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Lock the roster at start_at: freeze volume baselines, and either activate
-- (2+ accepted) or auto-cancel (<2 accepted). Idempotent; safe to call from
-- cron at start_at or lazily on first read after start.
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
    UPDATE public.competitions SET status = 'cancelled' WHERE id = c.id;
    RETURN;
  END IF;

  v_total := public._comp_day_span(c.start_at, c.end_at, c.timezone);

  IF c.track = 'volume' THEN
    FOR p IN SELECT * FROM public.competition_participants
             WHERE competition_id = c.id AND status = 'accepted' LOOP
      -- Prior history: earliest counting log before start_at.
      SELECT min(wl.created_at) INTO v_first
      FROM public.workout_logs wl
      WHERE wl.user_id = p.user_id
        AND wl.is_flagged = false
        AND coalesce(wl.set_type, 'working') <> 'warmup'
        AND wl.created_at < c.start_at;

      -- <7 days of prior history → leave baseline NULL so scoring falls back
      -- to the first 3 in-competition days.
      IF v_first IS NULL OR v_first > c.start_at - interval '7 days' THEN
        v_base := NULL;
        v_base_days := NULL;
      ELSE
        -- Σ and the number of training days over the prior window (length =
        -- competition length), immediately before start_at.
        SELECT coalesce(sum(wl.weight * wl.reps_done), 0),
               count(DISTINCT (wl.created_at AT TIME ZONE c.timezone)::date)
          INTO v_base, v_base_days
        FROM public.workout_logs wl
        WHERE wl.user_id = p.user_id
          AND wl.is_flagged = false
          AND coalesce(wl.set_type, 'working') <> 'warmup'
          AND wl.created_at >= c.start_at - (v_total || ' days')::interval
          AND wl.created_at < c.start_at;
        -- No logs actually landed in the window → fall back at scoring time.
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

-- ============================================================
-- RPCs
-- ============================================================

-- Create a competition. Timezone is locked from the creator (passed from the
-- browser). The creator auto-joins as accepted; participant_ids must be the
-- creator's accepted friends (others are ignored). Needs at least one invitee.
CREATE OR REPLACE FUNCTION public.create_competition(
  p_name text,
  p_track text,
  p_participant_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text DEFAULT 'UTC',
  p_scheduled_days smallint[] DEFAULT NULL   -- creator's schedule snapshot (consistency track)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_comp   uuid;
  v_tz     text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_id     uuid;
  v_count  int := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF p_track NOT IN ('consistency','volume') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_track');
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_window');
  END IF;
  IF p_end_at <= now() OR p_start_at < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_window');
  END IF;

  -- Validate the timezone string; fall back to UTC if unknown.
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  INSERT INTO public.competitions (name, track, created_by, timezone, start_at, end_at, status)
  VALUES (trim(p_name), p_track, v_me, v_tz, p_start_at, p_end_at, 'pending')
  RETURNING id INTO v_comp;

  -- Creator auto-joins as accepted.
  INSERT INTO public.competition_participants (competition_id, user_id, status, scheduled_days)
  VALUES (v_comp, v_me, 'accepted', p_scheduled_days);

  -- Invite accepted friends only; ignore anyone who is not one, plus self/dupes.
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
    -- No valid invitees → nothing to compete against. Roll back the row.
    DELETE FROM public.competitions WHERE id = v_comp;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_participants');
  END IF;

  RETURN jsonb_build_object('ok', true, 'competition_id', v_comp, 'invited', v_count);
END;
$$;

-- Accept an invite (only while the competition is still pending). For the
-- consistency track the client passes its scheduled weekdays, frozen here.
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
  v_me     uuid := auth.uid();
  c        public.competitions%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF c.status <> 'pending' OR now() >= c.start_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'roster_locked');
  END IF;

  UPDATE public.competition_participants
    SET status = 'accepted',
        scheduled_days = coalesce(p_scheduled_days, scheduled_days)
  WHERE competition_id = p_competition_id AND user_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_invited');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Decline an invite.
CREATE OR REPLACE FUNCTION public.decline_competition_invite(p_competition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.competition_participants
    SET status = 'declined'
  WHERE competition_id = p_competition_id AND user_id = v_me
    AND status = 'invited';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_invited'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Live (or frozen, once completed) standings for a competition. Only a
-- participant or the creator may read it. Lazily locks the roster at start_at
-- and lazily finalizes after end_at, so correctness does not depend on cron.
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
  is_self boolean
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
    -- Frozen: read the ranks recorded at finalize.
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           p.final_score, p.final_delta, NULL::int, p.final_rank, (p.user_id = v_me)
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id AND p.status = 'accepted'
    ORDER BY p.final_rank NULLS LAST, pr.username;
    RETURN;
  END IF;

  IF c.status = 'cancelled' THEN
    -- Show the roster; no scores.
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           NULL::numeric, NULL::numeric, 0, NULL::int, (p.user_id = v_me)
    FROM public.competition_participants p
    JOIN public.profiles pr ON pr.id = p.user_id
    WHERE p.competition_id = c.id
    ORDER BY pr.username;
    RETURN;
  END IF;

  IF c.status = 'pending' THEN
    -- Pre-start: show accepted/invited roster, no live scores yet.
    RETURN QUERY
    SELECT p.user_id, pr.username, pr.display_name, pr.avatar_url, p.status,
           NULL::numeric, NULL::numeric, 0, NULL::int, (p.user_id = v_me)
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
         r.score, r.delta, r.scored_days, r.rnk::int, (r.user_id = v_me)
  FROM ranked r
  JOIN public.profiles pr ON pr.id = r.user_id
  ORDER BY r.rnk, pr.username;
END;
$$;

-- Finalize at end_at: freeze final ranks/scores and award badges. Ranks come
-- from the data as-of end_at, so later log edits never change the result.
-- Idempotent — awarding uses ON CONFLICT DO NOTHING and the status guard.
CREATE OR REPLACE FUNCTION public.finalize_competition(p_competition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.competitions%ROWTYPE;
  r        RECORD;
  v_awarded int := 0;
BEGIN
  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- Lock the roster first if that never happened (e.g. no start_at cron).
  IF c.status = 'pending' AND now() >= c.start_at THEN
    PERFORM public.activate_competition(c.id);
    SELECT * INTO c FROM public.competitions WHERE id = c.id FOR UPDATE;
  END IF;

  IF c.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_finalized');
  END IF;
  IF c.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelled');
  END IF;
  IF c.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_active');
  END IF;
  IF now() < c.end_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_ended');
  END IF;

  -- Freeze final scores/ranks + award badges from the as-of-end_at standings.
  FOR r IN
    WITH s AS (
      SELECT * FROM public.compute_competition_standings(c.id, c.end_at)
    )
    SELECT s.*, rank() OVER (ORDER BY s.score DESC) AS rnk
    FROM s
  LOOP
    UPDATE public.competition_participants
      SET final_score = r.score, final_delta = r.delta, final_rank = r.rnk
    WHERE competition_id = c.id AND user_id = r.user_id;

    -- Medals for the top 3 ranks (ties share a tier).
    IF r.rnk IN (1, 2, 3) THEN
      INSERT INTO public.badges (user_id, competition_id, tier)
      VALUES (r.user_id, c.id,
              CASE r.rnk WHEN 1 THEN 'gold' WHEN 2 THEN 'silver' ELSE 'bronze' END)
      ON CONFLICT (user_id, competition_id, tier) DO NOTHING;
      v_awarded := v_awarded + 1;
    END IF;

    -- Finisher badge for everyone who scored at least one day.
    IF coalesce(r.scored_days, 0) >= 1 THEN
      INSERT INTO public.badges (user_id, competition_id, tier)
      VALUES (r.user_id, c.id, 'finisher')
      ON CONFLICT (user_id, competition_id, tier) DO NOTHING;
      v_awarded := v_awarded + 1;
    END IF;
  END LOOP;

  UPDATE public.competitions SET status = 'completed' WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'reason', 'finalized', 'awarded', v_awarded);
END;
$$;

-- List the competitions the caller is in (invited/accepted) or created, with
-- their own participant status. Lazily advances state so cards reflect reality.
CREATE OR REPLACE FUNCTION public.get_my_competitions()
RETURNS TABLE (
  id uuid,
  name text,
  track text,
  timezone text,
  start_at timestamptz,
  end_at timestamptz,
  status text,
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

  -- Advance any of my competitions that have crossed a boundary.
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
  SELECT c.id, c.name, c.track, c.timezone, c.start_at, c.end_at, c.status, c.created_by,
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

-- ── Grants ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.flag_outlier_set() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_competition_standings(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._comp_day_span(timestamptz, timestamptz, text) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.is_competition_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_competition_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_competition_invite(uuid, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_competition_invite(uuid, smallint[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decline_competition_invite(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decline_competition_invite(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_competition_standings(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_competition_standings(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_competitions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_competitions() TO authenticated;

-- activate_competition / finalize_competition are safe to expose: both are
-- guarded by start_at / end_at, so a client cannot start or end a competition
-- early. Intended callers are the cron/edge scheduler (service role) and the
-- lazy calls above.
REVOKE EXECUTE ON FUNCTION public.activate_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.activate_competition(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_competition(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.finalize_competition(uuid) TO authenticated;
