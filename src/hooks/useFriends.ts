import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type {
  Friendship, PendingRequest, RelationState, LeaderboardRow, VolumeRow, FriendActivity,
} from '../types';

export interface ProfileLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface SearchResult {
  users: ProfileLite[];
  /** Set when the query itself failed, so the UI can say so instead of
      reporting an empty result set. */
  error?: string;
}

export interface InviteResult {
  ok: boolean;
  reason: 'accepted' | 'already_friends' | 'self' | 'invalid_code' | 'error';
  friend_id?: string;
}

export function useFriends(userId: string) {
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);

  const loadFriendships = useCallback(async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const rows = (data as Friendship[]) ?? [];
    setFriendships(rows);

    const otherIds = Array.from(new Set(
      rows.map(r => (r.requester_id === userId ? r.addressee_id : r.requester_id)),
    ));
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id,username,display_name,avatar_url').in('id', otherIds);
      const m = new Map<string, ProfileLite>();
      for (const p of (profs ?? []) as ProfileLite[]) m.set(p.id, p);
      setProfilesById(m);
    } else {
      setProfilesById(new Map());
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadFriendships(); }, [loadFriendships]);

  const acceptedIds = useMemo(
    () => new Set(
      friendships.filter(f => f.status === 'accepted')
        .map(f => (f.requester_id === userId ? f.addressee_id : f.requester_id)),
    ),
    [friendships, userId],
  );

  // Accepted friends with their profile info — used by the competition
  // create flow to pick opponents.
  const friendsList = useMemo<ProfileLite[]>(
    () => Array.from(acceptedIds)
      .map(id => profilesById.get(id))
      .filter((p): p is ProfileLite => Boolean(p))
      .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username)),
    [acceptedIds, profilesById],
  );

  const outgoingIds = useMemo(
    () => new Set(
      friendships.filter(f => f.status === 'pending' && f.requester_id === userId)
        .map(f => f.addressee_id),
    ),
    [friendships, userId],
  );

  const incomingIds = useMemo(
    () => new Set(
      friendships.filter(f => f.status === 'pending' && f.addressee_id === userId)
        .map(f => f.requester_id),
    ),
    [friendships, userId],
  );

  function toPending(f: Friendship, otherId: string): PendingRequest {
    const info = profilesById.get(otherId);
    return {
      friendshipId: f.id,
      userId: otherId,
      username: info?.username ?? '…',
      display_name: info?.display_name ?? null,
      avatar_url: info?.avatar_url ?? null,
    };
  }

  const incoming = useMemo<PendingRequest[]>(
    () => friendships
      .filter(f => f.status === 'pending' && f.addressee_id === userId)
      .map(f => toPending(f, f.requester_id)),
    [friendships, profilesById, userId],
  );

  const outgoing = useMemo<PendingRequest[]>(
    () => friendships
      .filter(f => f.status === 'pending' && f.requester_id === userId)
      .map(f => toPending(f, f.addressee_id)),
    [friendships, profilesById, userId],
  );

  const relationFor = useCallback((id: string): RelationState => {
    if (acceptedIds.has(id)) return 'friends';
    if (outgoingIds.has(id)) return 'requested';
    if (incomingIds.has(id)) return 'incoming';
    return 'none';
  }, [acceptedIds, outgoingIds, incomingIds]);

  // Searches every profile in the app, not just friends — the "profiles public
  // read" policy exists for exactly this. Matches display name as well as
  // username, since that's the name shown everywhere else in the UI and
  // searching for it and getting nothing reads as "this user doesn't exist".
  //
  // Errors are returned rather than swallowed: a failing query and a genuine
  // zero-result search are indistinguishable to the user otherwise, and the
  // most likely failure here (the social migration not having been applied to
  // the live database) looks exactly like "no users found".
  const searchUsers = useCallback(async (q: string): Promise<SearchResult> => {
    const term = q.trim();
    if (term.length < 2) return { users: [] };
    // PostgREST needs the wildcards inside the or() filter's value, and a term
    // containing , ( ) or . would otherwise break out of the filter grammar.
    const safe = term.replace(/[,().*]/g, ' ').trim();
    if (!safe) return { users: [] };
    const { data, error } = await supabase
      .from('profiles').select('id,username,display_name,avatar_url')
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .neq('id', userId)
      .limit(15);
    if (error) return { users: [], error: error.message };
    return { users: (data as ProfileLite[]) ?? [] };
  }, [userId]);

  async function sendRequest(targetId: string) {
    await supabase.from('friendships').insert({
      requester_id: userId, addressee_id: targetId, status: 'pending',
    });
    await loadFriendships();
  }

  async function acceptRequest(friendshipId: string) {
    await supabase.from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    await loadFriendships();
  }

  async function declineRequest(friendshipId: string) {
    await supabase.from('friendships')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    await loadFriendships();
  }

  async function acceptInvite(code: string): Promise<InviteResult> {
    const { data, error } = await supabase.rpc('accept_invite', { p_code: code });
    await loadFriendships();
    if (error) return { ok: false, reason: 'error' };
    return data as InviteResult;
  }

  const loadStreakBoard = useCallback(async (): Promise<LeaderboardRow[]> => {
    const { data } = await supabase.rpc('get_friend_leaderboard');
    return (data as LeaderboardRow[]) ?? [];
  }, []);

  const loadVolumeBoard = useCallback(async (): Promise<VolumeRow[]> => {
    const { data } = await supabase.rpc('get_friend_volume_leaderboard');
    return (data as VolumeRow[]) ?? [];
  }, []);

  // Friend profile view: full profile (incl. bio) + aggregate activity.
  const loadFriendProfile = useCallback(async (id: string): Promise<(ProfileLite & { bio: string | null }) | null> => {
    const { data } = await supabase
      .from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', id).maybeSingle();
    return (data as (ProfileLite & { bio: string | null }) | null) ?? null;
  }, []);

  const loadFriendActivity = useCallback(async (id: string): Promise<FriendActivity | null> => {
    const { data } = await supabase.rpc('get_friend_activity', { p_user_id: id });
    return (data as FriendActivity) ?? null;
  }, []);

  return {
    loading,
    friendCount: acceptedIds.size,
    friendsList,
    incoming,
    outgoing,
    relationFor,
    searchUsers,
    sendRequest,
    acceptRequest,
    declineRequest,
    acceptInvite,
    loadStreakBoard,
    loadVolumeBoard,
    loadFriendProfile,
    loadFriendActivity,
    reload: loadFriendships,
  };
}
