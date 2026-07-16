-- ============================================================
-- Overload — friend activity summary (for the friend profile view)
--
-- A friend's workout_logs are RLS-locked to them, so this SECURITY DEFINER
-- RPC returns only aggregate activity (volume / sets / active days) for the
-- last 7, 30, and 90 days, and only to the user themselves or an accepted
-- friend. No per-exercise or routine data is exposed (routines aren't in the
-- database at all — they're client-only).
-- ============================================================

-- Aggregate one window. Flagged and warmup sets are excluded, matching the
-- competition/volume scoring.
CREATE OR REPLACE FUNCTION public._friend_activity_window(p_user_id uuid, p_days int)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'volume', coalesce(sum(wl.weight * wl.reps_done), 0),
    'sets', count(*),
    'active_days', count(DISTINCT (wl.created_at)::date)
  )
  FROM public.workout_logs wl
  WHERE wl.user_id = p_user_id
    AND wl.is_flagged = false
    AND coalesce(wl.set_type, 'working') <> 'warmup'
    AND wl.created_at >= now() - (p_days || ' days')::interval;
$$;

CREATE OR REPLACE FUNCTION public.get_friend_activity(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_user_id <> v_me THEN
    SELECT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = v_me AND f.addressee_id = p_user_id)
          OR (f.addressee_id = v_me AND f.requester_id = p_user_id))
    ) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'd7',  public._friend_activity_window(p_user_id, 7),
    'd30', public._friend_activity_window(p_user_id, 30),
    'd90', public._friend_activity_window(p_user_id, 90)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._friend_activity_window(uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_friend_activity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_friend_activity(uuid) TO authenticated;
