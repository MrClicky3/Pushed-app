/*
# Competition starts immediately on accept (no midnight wait)

## Problem
Competitions had `start_at = next midnight`, so after a friend accepted there
was a "starts in Xh" wait before the competition actually began. The user wants
it to start the instant the other friend accepts.

## Changes

### 1. `accept_competition_invite` — start immediately on 2nd accept
When the second participant (the first friend after the creator) accepts:
- Move `start_at` to `now()` so the competition window begins immediately.
- Shift `end_at` by the same delta so the duration is preserved.
- Call `activate_competition` to lock the roster and freeze baselines right away.
- The competition goes from `pending` → `active` in the same call.

If only the creator has accepted so far (no second player yet), the competition
stays `pending` with its original far-future `start_at` — it will be activated
on the next accept, not on a timer.

### 2. `create_competition` — push start_at far into the future
The creator sets `start_at` to ~year 2099 instead of next midnight. This is a
placeholder "not yet started" sentinel: the real start happens when
`accept_competition_invite` overwrites it on the 2nd accept. The `end_at` is
still `start_at + duration` so the duration is preserved when both are shifted.

### 3. `activate_competition` — unchanged minimum (2 accepted = creator + 1 friend)
The existing `v_accepted < 2` guard already enforces "at least 1 friend
accepted" (the creator is the 1st accepted). No change needed.

## Notes
- Existing pending competitions with the old midnight `start_at` will still
  activate at their original `start_at` via the lazy transition in
  `get_my_competitions` / `get_competition_standings`. Only new competitions
  use the accept-triggered start.
- `activate_competition` is idempotent and guarded by `status = 'pending'`,
  so calling it from `accept_competition_invite` is safe even if a lazy
  transition already fired.
*/

-- ── 1. accept_competition_invite: start on 2nd accept ──────────
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
  v_duration interval;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO c FROM public.competitions WHERE id = p_competition_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF c.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'roster_locked');
  END IF;

  -- Accept this user's invite.
  UPDATE public.competition_participants
    SET status = 'accepted',
        scheduled_days = coalesce(p_scheduled_days, scheduled_days)
  WHERE competition_id = p_competition_id AND user_id = v_me;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_invited');
  END IF;

  -- Count accepted participants (creator + friends). If this is the 2nd
  -- accept (first friend joining), start the competition immediately.
  SELECT count(*) INTO v_accepted
  FROM public.competition_participants
  WHERE competition_id = p_competition_id AND status = 'accepted';

  IF v_accepted >= 2 THEN
    -- Preserve the original duration, shift the window to start now.
    v_duration := c.end_at - c.start_at;
    UPDATE public.competitions
      SET start_at = now(),
          end_at   = now() + v_duration
    WHERE id = p_competition_id;

    -- Lock roster, freeze baselines, flip to active.
    PERFORM public.activate_competition(p_competition_id);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 2. create_competition: far-future sentinel start_at ─────────
CREATE OR REPLACE FUNCTION public.create_competition(
  p_name text,
  p_track text,
  p_participant_ids uuid[],
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_timezone text DEFAULT 'UTC',
  p_scheduled_days smallint[] DEFAULT NULL
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
  v_dur    interval;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF p_track NOT IN ('consistency','volume') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_track');
  END IF;
  IF p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_window');
  END IF;

  -- Validate the timezone string; fall back to UTC if unknown.
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'UTC';
  END;

  -- The real start_at is set by accept_competition_invite when the 2nd player
  -- joins. Store a far-future sentinel so the competition stays pending until
  -- then. Preserve the caller's intended duration.
  v_dur := p_end_at - p_start_at;

  INSERT INTO public.competitions (name, track, created_by, timezone, start_at, end_at, status)
  VALUES (trim(p_name), p_track, v_me, v_tz,
          now() + interval '100 years',  -- sentinel: "not yet started"
          now() + interval '100 years' + v_dur,
          'pending')
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

-- Re-grant execute on the replaced functions.
REVOKE EXECUTE ON FUNCTION public.accept_competition_invite(uuid, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_competition_invite(uuid, smallint[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_competition(text, text, uuid[], timestamptz, timestamptz, text, smallint[]) TO authenticated;
