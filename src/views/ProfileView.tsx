// Profile — the fourth tab. Identity (avatar, bio) sits above the whole
// social layer: competitions, badge case, leaderboard and friends, with
// settings at the foot. Reached by its own tab, whose icon is the user's
// avatar, so nothing here is hidden behind a gesture or a corner button.
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LinkIcon, MagnifyingGlassIcon, CheckIcon, ClockIcon, UserPlusIcon,
  Cog6ToothIcon, ChevronRightIcon, CameraIcon, PhotoIcon,
} from '@heroicons/react/24/outline';
import { FireIcon } from '@heroicons/react/24/solid';
import Avatar, { AVATAR_PRESETS, presetKeyOf } from '../components/Avatar';
import Modal from '../components/Modal';
import ReportBugSheet from '../components/ReportBugSheet';
import RoutinesSection from '../components/Routines';
import { CompetitionsSection, BadgeShelf } from '../components/Competitions';
import FriendProfile, { type FriendProfileTarget } from '../components/FriendProfile';
import { ToggleButton } from '../components/SheetControls';
import type { Profile, LeaderboardRow, VolumeRow, Badge, Routine, ScheduleDay, Exercise } from '../types';
import type { useFriends, ProfileLite } from '../hooks/useFriends';
import type { useCompetitions } from '../hooks/useCompetitions';
import type { useFistBumps } from '../hooks/useFistBumps';
import type { useProfile } from '../hooks/useProfile';
import type { WeightUnit, WeekStartDay } from '../hooks/useSettings';

type FriendsApi = ReturnType<typeof useFriends>;
type CompetitionsApi = ReturnType<typeof useCompetitions>;
type FistBumpsApi = ReturnType<typeof useFistBumps>;
type ProfileApi = ReturnType<typeof useProfile>;

interface Props {
  profile: Profile | null;
  friends: FriendsApi;
  competitions: CompetitionsApi;
  fistBumps: FistBumpsApi;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  inviteUrl: string;
  routines: Routine[];
  schedule: ScheduleDay[];
  exercises: Exercise[];
  onAddRoutine: (name: string, exercise_ids: string[]) => Routine | Promise<Routine>;
  onUpdateRoutine: (id: string, name: string, exercise_ids: string[]) => void;
  onDeleteRoutine: (id: string) => void;
  onAssignDay: (day_of_week: number, routine_id: string | null) => void;
  onCreateExercise: () => void;
  weekStartDay: WeekStartDay;
  pendingEditorOpen: boolean;
  onPendingEditorConsumed: () => void;
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
          className="w-full rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none resize-none"
          style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
        />
        <div className="flex items-center justify-between px-0.5">
          <p className="te-label" style={{ color: error ? 'var(--te-danger)' : 'var(--te-text-4)' }}>
            {error ?? `${value.length}/${BIO_MAX}`}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="te-white-btn w-full rounded-te-md font-semibold text-[15px] disabled:opacity-50"
          style={{ height: 48 }}
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
          className="te-panel w-full flex items-center gap-3 px-4 py-3.5 rounded-te-md active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
        >
          <PhotoIcon className="w-4 h-4 te-t4 shrink-0" />
          <span className="flex-1 text-[15px] font-medium te-t1 tracking-tight">
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

        {error && <p className="text-[13px] px-0.5" style={{ color: 'var(--te-danger)' }}>{error}</p>}
      </div>
    </Modal>
  );
}

