-- ============================================================
-- Progressive Overload Tracker — "Compete with friends" social layer
-- Paste this into the Supabase SQL Editor and click Run.
--
-- Adds: profiles, friendships, user_stats + streak/volume leaderboards.
--
-- STATS MODEL: routines & schedule live only in the client (localStorage),
-- so streak/consistency cannot be computed in SQL. The client computes them
-- (reusing its AnalyticsView completion logic) and pushes them via
-- set_my_stats(). Volume is authoritative and computed here from
-- workout_logs, which IS persisted to Supabase.
-- ============================================================

-- ── Invite-code generator ─────────────────────────────────────
-- Defined before profiles because it is used as the column default.
CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no I, L, O, 0, 1
  v_code text;
  i int;
  v_exists boolean;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE invite_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL CHECK (char_length(username) BETWEEN 3 AND 20),
  display_name text,
  avatar_url text,
  invite_code text UNIQUE NOT NULL DEFAULT public.gen_invite_code(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public read (authenticated): required for username search + leaderboard joins.
CREATE POLICY "profiles public read" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles self insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(lower(username));

-- ── friendships ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

-- One row per unordered pair, regardless of who initiated.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uniq
  ON public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships involved select" ON public.friendships
  FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "friendships insert own request" ON public.friendships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships involved update" ON public.friendships
  FOR UPDATE TO authenticated USING (auth.uid() IN (requester_id, addressee_id))
  WITH CHECK (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "friendships involved delete" ON public.friendships
  FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, addressee_id));

-- ── user_stats ────────────────────────────────────────────────
-- Populated by the client via set_my_stats(). consistency_score is the
-- trailing-30d % of scheduled days completed (NULL when none scheduled).
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  total_completed_days int NOT NULL DEFAULT 0,
  consistency_score numeric,
  updated_at timestamptz DEFAULT now()
);
-- If an earlier version of this table exists without the column, add it.
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS consistency_score numeric;

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;

-- Readable by self or an accepted friend. No write policies — only the
-- SECURITY DEFINER set_my_stats() (which bypasses RLS) writes here.
CREATE POLICY "user_stats self or friend read" ON public.user_stats
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = user_stats.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = user_stats.user_id))
    )
  );

-- ============================================================
-- RPCs
-- ============================================================

-- Client pushes its computed stats. Only the caller's own row is written.
CREATE OR REPLACE FUNCTION public.set_my_stats(
  p_current int,
  p_longest int,
  p_total int,
  p_consistency numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.user_stats (user_id, current_streak, longest_streak, total_completed_days, consistency_score, updated_at)
  VALUES (v_me, greatest(coalesce(p_current, 0), 0), greatest(coalesce(p_longest, 0), 0),
          greatest(coalesce(p_total, 0), 0), p_consistency, now())
  ON CONFLICT (user_id) DO UPDATE
    SET current_streak = EXCLUDED.current_streak,
        longest_streak = EXCLUDED.longest_streak,
        total_completed_days = EXCLUDED.total_completed_days,
        consistency_score = EXCLUDED.consistency_score,
        updated_at = now();
END;
$$;

-- Redeem an invite code → create an accepted friendship directly (no
-- pending step). Graceful on invalid/self/already-friends.
CREATE OR REPLACE FUNCTION public.accept_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_target uuid;
  v_status text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE invite_code = upper(trim(p_code));
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;
  IF v_target = v_me THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  SELECT status INTO v_status FROM public.friendships
  WHERE (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
      = (least(v_me, v_target), greatest(v_me, v_target));

  IF v_status = 'accepted' THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_friends', 'friend_id', v_target);
  END IF;

  IF v_status IS NULL THEN
    BEGIN
      INSERT INTO public.friendships (requester_id, addressee_id, status)
      VALUES (v_me, v_target, 'accepted');
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.friendships SET status = 'accepted', updated_at = now()
      WHERE (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
          = (least(v_me, v_target), greatest(v_me, v_target));
    END;
  ELSE
    UPDATE public.friendships SET status = 'accepted', updated_at = now()
    WHERE (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
        = (least(v_me, v_target), greatest(v_me, v_target));
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'accepted', 'friend_id', v_target);
END;
$$;

-- Streak leaderboard: self + accepted friends, sorted by current_streak,
-- with trailing-30d consistency as a secondary column.
CREATE OR REPLACE FUNCTION public.get_friend_leaderboard()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  current_streak int,
  longest_streak int,
  consistency_score numeric,
  is_self boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  WITH friend_ids AS (
    SELECT v_me AS uid
    UNION
    SELECT CASE WHEN f.requester_id = v_me THEN f.addressee_id ELSE f.requester_id END
    FROM public.friendships f
    WHERE f.status = 'accepted' AND v_me IN (f.requester_id, f.addressee_id)
  )
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(s.current_streak, 0),
    coalesce(s.longest_streak, 0),
    s.consistency_score,
    (p.id = v_me)
  FROM friend_ids fi
  JOIN public.profiles p ON p.id = fi.uid
  LEFT JOIN public.user_stats s ON s.user_id = fi.uid
  ORDER BY coalesce(s.current_streak, 0) DESC,
           s.consistency_score DESC NULLS LAST,
           p.username ASC;
END;
$$;

-- Volume leaderboard: same friend group, sorted by trailing-30d
-- Σ(weight × reps_done) from workout_logs (warmups excluded).
CREATE OR REPLACE FUNCTION public.get_friend_volume_leaderboard()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  volume numeric,
  is_self boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_start timestamptz := now() - interval '30 days';
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  WITH friend_ids AS (
    SELECT v_me AS uid
    UNION
    SELECT CASE WHEN f.requester_id = v_me THEN f.addressee_id ELSE f.requester_id END
    FROM public.friendships f
    WHERE f.status = 'accepted' AND v_me IN (f.requester_id, f.addressee_id)
  )
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce((
      SELECT sum(wl.weight * wl.reps_done)
      FROM public.workout_logs wl
      WHERE wl.user_id = p.id
        AND wl.created_at >= v_start
        AND coalesce(wl.set_type, 'working') <> 'warmup'
    ), 0)::numeric,
    (p.id = v_me)
  FROM friend_ids fi
  JOIN public.profiles p ON p.id = fi.uid
  ORDER BY 5 DESC, p.username ASC;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────
-- gen_invite_code runs as the authenticated role via the column default.
REVOKE EXECUTE ON FUNCTION public.gen_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gen_invite_code() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_my_stats(int, int, int, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_stats(int, int, int, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friend_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_friend_volume_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_volume_leaderboard() TO authenticated;
