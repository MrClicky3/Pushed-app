// Compete — the social layer's home tab: competitions, badge case,
// leaderboard, and friends. These sections used to live buried inside the
// Profile page; Profile now keeps identity + settings only.
import { useState, useEffect, useCallback } from 'react';
import {
  LinkIcon, MagnifyingGlassIcon, CheckIcon, ClockIcon, UserPlusIcon,
} from '@heroicons/react/24/outline';
import { FireIcon } from '@heroicons/react/24/solid';
import { Trophy } from 'lucide-react';
import Avatar from '../components/Avatar';
import { CompetitionsSection, BadgeShelf } from '../components/Competitions';
import FriendProfile, { type FriendProfileTarget } from '../components/FriendProfile';
import { ToggleButton } from '../components/SheetControls';
import type { Profile, LeaderboardRow, VolumeRow, Badge } from '../types';
import type { useFriends, ProfileLite } from '../hooks/useFriends';
import type { useCompetitions } from '../hooks/useCompetitions';
import type { useFistBumps } from '../hooks/useFistBumps';
import type { WeightUnit } from '../hooks/useSettings';

type FriendsApi = ReturnType<typeof useFriends>;
type CompetitionsApi = ReturnType<typeof useCompetitions>;
type FistBumpsApi = ReturnType<typeof useFistBumps>;

interface Props {
  profile: Profile | null;
  friends: FriendsApi;
  competitions: CompetitionsApi;
  fistBumps: FistBumpsApi;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  inviteUrl: string;
}

