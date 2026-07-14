import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LinkIcon, MagnifyingGlassIcon, CheckIcon, ClockIcon, Cog6ToothIcon,
  ChevronRightIcon, ChevronLeftIcon, UserPlusIcon, CameraIcon, PhotoIcon,
} from '@heroicons/react/24/outline';
import { FireIcon } from '@heroicons/react/24/solid';
import Modal from './Modal';
import Avatar, { AVATAR_PRESETS, presetKeyOf } from './Avatar';
import type { Profile, LeaderboardRow, VolumeRow } from '../types';
import type { useFriends, ProfileLite } from '../hooks/useFriends';
import type { useProfile } from '../hooks/useProfile';
import type { WeightUnit } from '../hooks/useSettings';
import ReportBugSheet from './ReportBugSheet';

type FriendsApi = ReturnType<typeof useFriends>;
type ProfileApi = ReturnType<typeof useProfile>;

interface Props {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  inviteUrl: string;
  friends: FriendsApi;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  onOpenSettings: () => void;
  setAvatar: ProfileApi['setAvatar'];
  uploadAvatarFile: ProfileApi['uploadAvatarFile'];
  updateBio: ProfileApi['updateBio'];
}

const BIO_MAX = 160;

// ── Bio edit sheet ───────────────────────────────────────────────
function BioEditSheet({
  open, onClose, bio, updateBio,
}: {
  open: boolean;
  onClose: () => void;
  bio: string | null;
  updateBio: ProfileApi['updateBio'];
}) {
  const [value, setValue] = useState(bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setValue(bio ?? ''); setError(null); } }, [open, bio]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const err = await updateBio(value);
    if (err) { setError(err); setSaving(false); return; }
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bio">
      <div className="space-y-3">
        <textarea
          data-no-drag
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value.slice(0, BIO_MAX))}
          placeholder="Tell friends a bit about yourself…"
          rows={4}
          className="w-full rounded-2xl px-3.5 py-3 text-[15px] text-[#f4f1ec] placeholder-white/25 tracking-tight outline-none resize-none"
          style={{ background: '#0b0b0b', border: '1px solid var(--te-border)' }}
        />
        <div className="flex items-center justify-between px-0.5">
          <p className="te-label" style={{ color: error ? '#ff453a' : 'rgba(244,241,236,0.35)' }}>
            {error ?? `${value.length}/${BIO_MAX}`}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.99] disabled:opacity-50"
          style={{ height: 48, background: '#f4f1ec', color: '#0a0908' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

// ── Avatar picker sheet — 5 presets + upload your own ──────────
function AvatarPickerSheet({
  open, onClose, name, avatarUrl, setAvatar, uploadAvatarFile,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  avatarUrl: string | null;
  setAvatar: ProfileApi['setAvatar'];
  uploadAvatarFile: ProfileApi['uploadAvatarFile'];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedPreset = presetKeyOf(avatarUrl);

  async function choosePreset(key: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const err = await setAvatar(`preset:${key}`);
    if (err) setError(err);
    setSaving(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setSaving(true);
    setError(null);
    const err = await uploadAvatarFile(file);
    if (err) setError(err);
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Profile photo">
      <div className="space-y-5">
        <div className="flex justify-center">
          <Avatar name={name} avatarUrl={avatarUrl} size={88} />
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Choose an icon</p>
          <div className="grid grid-cols-5 gap-2.5">
            {AVATAR_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => choosePreset(p.key)}
                disabled={saving}
                className="relative flex items-center justify-center rounded-full active:opacity-70 transition-opacity disabled:opacity-40"
                style={{
                  aspectRatio: '1 / 1',
                  boxShadow: selectedPreset === p.key ? '0 0 0 2px #f4f1ec' : 'none',
                  borderRadius: '9999px',
                }}
              >
                <img src={p.src} alt="" className="w-full h-full rounded-full" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="te-panel w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
        >
          <PhotoIcon className="w-4 h-4 text-white/40 shrink-0" />
          <span className="flex-1 text-[14px] font-medium text-[#f4f1ec] tracking-tight">
            {saving ? 'Uploading…' : 'Upload photo'}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFile}
        />

        {error && <p className="text-[13px] px-0.5" style={{ color: '#ff453a' }}>{error}</p>}
      </div>
    </Modal>
  );
}

// ── Leaderboard rows — enlarged, more prominent ─────────────────
function StreakRows({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
      {rows.map((r, i) => (
        <div
          key={r.user_id}
          className="flex items-center px-4 py-[18px] gap-3.5"
          style={r.is_self ? { background: 'rgba(244,241,236,0.06)' } : undefined}
        >
          <span className="te-mono text-[14px] tabular-nums w-5 shrink-0" style={{ color: 'rgba(244,241,236,0.4)' }}>
            {i + 1}
          </span>
          <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">
              {r.display_name || r.username}{r.is_self && <span className="text-white/30 font-normal"> · you</span>}
            </p>
            <p className="te-label mt-1">
              {r.consistency_score === null ? '— consistency' : `${r.consistency_score}% consistent`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <FireIcon className="w-4 h-4" style={{ color: r.current_streak > 0 ? '#f4f1ec' : 'rgba(255,255,255,0.2)' }} />
            <span className="te-digit text-[22px] font-bold tabular-nums" style={{ color: r.current_streak > 0 ? '#f4f1ec' : 'rgba(255,255,255,0.3)' }}>
              {r.current_streak}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function VolumeRows({ rows, unit, toDisplay }: { rows: VolumeRow[]; unit: WeightUnit; toDisplay: (kg: number) => number }) {
  // Same people, resorted by volume — ranked like the streak tab, but no
  // medal coloring (motivational framing, not competitive).
  return (
    <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
      {rows.map((r, i) => (
        <div
          key={r.user_id}
          className="flex items-center px-4 py-[18px] gap-3.5"
          style={r.is_self ? { background: 'rgba(244,241,236,0.06)' } : undefined}
        >
          <span className="te-mono text-[14px] tabular-nums w-5 shrink-0" style={{ color: 'rgba(244,241,236,0.4)' }}>
            {i + 1}
          </span>
          <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">
              {r.display_name || r.username}{r.is_self && <span className="text-white/30 font-normal"> · you</span>}
            </p>
            <p className="te-label mt-1">last 30 days</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="te-digit text-[20px] font-bold tabular-nums text-[#f4f1ec]">
              {Math.round(toDisplay(r.volume)).toLocaleString()}
            </span>
            <span className="te-label">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({
  friendCount, unit, toDisplay, loadStreakBoard, loadVolumeBoard, reloadKey,
}: {
  friendCount: number;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  loadStreakBoard: () => Promise<LeaderboardRow[]>;
  loadVolumeBoard: () => Promise<VolumeRow[]>;
  reloadKey: number;
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
    <div>
      <p className="text-[16px] font-bold text-[#f4f1ec] tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>
        Leaderboard
      </p>

      {friendCount > 0 && (
        <div className="flex items-center gap-5 mb-3 px-0.5">
          {(['streak', 'volume'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="select-none active:opacity-60 transition-opacity"
            >
              <span
                className="text-[13px] font-bold tracking-wider uppercase"
                style={{ color: tab === t ? '#f4f1ec' : 'rgba(255,255,255,0.35)' }}
              >
                {t}
              </span>
            </button>
          ))}
        </div>
      )}

      {friendCount === 0 ? (
        <div className="te-panel rounded-2xl px-5 py-8 text-center">
          <FireIcon className="w-8 h-8 mx-auto mb-2.5" style={{ color: '#f4f1ec' }} />
          <p className="text-[16px] font-semibold text-[#f4f1ec] tracking-tight">Compete with friends</p>
          <p className="text-[13px] text-white/45 mt-1 leading-snug">
            Add a friend below to see who keeps the longest streak.
          </p>
        </div>
      ) : loading ? (
        <div className="te-panel rounded-2xl px-4 py-8 text-center te-label">Loading…</div>
      ) : tab === 'streak' ? (
        <StreakRows rows={streak} />
      ) : (
        <VolumeRows rows={volume} unit={unit} toDisplay={toDisplay} />
      )}
    </div>
  );
}

// ── Find friends + invite — merged into a single card ───────────
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
      return <span className="te-label shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>Friends</span>;
    }
    if (rel === 'requested') {
      return <span className="te-label shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>Requested</span>;
    }
    if (rel === 'incoming') {
      const fid = incomingFor(id);
      return (
        <button
          onClick={() => fid && acceptRequest(fid)}
          className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
          style={{ background: '#f4f1ec', color: '#0a0908' }}
        >
          Accept
        </button>
      );
    }
    return (
      <button
        onClick={() => sendRequest(id)}
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold"
        style={{ background: 'rgba(255,255,255,0.08)', color: '#f4f1ec' }}
      >
        <UserPlusIcon className="w-3.5 h-3.5" /> Add
      </button>
    );
  }

  const showResults = query.trim().length >= 2;

  return (
    <div className="space-y-4">
      {/* Find friends + invite — one merged card */}
      <div>
        <p className="te-label mb-2 px-0.5">Find friends</p>
        <div className="te-panel rounded-2xl overflow-hidden">
          <div className="px-4 pt-4 pb-3.5">
            <div
              className="flex items-center rounded-2xl px-3.5 gap-2"
              style={{ background: '#0b0b0b', border: '1px solid var(--te-border)', height: 46 }}
            >
              <MagnifyingGlassIcon className="w-4 h-4 text-white/30 shrink-0" />
              <input
                data-no-drag
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent outline-none text-[15px] text-[#f4f1ec] placeholder-white/25 tracking-tight"
              />
            </div>
          </div>

          <div className="border-t border-white/[0.05]">
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
                        <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight truncate">
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
                <LinkIcon className="w-4 h-4 text-white/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Invite link</p>
                  <p className="te-label mt-0.5 truncate">{inviteUrl.replace(/^https?:\/\//, '')}</p>
                </div>
                <span className="te-label shrink-0" style={{ color: copied ? '#30d158' : '#f4f1ec' }}>
                  {copied ? 'Copied' : 'Share'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pending inbox */}
      {(incoming.length > 0 || outgoing.length > 0) && (
        <div>
          <p className="te-label mb-2 px-0.5">Requests</p>
          <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
            {incoming.map(p => (
              <div key={p.friendshipId} className="flex items-center px-4 py-3 gap-3">
                <Avatar name={p.display_name || p.username} avatarUrl={p.avatar_url} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight truncate">
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
                    <CheckIcon className="w-3.5 h-3.5" style={{ color: '#0a0908' }} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => declineRequest(p.friendshipId)}
                    className="te-label px-2 py-1.5"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
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
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight truncate">
                    {p.display_name || p.username}
                  </p>
                  <p className="te-label mt-0.5 truncate">@{p.username}</p>
                </div>
                <span className="te-label shrink-0 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
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

// ── Full-screen profile page ────────────────────────────────────
export default function ProfilePage({
  open, onClose, profile, inviteUrl, friends, unit, toDisplay, onOpenSettings,
  setAvatar, uploadAvatarFile, updateBio,
}: Props) {
  const name = profile?.display_name || profile?.username || 'You';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dx, setDx] = useState(0);
  const [dragSnapping, setDragSnapping] = useState(false);
  const dragStartX = useRef(0);
  const dragEligible = useRef(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setDismissing(false);
    } else if (visible && !dismissing) {
      setDismissing(true);
      setTimeout(() => { setVisible(false); setDismissing(false); }, 300);
    }
  }, [open]);

  // Swipe right from the left edge to go back — mirrors Modal's onBack gesture.
  useEffect(() => {
    if (!visible) return;
    function onTouchStart(e: TouchEvent) {
      dragStartX.current = e.touches[0].clientX;
      dragEligible.current = dragStartX.current < 28;
    }
    function onTouchMove(e: TouchEvent) {
      if (!dragEligible.current) return;
      const delta = e.touches[0].clientX - dragStartX.current;
      if (delta > 0) setDx(Math.min(delta, window.innerWidth));
    }
    function onTouchEnd(e: TouchEvent) {
      if (!dragEligible.current) return;
      const delta = e.changedTouches[0].clientX - dragStartX.current;
      dragEligible.current = false;
      setDragSnapping(true);
      if (delta > 90) onClose();
      setDx(0);
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const dragging = dx > 0;

  return (
    <div
      className={dismissing || dragging ? '' : 'animate-page-push-in'}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: '#0a0908',
        display: 'flex', flexDirection: 'column',
        transform: dismissing ? 'translateX(100%)' : `translateX(${dx}px)`,
        transition: dismissing ? 'transform 0.3s cubic-bezier(0.32,0.72,0,1)'
          : dragSnapping ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none',
      }}
      onTransitionEnd={() => setDragSnapping(false)}
    >
      {/* Identity band — top quarter of the page */}
      <div
        className="shrink-0 relative flex flex-col items-center justify-center gap-3"
        style={{ height: '25vh', minHeight: 200, paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          onClick={onClose}
          className="absolute flex items-center justify-center active:opacity-60 transition-opacity"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)', left: 14, width: 32, height: 32 }}
          aria-label="Back"
        >
          <ChevronLeftIcon className="w-5 h-5 text-white/60" />
        </button>

        {/* Report a bug — mirrors the back button, top-right */}
        <button
          onClick={() => setReportOpen(true)}
          className="absolute flex items-center gap-1.5 rounded-full active:opacity-80 transition-opacity"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14, height: 32, padding: '0 12px 0 10px',
            background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
            boxShadow: '0 3px 12px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
          aria-label="Report a bug"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2l1.5 2.5M16 2l-1.5 2.5" />
            <rect x="7" y="6" width="10" height="12" rx="5" />
            <path d="M12 6v12M3 10h4M17 10h4M3 15h4M17 15h4M4 6l3 2M20 6l-3 2M4 19l3-2M20 19l-3-2" />
          </svg>
          <span className="text-[11px] font-bold text-white tracking-tight">Bug</span>
        </button>

        <button
          onClick={() => setPickerOpen(true)}
          className="relative shrink-0 active:opacity-70 transition-opacity"
          aria-label="Change profile photo"
        >
          <Avatar name={name} avatarUrl={profile?.avatar_url} size={76} />
          <span
            className="absolute flex items-center justify-center rounded-full"
            style={{ width: 24, height: 24, right: -2, bottom: -2, background: '#f4f1ec', border: '2.5px solid #0a0908' }}
          >
            <CameraIcon className="w-3.5 h-3.5" style={{ color: '#0a0908' }} strokeWidth={1.5} />
          </span>
        </button>

        <div className="text-center">
          <p className="text-[20px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {name}
          </p>
          {profile?.username && <p className="te-label mt-1">@{profile.username}</p>}
        </div>
      </div>

      <AvatarPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        name={name}
        avatarUrl={profile?.avatar_url ?? null}
        setAvatar={setAvatar}
        uploadAvatarFile={uploadAvatarFile}
      />

      <ReportBugSheet open={reportOpen} onClose={() => setReportOpen(false)} context="Profile" />

      {/* Remaining three quarters — leaderboard-first, scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="max-w-lg mx-auto pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] space-y-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <button
            onClick={() => setBioOpen(true)}
            className="w-full text-left active:opacity-60 transition-opacity"
          >
            {profile?.bio ? (
              <p className="text-[14px] text-white/60 leading-snug">{profile.bio}</p>
            ) : (
              <p className="te-label" style={{ color: 'rgba(244,241,236,0.7)' }}>+ Add bio</p>
            )}
          </button>

          <BioEditSheet
            open={bioOpen}
            onClose={() => setBioOpen(false)}
            bio={profile?.bio ?? null}
            updateBio={updateBio}
          />

          <Leaderboard
            friendCount={friends.friendCount}
            unit={unit}
            toDisplay={toDisplay}
            loadStreakBoard={friends.loadStreakBoard}
            loadVolumeBoard={friends.loadVolumeBoard}
            reloadKey={friends.friendCount}
          />

          <FriendsSection friends={friends} inviteUrl={inviteUrl} />

          {/* Settings entry — opens the existing schedule/settings sheet */}
          <button
            onClick={onOpenSettings}
            className="te-panel w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:bg-white/[0.04] transition-colors text-left"
          >
            <Cog6ToothIcon className="w-4 h-4 text-white/40 shrink-0" />
            <span className="flex-1 text-[14px] font-medium text-[#f4f1ec] tracking-tight">Settings & schedule</span>
            <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
