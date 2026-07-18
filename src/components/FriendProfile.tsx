// Friend profile — opened by tapping a friend on the leaderboard. Shows their
// name, bio, and aggregate activity over 7/30/90 days (routines are not shown:
// they live only on each user's own device, never in the database).
import { useState, useEffect } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { feedback } from '../lib/feedback';
import type { WeightUnit } from '../hooks/useSettings';
import type { ProfileLite } from '../hooks/useFriends';
import type { useFistBumps } from '../hooks/useFistBumps';
import type { FriendActivity, ActivityWindow } from '../types';

export interface FriendProfileTarget {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const WINDOWS = [
  { key: 'd7', label: '7d' },
  { key: 'd30', label: '30d' },
  { key: 'd90', label: '90d' },
] as const;

type WindowKey = typeof WINDOWS[number]['key'];

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="rounded-te-md px-[18px] py-[12px] flex items-center justify-between gap-3"
      style={{ background: 'var(--te-surface-3)', border: '1px solid var(--te-border)' }}
    >
      <p className="text-[15px] font-semibold te-t1 tracking-tight">{label}</p>
      <div className="text-right shrink-0">
        <p className="text-[20px] font-bold te-t1 tabular-nums leading-none tracking-tight te-digit">{value}</p>
        <p className="text-[13px] mt-[4px]" style={{ color: 'var(--te-text-4)' }}>{sub}</p>
      </div>
    </div>
  );
}

export default function FriendProfile({
  open, onClose, target, loadFriendProfile, loadFriendActivity, unit, toDisplay, fistBumps,
}: {
  open: boolean;
  onClose: () => void;
  target: FriendProfileTarget | null;
  loadFriendProfile: (id: string) => Promise<(ProfileLite & { bio: string | null }) | null>;
  loadFriendActivity: (id: string) => Promise<FriendActivity | null>;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  fistBumps?: ReturnType<typeof useFistBumps>;
}) {
  const [bio, setBio] = useState<string | null>(null);
  const [activity, setActivity] = useState<FriendActivity | null>(null);
  const [win, setWin] = useState<WindowKey>('d7');
  const [loading, setLoading] = useState(true);
  // 'idle' → can bump · 'sent' → bumped today · 'hidden' → feature not live
  const [bumpState, setBumpState] = useState<'idle' | 'sent' | 'hidden'>('hidden');

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    setLoading(true);
    setBio(null);
    setActivity(null);
    setWin('d7');
    setBumpState('hidden');
    Promise.all([loadFriendProfile(target.user_id), loadFriendActivity(target.user_id)])
      .then(([p, a]) => {
        if (!alive) return;
        setBio(p?.bio ?? null);
        setActivity(a);
        setLoading(false);
      });
    // Fist bump availability + today's state, feature-detected (null = the
    // migration isn't live yet → keep the button hidden).
    fistBumps?.bumpedToday(target.user_id).then(already => {
      if (!alive) return;
      setBumpState(already === null ? 'hidden' : already ? 'sent' : 'idle');
    });
    return () => { alive = false; };
  }, [open, target, loadFriendProfile, loadFriendActivity, fistBumps]);

  async function bump() {
    if (!target || !fistBumps || bumpState !== 'idle') return;
    feedback.log();
    setBumpState('sent'); // optimistic — a dupe just stays "sent"
    const res = await fistBumps.sendBump(target.user_id);
    if (!res.ok && res.reason === 'unavailable') setBumpState('hidden');
  }

  if (!target) return null;
  const name = target.display_name || target.username;
  const w: ActivityWindow | null = activity ? activity[win] : null;
  const winLabel = WINDOWS.find(x => x.key === win)!.label;

  return (
    <Modal open={open} onClose={onClose} title={name}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 pt-1">
          <Avatar name={name} avatarUrl={target.avatar_url} size={72} />
          <div className="text-center">
            <p className="text-[20px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>{name}</p>
            <p className="te-label mt-1">@{target.username}</p>
          </div>
          {bio && <p className="text-[15px] te-t2 leading-snug text-center max-w-[280px]">{bio}</p>}

          {/* One-tap fist bump — accountability without a comment thread */}
          {bumpState !== 'hidden' && (
            <button
              onClick={bump}
              disabled={bumpState === 'sent'}
              className="flex items-center gap-2 rounded-full px-4 active:opacity-80 transition-all"
              style={{
                height: 38,
                background: bumpState === 'sent' ? 'rgba(48,209,88,0.12)' : '#f4f1ec',
                border: bumpState === 'sent' ? '1px solid color-mix(in srgb, var(--te-success) 25%, transparent)' : '1px solid transparent',
              }}
            >
              <span className="text-[15px] leading-none">👊</span>
              <span
                className="text-[13px] font-semibold tracking-tight"
                style={{ color: bumpState === 'sent' ? 'var(--te-success)' : 'var(--te-ink)' }}
              >
                {bumpState === 'sent' ? 'Bumped today' : 'Fist bump'}
              </span>
            </button>
          )}
        </div>

        <div>
          <div className="flex gap-1 w-full mb-3">
            {WINDOWS.map(({ key, label }) => {
              const active = win === key;
              return (
                <button
                  key={key}
                  onClick={() => setWin(key)}
                  className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} flex-1 py-[7px] rounded-te-sm text-[13px] font-semibold select-none`}
                  style={{ color: active ? 'var(--te-ink)' : 'rgba(255,255,255,0.4)' }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="te-panel rounded-te-md px-4 py-8 text-center te-label">Loading…</div>
          ) : w ? (
            <div className="space-y-1.5">
              <StatCard label="Volume" value={`${Math.round(toDisplay(w.volume)).toLocaleString()} ${unit}`} sub={winLabel} />
              <StatCard label="Sets logged" value={w.sets.toLocaleString()} sub={winLabel} />
              <StatCard label="Active days" value={String(w.active_days)} sub={winLabel} />
            </div>
          ) : (
            <div className="te-panel rounded-te-md px-4 py-8 text-center te-label">No activity yet</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