// ── Leaderboard rows ────────────────────────────────────────────
function StreakRows({ rows, onSelect }: { rows: LeaderboardRow[]; onSelect: (r: FriendProfileTarget) => void }) {
  return (
    <div className="-mx-4 border-t border-[color:var(--te-border)] divide-y divide-white/[0.05]">
      {rows.map((r, i) => (
        <button
          type="button"
          key={r.user_id}
          disabled={r.is_self}
          onClick={() => onSelect(r)}
          className="w-full text-left flex items-center px-4 py-[18px] gap-3.5 enabled:active:bg-white/[0.03] transition-colors"
          style={r.is_self ? { background: 'rgba(244,241,236,0.06)' } : undefined}
        >
          <span className="te-mono text-[15px] tabular-nums w-5 shrink-0" style={{ color: 'var(--te-text-4)' }}>
            {i + 1}
          </span>
          <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">
              {r.display_name || r.username}{r.is_self && <span className="te-t4 font-normal"> · you</span>}
            </p>
            <p className="te-label mt-1">
              {r.consistency_score === null ? '— consistency' : `${r.consistency_score}% consistent`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <FireIcon className="w-4 h-4" style={{ color: r.current_streak > 0 ? '#f4f1ec' : 'rgba(255,255,255,0.2)' }} />
            <span className="te-digit text-[20px] font-bold tabular-nums" style={{ color: r.current_streak > 0 ? '#f4f1ec' : 'rgba(255,255,255,0.3)' }}>
              {r.current_streak}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function VolumeRows({ rows, unit, toDisplay, onSelect }: { rows: VolumeRow[]; unit: WeightUnit; toDisplay: (kg: number) => number; onSelect: (r: FriendProfileTarget) => void }) {
  return (
    <div className="-mx-4 border-t border-[color:var(--te-border)] divide-y divide-white/[0.05]">
      {rows.map((r, i) => (
        <button
          type="button"
          key={r.user_id}
          disabled={r.is_self}
          onClick={() => onSelect(r)}
          className="w-full text-left flex items-center px-4 py-[18px] gap-3.5 enabled:active:bg-white/[0.03] transition-colors"
          style={r.is_self ? { background: 'rgba(244,241,236,0.06)' } : undefined}
        >
          <span className="te-mono text-[15px] tabular-nums w-5 shrink-0" style={{ color: 'var(--te-text-4)' }}>
            {i + 1}
          </span>
          <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">
              {r.display_name || r.username}{r.is_self && <span className="te-t4 font-normal"> · you</span>}
            </p>
            <p className="te-label mt-1">last 30 days</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="te-digit text-[20px] font-bold tabular-nums te-t1">
              {Math.round(toDisplay(r.volume)).toLocaleString()}
            </span>
            <span className="te-label">{unit}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Leaderboard({
  friendCount, unit, toDisplay, loadStreakBoard, loadVolumeBoard, reloadKey, onSelect,
}: {
  friendCount: number;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  loadStreakBoard: () => Promise<LeaderboardRow[]>;
  loadVolumeBoard: () => Promise<VolumeRow[]>;
  reloadKey: number;
  onSelect: (r: FriendProfileTarget) => void;
}) {
  const [tab, setTab] = useState<'streak' | 'volume'>('streak');
  const [streak, setStreak] = useState<LeaderboardRow[]>([]);
  const [volume, setVolume] = useState<VolumeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([loadStreakBoard(), loadVolumeBoard()]).then(([s, v]) => {
      if (!alive) return;
      setStreak(s); setVolume(v); setLoading(false);
    });
    return () => { alive = false; };
  }, [loadStreakBoard, loadVolumeBoard, reloadKey]);

  return (
    <div
      className="rounded-te-lg p-4 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, var(--te-fill-subtle) 0%, var(--te-fill-subtle) 100%), var(--te-surface-1)',
        border: '1px solid var(--te-border)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex items-center gap-2.5 mb-3.5 px-0.5">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 30, height: 30, background: 'color-mix(in srgb, var(--te-gold) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--te-gold) 28%, transparent)' }}
        >
          <Trophy className="w-4 h-4" style={{ color: 'var(--te-gold)' }} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="text-[17px] font-bold te-t1 tracking-tight leading-none" style={{ letterSpacing: '-0.03em' }}>
            Leaderboard
          </p>
          <p className="te-label mt-1">Streaks & 30-day volume</p>
        </div>
      </div>

      {friendCount > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {(['streak', 'volume'] as const).map(t => (
            <ToggleButton key={t} active={tab === t} onClick={() => setTab(t)} label={t} heightPx={38} />
          ))}
        </div>
      )}

      {friendCount === 0 ? (
        <div className="te-panel rounded-te-md px-5 py-8 text-center">
          <FireIcon className="w-8 h-8 mx-auto mb-2.5" style={{ color: 'var(--te-text-1)' }} />
          <p className="text-[17px] font-semibold te-t1 tracking-tight">Compete with friends</p>
          <p className="text-[13px] te-t3 mt-1 leading-snug">
            Add a friend below to see who keeps the longest streak.
          </p>
        </div>
      ) : loading ? (
        <div className="te-panel rounded-te-md px-4 py-8 text-center te-label">Loading…</div>
      ) : tab === 'streak' ? (
        <StreakRows rows={streak} onSelect={onSelect} />
      ) : (
        <VolumeRows rows={volume} unit={unit} toDisplay={toDisplay} onSelect={onSelect} />
      )}
    </div>
  );
}

// ── Find friends + invite ───────────────────────────────────────
function FriendsSection({ friends, inviteUrl }: { friends: FriendsApi; inviteUrl: string }) {
  const { incoming, outgoing, relationFor, searchUsers, sendRequest, acceptRequest, declineRequest } = friends;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      const r = await searchUsers(term);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => clearTimeout(h);
  }, [query, searchUsers]);

  const incomingFor = useCallback(
    (id: string) => incoming.find(p => p.userId === id)?.friendshipId,
    [incoming],
  );

  async function share() {
    if (!inviteUrl) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Add me on Overload', url: inviteUrl }); return; } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  function ActionButton({ id }: { id: string }) {
    const rel = relationFor(id);
    if (rel === 'friends') {
      return <span className="te-label shrink-0" style={{ color: 'var(--te-text-4)' }}>Friends</span>;
    }
    if (rel === 'requested') {
      return <span className="te-label shrink-0" style={{ color: 'var(--te-text-4)' }}>Requested</span>;
    }
    if (rel === 'incoming') {
      const fid = incomingFor(id);
      return (
        <button
          onClick={() => fid && acceptRequest(fid)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold"
          style={{ background: '#f4f1ec', color: 'var(--te-ink)' }}
        >
          Accept
        </button>
      );
    }
    return (
      <button
        onClick={() => sendRequest(id)}
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-semibold"
        style={{ background: 'var(--te-border-strong)', color: 'var(--te-text-1)' }}
      >
        <UserPlusIcon className="w-3.5 h-3.5" /> Add
      </button>
    );
  }

  const showResults = query.trim().length >= 2;

  return (
    <div className="space-y-4">
      <div>
        <p className="te-label mb-2 px-0.5">Find friends</p>
        <div className="te-panel rounded-te-md overflow-hidden">
          <div className="px-4 pt-4 pb-3.5">
            <div
              className="flex items-center rounded-te-md px-3.5 gap-2"
              style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)', height: 46 }}
            >
              <MagnifyingGlassIcon className="w-4 h-4 te-t4 shrink-0" />
              <input
                data-no-drag
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent outline-none text-[15px] te-t1 placeholder-white/25 tracking-tight"
              />
            </div>
          </div>

          <div className="border-t border-[color:var(--te-border)]">
            {showResults ? (
              searching ? (
                <p className="te-label px-4 py-3.5">Searching…</p>
              ) : results.length === 0 ? (
                <p className="te-label px-4 py-3.5">No users found.</p>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {results.map(u => (
                    <div key={u.id} className="flex items-center px-4 py-3 gap-3">
                      <Avatar name={u.display_name || u.username} avatarUrl={u.avatar_url} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium te-t1 tracking-tight truncate">
                          {u.display_name || u.username}
                        </p>
                        <p className="te-label mt-0.5 truncate">@{u.username}</p>
                      </div>
                      <ActionButton id={u.id} />
                    </div>
                  ))}
                </div>
              )
            ) : (
              <button
                onClick={share}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
              >
                <LinkIcon className="w-4 h-4 te-t4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium te-t1 tracking-tight">Invite link</p>
                  <p className="te-label mt-0.5 truncate">{inviteUrl.replace(/^https?:\/\//, '')}</p>
                </div>
                <span className="te-label shrink-0" style={{ color: copied ? 'var(--te-success)' : '#f4f1ec' }}>
                  {copied ? 'Copied' : 'Share'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div>
          <p className="te-label mb-2 px-0.5">Requests</p>
          <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">
            {incoming.map(p => (
              <div key={p.friendshipId} className="flex items-center px-4 py-3 gap-3">
                <Avatar name={p.display_name || p.username} avatarUrl={p.avatar_url} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium te-t1 tracking-tight truncate">
                    {p.display_name || p.username}
                  </p>
                  <p className="te-label mt-0.5 truncate">@{p.username}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptRequest(p.friendshipId)}
                    className="p-1.5 rounded-full"
                    style={{ background: '#f4f1ec' }}
                  >
                    <CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--te-ink)' }} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => declineRequest(p.friendshipId)}
                    className="te-label px-2 py-1.5"
                    style={{ color: 'var(--te-text-4)' }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
            {outgoing.map(p => (
              <div key={p.friendshipId} className="flex items-center px-4 py-3 gap-3">
                <Avatar name={p.display_name || p.username} avatarUrl={p.avatar_url} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium te-t1 tracking-tight truncate">
                    {p.display_name || p.username}
                  </p>
                  <p className="te-label mt-0.5 truncate">@{p.username}</p>
                </div>
                <span className="te-label shrink-0 flex items-center gap-1" style={{ color: 'var(--te-text-4)' }}>
                  <ClockIcon className="w-3.5 h-3.5" /> Waiting
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compete tab ─────────────────────────────────────────────────
export default function CompeteView({ profile, friends, competitions, fistBumps, unit, toDisplay, inviteUrl }: Props) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [friendTarget, setFriendTarget] = useState<FriendProfileTarget | null>(null);

  // Own badge case — refreshed when a competition completes (list changes).
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    competitions.loadBadges(profile.id).then(b => { if (alive) setBadges(b); });
    return () => { alive = false; };
  }, [profile?.id, competitions, competitions.competitions]);

  return (
    <div className="space-y-6">
      <CompetitionsSection comps={competitions} friendsList={friends.friendsList} />

      <BadgeShelf badges={badges} comps={competitions} />

      <Leaderboard
        friendCount={friends.friendCount}
        unit={unit}
        toDisplay={toDisplay}
        loadStreakBoard={friends.loadStreakBoard}
        loadVolumeBoard={friends.loadVolumeBoard}
        reloadKey={friends.friendCount}
        onSelect={setFriendTarget}
      />

      <FriendsSection friends={friends} inviteUrl={inviteUrl} />

      <FriendProfile
        open={friendTarget !== null}
        onClose={() => setFriendTarget(null)}
        target={friendTarget}
        loadFriendProfile={friends.loadFriendProfile}
        loadFriendActivity={friends.loadFriendActivity}
        unit={unit}
        toDisplay={toDisplay}
        fistBumps={fistBumps}
      />
    </div>
  );
}
