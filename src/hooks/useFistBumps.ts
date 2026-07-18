// Fist bumps — one-tap "saw you trained, respect" reactions between friends.
// Requires supabase_fistbumps_migration.sql. Every call feature-detects: if
// the table doesn't exist yet the hook reports `available: false` and all UI
// built on it stays hidden, so shipping the client first is safe.
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface BumpSender {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

function isoDay(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function useFistBumps(userId: string) {
  // null = unknown (until the first call), then true/false.
  const [available, setAvailable] = useState<boolean | null>(null);

  const markUnavailable = useCallback((error: { code?: string } | null) => {
    // 42P01 = undefined_table — the migration hasn't been run yet.
    if (error?.code === '42P01') { setAvailable(false); return true; }
    if (error) return false;
    setAvailable(true);
    return false;
  }, []);

  /** Bump a friend for today. ok:false + reason 'already' when repeated. */
  const sendBump = useCallback(async (toUserId: string): Promise<{ ok: boolean; reason?: 'already' | 'error' | 'unavailable' }> => {
    const { error } = await supabase.from('fist_bumps').insert({
      from_user: userId, to_user: toUserId, day: isoDay(),
    });
    if (markUnavailable(error)) return { ok: false, reason: 'unavailable' };
    if (error) return { ok: false, reason: error.code === '23505' ? 'already' : 'error' };
    return { ok: true };
  }, [userId, markUnavailable]);

  /** Did I already bump this friend today? null = feature unavailable. */
  const bumpedToday = useCallback(async (toUserId: string): Promise<boolean | null> => {
    const { data, error } = await supabase
      .from('fist_bumps').select('id')
      .eq('from_user', userId).eq('to_user', toUserId).eq('day', isoDay())
      .maybeSingle();
    if (markUnavailable(error)) return null;
    if (error) return null;
    return !!data;
  }, [userId, markUnavailable]);

  /** Bumps sent to me today, with sender profiles — shown on the recap card. */
  const loadBumpsForMeToday = useCallback(async (): Promise<BumpSender[]> => {
    const { data, error } = await supabase
      .from('fist_bumps').select('from_user')
      .eq('to_user', userId).eq('day', isoDay());
    if (markUnavailable(error) || error || !data?.length) return [];
    const ids = Array.from(new Set((data as { from_user: string }[]).map(r => r.from_user)));
    const { data: profs } = await supabase
      .from('profiles').select('id,username,display_name,avatar_url').in('id', ids);
    return (profs as BumpSender[]) ?? [];
  }, [userId, markUnavailable]);

  return { available, sendBump, bumpedToday, loadBumpsForMeToday };
}