// ── Leaderboard rows ────────────────────────────────────────────
function StreakRows({ rows, onSelect }: { rows: LeaderboardRow[]; onSelect: (r: FriendProfileTarget) => void }) {
  return (
    <div className="te-panel rounded-te-md overflow-hidden divide-y divide-[color:var(--te-border)]">
      {rows.map((r, i) => (
        <button
          type="button"
          key={r.user_id}
          disabled={r.is_self}
          onClick={() => onSelect(r)}
          className="w-full text-left flex items-center px-4 py-[18px] gap-3.5 enabled:active:bg-[color:var(--te-fill-subtle)] transition-colors"
          style={r.is_self ? { background: 'var(--te-fill-subtle)' } : undefined}
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
              longest {r.longest_streak}d
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <FireIcon className="w-4 h-4" style={{ color: r.current_streak > 0 ? 'var(--te-danger)' : 'var(--te-text-4)' }} />
            <span className="te-digit text-[20px] font-bold tabular-nums" style={{ color: r.current_streak > 0 ? 'var(--te-text-1)' : 'var(--te-text-4)' }}>
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
    <div className="te-panel rounded-te-md overflow-hidden divide-y divide-[color:var(--te-border)]">
      {rows.map((r, i) => (
        <button
          type="button"
          key={r.user_id}
          disabled={r.is_self}
          onClick={() => onSelect(r)}
          className="w-full text-left flex items-center px-4 py-[18px] gap-3.5 enabled:active:bg-[color:var(--te-fill-subtle)] transition-colors"
          style={r.is_self ? { background: 'var(--te-fill-subtle)' } : undefined}
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
    <div>
      {/* Same shape as the Competitions section above: a bare section header
          (no boxed container, no heavy shadow) with the content in flat panels,
          so the two read as one family and align to the same edge margin. */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[17px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Leaderboard
        </p>
        <span className="te-label" style={{ color: 'var(--te-text-3)' }}>Last 30 days</span>
      </div>

      {friendCount > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          {(['streak', 'volume'] as const).map(t => (
            <ToggleButton key={t} active={tab === t} onClick={() => setTab(t)} label={t} heightPx={38} />
          ))}
        </div>
      )}

      {friendCount === 0 ? (
        <div className="te-panel rounded-te-md px-5 py-8 text-center">
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearchError(null); setSearching(false); return; }
    setSearching(true);
    let alive = true;
    const h = setTimeout(async () => {
      const r = await searchUsers(term);
      if (!alive) return;
      setResults(r.users);
      setSearchError(r.error ?? null);
      setSearching(false);
    }, 300);
    return () => { alive = false; clearTimeout(h); };
  }, [query, searchUsers]);

  const incomingFor = useCallback(
    (id: string) => incoming.find(p => p.userId === id)?.friendshipId,
    [incoming],
  );

  async function share() {
    if (!inviteUrl) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Add me on Pushed', url: inviteUrl }); return; } catch { /* fall through */ }
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
          {/* Search sits as a full-width row — no inset box — so it reads as one
              list with the invite-link / results rows below it, all sharing the
              same px-4 icon column. */}
          <div className="flex items-center gap-3 px-4" style={{ height: 52 }}>
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

          <div className="border-t border-[color:var(--te-border)]">
            {showResults ? (
              searching ? (
                <p className="te-label px-4 py-3.5">Searching…</p>
              ) : searchError ? (
                // A failed query and an empty result set look identical
                // otherwise, which is how "search finds nobody" hides a
                // server-side problem.
                <p className="te-label px-4 py-3.5" style={{ color: 'var(--te-danger)' }}>
                  Search failed: {searchError}
                </p>
              ) : results.length === 0 ? (
                <p className="te-label px-4 py-3.5">No users found.</p>
              ) : (
                <div className="divide-y divide-[color:var(--te-border)]">
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

// ── Profile tab ─────────────────────────────────────────────────
export default function ProfileView({
  profile, friends, competitions, fistBumps, unit, toDisplay, inviteUrl,
  routines, schedule, exercises,
  onAddRoutine, onUpdateRoutine, onDeleteRoutine, onAssignDay, onCreateExercise,
  weekStartDay, pendingEditorOpen, onPendingEditorConsumed,
  onOpenSettings, setAvatar, uploadAvatarFile, updateBio,
}: Props) {
  const name = profile?.display_name || profile?.username || 'You';
  const [badges, setBadges] = useState<Badge[]>([]);
  const [friendTarget, setFriendTarget] = useState<FriendProfileTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Own badge case — refreshed when a competition completes (list changes).
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    competitions.loadBadges(profile.id).then(b => { if (alive) setBadges(b); });
    return () => { alive = false; };
  }, [profile?.id, competitions, competitions.competitions]);

  return (
    <div className="space-y-6">
      {/* Identity band */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => setPickerOpen(true)}
          className="relative shrink-0 active:opacity-70 transition-opacity"
          aria-label="Change profile photo"
        >
          <Avatar name={name} avatarUrl={profile?.avatar_url} size={88} />
          {/* Dark chip, not a light one: a near-white disc here was the only
              light-on-dark surface on the page and read as a sticker on top of
              the avatar. The cut-out ring is the page background, so the badge
              stays legible over a photo without a bright fill. */}
          <span
            className="absolute flex items-center justify-center rounded-full"
            style={{
              width: 24, height: 24, right: -2, bottom: -2,
              background: 'var(--te-surface-3)',
              border: '1px solid var(--te-border-strong)',
              // The page background is a Tailwind colour (te.bg), not a CSS
              // variable, so it has to be written out here.
              boxShadow: '0 0 0 2.5px #010101',
            }}
          >
            <CameraIcon className="w-3.5 h-3.5" style={{ color: 'var(--te-text-1)' }} strokeWidth={1.5} />
          </span>
        </button>

        <div className="text-center">
          <p className="text-[20px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {name}
          </p>
          {profile?.username && <p className="te-label mt-1">@{profile.username}</p>}
        </div>

        <button
          onClick={() => setBioOpen(true)}
          className="text-center active:opacity-60 transition-opacity max-w-[300px]"
        >
          {profile?.bio ? (
            <p className="text-[15px] te-t2 leading-snug">{profile.bio}</p>
          ) : (
            <p className="te-label" style={{ color: 'var(--te-text-2)' }}>+ Add bio</p>
          )}
        </button>
      </div>

      <CompetitionsSection comps={competitions} friendsList={friends.friendsList} unit={unit} toDisplay={toDisplay} />

      <BadgeShelf badges={badges} comps={competitions} unit={unit} toDisplay={toDisplay} />

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

      <RoutinesSection
        routines={routines}
        schedule={schedule}
        exercises={exercises}
        onAddRoutine={onAddRoutine}
        onUpdateRoutine={onUpdateRoutine}
        onDeleteRoutine={onDeleteRoutine}
        onAssignDay={onAssignDay}
        onCreateExercise={onCreateExercise}
        unit={unit}
        toDisplay={toDisplay}
        weekStartDay={weekStartDay}
        pendingEditorOpen={pendingEditorOpen}
        onPendingEditorConsumed={onPendingEditorConsumed}
      />

      {/* Utility rows */}
      <div className="te-panel rounded-te-md overflow-hidden divide-y divide-[color:var(--te-border)]">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
        >
          <Cog6ToothIcon className="w-4 h-4 te-t4 shrink-0" />
          <span className="flex-1 text-[15px] font-medium te-t1 tracking-tight">Settings</span>
          <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
        </button>
        <button
          onClick={() => setReportOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--te-text-4)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M8 2l1.5 2.5M16 2l-1.5 2.5" />
            <rect x="7" y="6" width="10" height="12" rx="5" />
            <path d="M12 6v12M3 10h4M17 10h4M3 15h4M17 15h4M4 6l3 2M20 6l-3 2M4 19l3-2M20 19l-3-2" />
          </svg>
          <span className="flex-1 text-[15px] font-medium te-t1 tracking-tight">Report a bug</span>
          <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
        </button>
      </div>

      {/* Legal */}
      <div className="flex items-center justify-center gap-4">
        <a href="/privacy.html" target="_blank" rel="noopener" className="te-label active:opacity-60 transition-opacity" style={{ color: 'var(--te-text-4)' }}>
          Privacy Policy
        </a>
        <span className="te-label" style={{ color: 'var(--te-text-4)' }}>·</span>
        <a href="/terms.html" target="_blank" rel="noopener" className="te-label active:opacity-60 transition-opacity" style={{ color: 'var(--te-text-4)' }}>
          Terms of Service
        </a>
      </div>

      <AvatarPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        name={name}
        avatarUrl={profile?.avatar_url ?? null}
        setAvatar={setAvatar}
        uploadAvatarFile={uploadAvatarFile}
      />
      <BioEditSheet
        open={bioOpen}
        onClose={() => setBioOpen(false)}
        bio={profile?.bio ?? null}
        updateBio={updateBio}
      />
      <ReportBugSheet open={reportOpen} onClose={() => setReportOpen(false)} context="Profile" />

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
