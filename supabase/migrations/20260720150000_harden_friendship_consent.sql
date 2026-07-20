/*
  # Friendships require actual consent

  The previous policies let any authenticated user manufacture a friendship:

    - INSERT only checked `auth.uid() = requester_id` and left `status`
      unconstrained, so a client could insert a row naming any victim with
      status = 'accepted' and skip the request/accept handshake entirely.
    - UPDATE's WITH CHECK only required the caller to still be one of the two
      parties, so the *other* party's id could be swapped for an arbitrary user.

  An accepted friendship grants read access to the other person's streaks,
  consistency score and 30-day training volume (get_friend_leaderboard /
  get_friend_volume_leaderboard) and allows sending fist bumps, so this was a
  privacy hole rather than a cosmetic one.

  After this migration:
    - a request can only be created as 'pending', by its own requester;
    - only the addressee can move it to 'accepted';
    - either party may decline or block;
    - the two parties on a row are immutable (enforced by trigger, since RLS
      WITH CHECK cannot compare against the pre-update row).

  accept_invite() is SECURITY DEFINER and bypasses RLS, so redeeming an invite
  code still creates an accepted friendship in one step. That is intentional:
  possession of the code *is* the consent.

  This does not retroactively remove friendships that were forced before the
  fix. Run the audit query at the bottom if you want to look for them.
*/

-- ── INSERT: own request, always starts pending ────────────────
DROP POLICY IF EXISTS "friendships insert own request" ON public.friendships;
CREATE POLICY "friendships insert own request" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

-- ── UPDATE: only the addressee may accept ─────────────────────
DROP POLICY IF EXISTS "friendships involved update" ON public.friendships;
CREATE POLICY "friendships involved update" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (requester_id, addressee_id))
  WITH CHECK (
    CASE
      WHEN status = 'accepted' THEN auth.uid() = addressee_id
      ELSE auth.uid() IN (requester_id, addressee_id)
    END
  );

-- ── The pair itself is immutable ──────────────────────────────
-- RLS sees only the post-update row in WITH CHECK, so a trigger is the only
-- way to reject a change to requester_id / addressee_id.
CREATE OR REPLACE FUNCTION public.friendships_pin_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'The two parties on a friendship cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_pin_pair_trg ON public.friendships;
CREATE TRIGGER friendships_pin_pair_trg
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.friendships_pin_pair();

/*
  Optional audit — accepted friendships that never passed through a pending
  state are indistinguishable after the fact, but rows accepted within a second
  of creation are a reasonable proxy for ones that skipped the handshake:

    SELECT id, requester_id, addressee_id, created_at, updated_at
    FROM public.friendships
    WHERE status = 'accepted'
      AND updated_at - created_at < interval '1 second'
    ORDER BY created_at DESC;

  Invite-code redemptions legitimately look like this too, so review before
  deleting anything.
*/
