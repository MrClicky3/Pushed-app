import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { recordBaseline } from '../lib/compSnapshots';
import type { CompetitionSummary, CompetitionStanding, Badge, CompetitionTrack } from '../types';

export interface CreateCompetitionInput {
  name: string;
  track: CompetitionTrack;
  participantIds: string[];
  startAt: Date;
  endAt: Date;
}

export interface RpcResult {
  ok: boolean;
  reason?: string;
  competition_id?: string;
}

// The IANA timezone locked into a competition is captured from the creator's
// browser at creation time — never the viewer's device tz thereafter.
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Competitions data layer. `scheduledDays` is the current user's scheduled
 * training weekdays (Mon=0…Sun=6), derived from the client-only schedule.
 * The retired consistency track froze it server-side on create/accept; it is
 * still passed for signature stability, but the volume/streak tracks ignore it.
 */
export function useCompetitions(scheduledDays: number[]) {
  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Standings cache — every fetch lands here so season records and the badge
  // sheet can reuse standings a card already loaded. Deliberately a ref with
  // no companion state: consumers pass `comps` into effect dependency arrays,
  // so re-rendering this hook on every fetch would change its identity, refire
  // those effects, and fetch forever.
  const standingsCacheRef = useRef(new Map<string, CompetitionStanding[]>());

  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_competitions');
    setCompetitions((data as CompetitionSummary[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createCompetition = useCallback(async (input: CreateCompetitionInput): Promise<RpcResult> => {
    const { data, error } = await supabase.rpc('create_competition', {
      p_name: input.name,
      p_track: input.track,
      p_participant_ids: input.participantIds,
      p_start_at: input.startAt.toISOString(),
      p_end_at: input.endAt.toISOString(),
      p_timezone: deviceTimezone(),
      p_scheduled_days: scheduledDays,
    });
    await reload();
    if (error) return { ok: false, reason: 'error' };
    return data as RpcResult;
  }, [reload, scheduledDays]);

  const acceptInvite = useCallback(async (competitionId: string): Promise<RpcResult> => {
    const { data, error } = await supabase.rpc('accept_competition_invite', {
      p_competition_id: competitionId,
      p_scheduled_days: scheduledDays,
    });
    await reload();
    if (error) return { ok: false, reason: 'error' };
    return data as RpcResult;
  }, [reload, scheduledDays]);

  const declineInvite = useCallback(async (competitionId: string): Promise<RpcResult> => {
    const { data, error } = await supabase.rpc('decline_competition_invite', {
      p_competition_id: competitionId,
    });
    await reload();
    if (error) return { ok: false, reason: 'error' };
    return data as RpcResult;
  }, [reload]);

  const voteCancel = useCallback(async (competitionId: string): Promise<RpcResult & { cancelled?: boolean }> => {
    const { data, error } = await supabase.rpc('vote_cancel_competition', {
      p_competition_id: competitionId,
    });
    await reload();
    if (error) return { ok: false, reason: 'error' };
    return data as RpcResult & { cancelled?: boolean };
  }, [reload]);

  const unvoteCancel = useCallback(async (competitionId: string): Promise<RpcResult> => {
    const { data, error } = await supabase.rpc('unvote_cancel_competition', {
      p_competition_id: competitionId,
    });
    await reload();
    if (error) return { ok: false, reason: 'error' };
    return data as RpcResult;
  }, [reload]);

  const getStandings = useCallback(async (competitionId: string): Promise<CompetitionStanding[]> => {
    const { data } = await supabase.rpc('get_competition_standings', {
      p_competition_id: competitionId,
    });
    const rows = (data as CompetitionStanding[]) ?? [];
    standingsCacheRef.current.set(competitionId, rows);
    // Freeze today's baseline off the first fetch of the day — powers the
    // recap card's "what today's session did" delta.
    const me = rows.find(r => r.is_self);
    if (me) recordBaseline(competitionId, { score: me.score ?? null, delta: me.delta ?? null });
    return rows;
  }, []);

  const getCachedStandings = useCallback(
    (competitionId: string): CompetitionStanding[] | undefined => standingsCacheRef.current.get(competitionId),
    [],
  );

  // Badges for the badge shelf — the caller's own, or a friend's (RLS gates
  // visibility). Newest first.
  const loadBadges = useCallback(async (targetUserId: string): Promise<Badge[]> => {
    const { data } = await supabase
      .from('badges')
      .select('*')
      .eq('user_id', targetUserId)
      .order('awarded_at', { ascending: false });
    return (data as Badge[]) ?? [];
  }, []);

  const pendingInvites = competitions.filter(c => c.my_status === 'invited' && c.status === 'pending');

  return {
    loading,
    competitions,
    pendingInvites,
    reload,
    createCompetition,
    acceptInvite,
    declineInvite,
    voteCancel,
    unvoteCancel,
    getStandings,
    getCachedStandings,
    loadBadges,
  };
}
