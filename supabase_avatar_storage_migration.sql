-- ============================================================
-- Overload — custom profile photo uploads
-- Paste this into the Supabase SQL Editor and click Run.
--
-- Creates a public "avatars" storage bucket. Public read means the
-- object is servable via a plain HTTPS URL (no auth header) so it can be
-- used directly as an <img src>. Write access (upload/replace/delete) is
-- restricted per-user via the folder-prefix policies below — each user may
-- only touch objects under their own auth.uid() folder.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880, -- 5 MB cap; the client also resizes to <=512px before upload
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- Objects are stored at "<user_id>/avatar.<ext>" — (storage.foldername(name))[1]
-- is that first path segment, i.e. the owning user's id.
-- DROP + CREATE (not "IF NOT EXISTS") so this file is safe to re-run.
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Add avatar_url to the two leaderboard RPCs so friend rows can render a
-- photo instead of falling back to initials. Postgres can't change a
-- function's RETURNS TABLE columns via CREATE OR REPLACE, so these are
-- dropped and recreated (this re-applies the exact bodies from
-- supabase_social_migration.sql, plus the new column).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_friend_leaderboard();

CREATE FUNCTION public.get_friend_leaderboard()
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

REVOKE EXECUTE ON FUNCTION public.get_friend_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard() TO authenticated;

DROP FUNCTION IF EXISTS public.get_friend_volume_leaderboard();

CREATE FUNCTION public.get_friend_volume_leaderboard()
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

REVOKE EXECUTE ON FUNCTION public.get_friend_volume_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_volume_leaderboard() TO authenticated;
