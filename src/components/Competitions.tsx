// Competitions — time-boxed challenges between friends. Two tracks:
// consistency (% of your own scheduled days done) and volume (% change vs a
// frozen baseline). Standings are always fetched live from the server; the
// client never computes or caches a rank. See supabase/migrations for rules.
import { useState, useEffect, useCallback } from 'react';
import { PlusIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Trophy, Medal, Award, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import { ToggleButton } from './SheetControls';
import { feedback } from '../lib/feedback';
import type { ProfileLite } from '../hooks/useFriends';
import type { useCompetitions } from '../hooks/useCompetitions';
import type {
  CompetitionSummary, CompetitionStanding, Badge, BadgeTier, CompetitionTrack,
} from '../types';

type CompetitionsApi = ReturnType<typeof useCompetitions>;

const TIER_META: Record<BadgeTier, { label: string; color: string; Icon: typeof Medal }> = {
  gold:     { label: 'Gold',     color: '#e8c15a', Icon: Trophy },
  silver:   { label: 'Silver',   color: '#c6c8d0', Icon: Medal },
  bronze:   { label: 'Bronze',   color: '#cd8b5c', Icon: Medal },
  finisher: { label: 'Finisher', color: '#7fd57f', Icon: Award },
};

// ── time helpers (durations — timezone-independent) ─────────────
function fmtLeft(target: string, prefix: string): string {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return 'ending…';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d >= 1) return `${prefix} ${d}d ${h}h`;
  if (h >= 1) return `${prefix} ${h}h ${m}m`;
  return `${prefix} ${m}m`;
}

// A participant's own headline number — never a raw volume comparison.
function scoreText(track: CompetitionTrack, s: CompetitionStanding): { text: string; color: string } {
  if (track === 'volume') {
    if (s.delta === null || s.delta === undefined) return { text: '—', color: 'rgba(255,255,255,0.35)' };
    const sign = s.delta > 0 ? '+' : '';
    return { text: `${sign}${s.delta}%`, color: s.delta >= 0 ? '#7fd57f' : '#e8a657' };
  }
  if (s.score === null || s.score === undefined) return { text: '—', color: 'rgba(255,255,255,0.35)' };
  return { text: `${Math.round(s.score)}%`, color: '#f4f1ec' };
}

function trackLabel(t: CompetitionTrack): string {
  return t === 'volume' ? 'Volume' : 'Consistency';
}

// ── Badge shelf (profile) ───────────────────────────────────────
// Placeholder icons — will be swapped for Figma exports.
export function BadgeShelf({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div>
      <p className="text-[16px] font-bold text-[#f4f1ec] tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>
        Badges
      </p>
      <div className="te-panel rounded-2xl px-4 py-4">
        <div className="flex flex-wrap gap-4">
          {badges.map(b => {
            const meta = TIER_META[b.tier];
            const Icon = meta.Icon;
            return (
              <div key={b.id} className="flex flex-col items-center gap-1.5 w-16">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.05)', border: `1px solid ${meta.color}55` }}
                >
                  <Icon className="w-6 h-6" style={{ color: meta.color }} strokeWidth={1.75} />
                </div>
                <span className="te-label text-center leading-tight">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Standings list (shared by active detail + results) ──────────
function StandingsList({ track, rows }: { track: CompetitionTrack; rows: CompetitionStanding[] }) {
  return (
    <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
      {rows.map((r, i) => {
        const sc = scoreText(track, r);
        const rank = r.rank ?? i + 1;
        const medal: BadgeTier | null = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
        return (
          <div
            key={r.user_id}
            className="flex items-center px-4 py-[16px] gap-3.5"
            style={r.is_self ? { background: 'rgba(244,241,236,0.06)' } : undefined}
          >
            <span className="te-mono text-[14px] tabular-nums w-5 shrink-0" style={{ color: medal ? TIER_META[medal].color : 'rgba(244,241,236,0.4)' }}>
              {rank}
            </span>
            <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">
                {r.display_name || r.username}{r.is_self && <span className="text-white/30 font-normal"> · you</span>}
              </p>
              <p className="te-label mt-1">
                {track === 'volume' ? 'vs baseline' : `${r.scored_days} day${r.scored_days === 1 ? '' : 's'} done`}
              </p>
            </div>
            <span className="te-digit text-[20px] font-bold tabular-nums shrink-0" style={{ color: sc.color }}>
              {sc.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail / results sheet ──────────────────────────────────────
function CompetitionSheet({
  open, comp, comps, onClose, onRematch,
}: {
  open: boolean;
  comp: CompetitionSummary | null;
  comps: CompetitionsApi;
  onClose: () => void;
  onRematch: (comp: CompetitionSummary, rows: CompetitionStanding[]) => void;
}) {
  const [rows, setRows] = useState<CompetitionStanding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !comp) return;
    let alive = true;
    setLoading(true);
    comps.getStandings(comp.id).then(r => { if (alive) { setRows(r); setLoading(false); } });
    return () => { alive = false; };
  }, [open, comp, comps]);

  if (!comp) return null;
  const done = comp.status === 'completed';
  const title = done ? 'Results' : comp.name;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <p className="text-[17px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              {comp.name}
            </p>
            <p className="te-label mt-1">
              {trackLabel(comp.track)} · {comp.participant_count} {comp.participant_count === 2 ? 'duel' : 'players'}
            </p>
          </div>
          {comp.status === 'active' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <ClockIcon className="w-3.5 h-3.5 text-white/40" />
              <span className="te-label" style={{ color: 'rgba(244,241,236,0.7)' }}>{fmtLeft(comp.end_at, '')}</span>
            </div>
          )}
        </div>

        {comp.status === 'cancelled' && (
          <div className="te-panel rounded-2xl px-4 py-6 text-center">
            <p className="text-[15px] font-semibold text-[#f4f1ec]">Cancelled</p>
            <p className="text-[13px] text-white/45 mt-1 leading-snug">Not enough players accepted before the start.</p>
          </div>
        )}

        {comp.status === 'pending' && (
          <div className="te-panel rounded-2xl px-4 py-6 text-center">
            <p className="text-[15px] font-semibold text-[#f4f1ec]">Waiting for friend</p>
            <p className="text-[13px] text-white/45 mt-1 leading-snug">Starts the moment your friend accepts.</p>
          </div>
        )}

        {(comp.status === 'active' || comp.status === 'completed') && (
          loading
            ? <div className="te-panel rounded-2xl px-4 py-8 text-center te-label">Loading…</div>
            : <StandingsList track={comp.track} rows={rows} />
        )}

        {done && (
          <button
            onClick={() => { feedback.log(); onRematch(comp, rows); }}
            className="w-full rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.99]"
            style={{ height: 48, background: '#f4f1ec', color: '#0a0908' }}
          >
            Rematch
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Create sheet ────────────────────────────────────────────────
const DURATIONS = [7, 14, 30] as const;

function nowDate(): Date {
  // The server sets the real start_at when the 2nd player accepts. We just
  // need a valid window whose duration the server will preserve.
  return new Date();
}

function CreateSheet({
  open, onClose, comps, friendsList, seed,
}: {
  open: boolean;
  onClose: () => void;
  comps: CompetitionsApi;
  friendsList: ProfileLite[];
  seed: { track: CompetitionTrack; participantIds: string[]; days: number; name: string } | null;
}) {
  const [name, setName] = useState('');
  const [track, setTrack] = useState<CompetitionTrack>('consistency');
  const [days, setDays] = useState<number>(7);
  const [customDays, setCustomDays] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(seed?.name ?? '');
    setTrack(seed?.track ?? 'consistency');
    setDays(seed?.days ?? 7);
    setCustomDays(seed && !DURATIONS.includes(seed.days as 7) ? String(seed.days) : '');
    setSelected(new Set(seed?.participantIds ?? []));
    setError(null);
  }, [open, seed]);

  const isCustom = !DURATIONS.includes(days as 7);
  const effectiveDays = isCustom ? Math.max(1, Math.min(365, parseInt(customDays || '0', 10) || 0)) : days;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    const ids = Array.from(selected);
    if (ids.length === 0) { setError('Pick at least one friend.'); return; }
    if (isCustom && effectiveDays < 1) { setError('Enter a valid duration.'); return; }
    setSaving(true);
    setError(null);
    const start = nowDate();
    const end = new Date(start.getTime() + effectiveDays * 86400000);
    const res = await comps.createCompetition({
      name: name.trim() || `${trackLabel(track)} challenge`,
      track,
      participantIds: ids,
      startAt: start,
      endAt: end,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.reason === 'no_participants' ? 'Those friends could not be invited.' : 'Could not create — try again.');
      return;
    }
    feedback.exerciseDone();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New competition">
      <div className="space-y-5">
        <div>
          <p className="te-label mb-2 px-0.5">Name</p>
          <input
            data-no-drag
            value={name}
            onChange={e => setName(e.target.value.slice(0, 60))}
            placeholder={`${trackLabel(track)} challenge`}
            className="w-full rounded-2xl px-3.5 py-3 text-[15px] text-[#f4f1ec] placeholder-white/25 tracking-tight outline-none"
            style={{ background: '#0b0b0b', border: '1px solid var(--te-border)' }}
          />
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Track</p>
          <div className="grid grid-cols-2 gap-2.5">
            {(['consistency', 'volume'] as const).map(t => (
              <ToggleButton key={t} active={track === t} onClick={() => setTrack(t)} label={t} heightPx={44} />
            ))}
          </div>
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Duration</p>
          <div className="grid grid-cols-4 gap-2.5">
            {DURATIONS.map(d => (
              <ToggleButton key={d} active={!isCustom && days === d} onClick={() => { setDays(d); setCustomDays(''); }} label={`${d}d`} heightPx={44} />
            ))}
            <ToggleButton active={isCustom} onClick={() => setDays(-1)} label="custom" heightPx={44} />
          </div>
          {isCustom && (
            <input
              data-no-drag
              inputMode="numeric"
              value={customDays}
              onChange={e => setCustomDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="days"
              className="w-full mt-2.5 rounded-2xl px-3.5 py-3 text-[15px] text-[#f4f1ec] placeholder-white/25 tracking-tight outline-none"
              style={{ background: '#0b0b0b', border: '1px solid var(--te-border)' }}
            />
          )}
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Players {selected.size > 0 && `· ${selected.size}`}</p>
          {friendsList.length === 0 ? (
            <div className="te-panel rounded-2xl px-4 py-5 text-center te-label">Add friends first to compete.</div>
          ) : (
            <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05] max-h-[240px] overflow-y-auto">
              {friendsList.map(f => {
                const on = selected.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className="w-full flex items-center px-4 py-3 gap-3 text-left active:bg-white/[0.04] transition-colors"
                  >
                    <Avatar name={f.display_name || f.username} avatarUrl={f.avatar_url} size={30} />
                    <span className="flex-1 min-w-0 text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">
                      {f.display_name || f.username}
                    </span>
                    <CheckCircle2
                      className="w-5 h-5 shrink-0"
                      style={{ color: on ? '#7fd57f' : 'rgba(255,255,255,0.15)' }}
                      strokeWidth={2}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="te-label px-0.5" style={{ color: '#ff453a' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={saving || friendsList.length === 0}
          className="w-full rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.99] disabled:opacity-50"
          style={{ height: 48, background: '#f4f1ec', color: '#0a0908' }}
        >
          {saving ? 'Creating…' : 'Start competition'}
        </button>
        <p className="te-label text-center" style={{ color: 'rgba(244,241,236,0.35)' }}>
          Starts when your friend accepts
        </p>
      </div>
    </Modal>
  );
}

// ── Invite card (accept / decline) ──────────────────────────────
function InviteCard({ comp, comps }: { comp: CompetitionSummary; comps: CompetitionsApi }) {
  const [busy, setBusy] = useState(false);
  async function act(accept: boolean) {
    if (busy) return;
    setBusy(true);
    if (accept) { feedback.log(); await comps.acceptInvite(comp.id); }
    else { feedback.skip(); await comps.declineInvite(comp.id); }
    setBusy(false);
  }
  return (
    <div className="te-panel rounded-2xl px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 shrink-0" style={{ color: '#e8c15a' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">{comp.name}</p>
          <p className="te-label mt-0.5">{trackLabel(comp.track)} · waiting for friend</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <button
          onClick={() => act(false)} disabled={busy}
          className="rounded-2xl font-semibold text-[13px] te-toggle-off disabled:opacity-50"
          style={{ height: 42, color: 'rgba(255,255,255,0.5)' }}
        >
          Decline
        </button>
        <button
          onClick={() => act(true)} disabled={busy}
          className="rounded-2xl font-semibold text-[13px] disabled:opacity-50"
          style={{ height: 42, background: '#f4f1ec', color: '#0a0908' }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

// ── Active / completed card ─────────────────────────────────────
function CompetitionCard({ comp, comps, onOpen }: {
  comp: CompetitionSummary;
  comps: CompetitionsApi;
  onOpen: () => void;
}) {
  const [me, setMe] = useState<CompetitionStanding | null>(null);
  const [total, setTotal] = useState<number>(comp.participant_count);

  useEffect(() => {
    if (comp.status !== 'active' && comp.status !== 'completed') return;
    let alive = true;
    comps.getStandings(comp.id).then(rows => {
      if (!alive) return;
      setTotal(rows.filter(r => r.status === 'accepted').length || rows.length);
      setMe(rows.find(r => r.is_self) ?? null);
    });
    return () => { alive = false; };
  }, [comp.id, comp.status, comps]);

  const active = comp.status === 'active';
  const sc = me ? scoreText(comp.track, me) : null;
  const rank = me?.rank ?? null;

  return (
    <button
      onClick={onOpen}
      className="te-panel w-full rounded-2xl px-4 py-3.5 text-left active:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">{comp.name}</p>
          <p className="te-label mt-1">
            {trackLabel(comp.track)} · {active ? fmtLeft(comp.end_at, '') : 'final'}
          </p>
        </div>
        {rank !== null && (
          <div className="flex flex-col items-end shrink-0">
            <span className="te-digit text-[18px] font-bold tabular-nums text-[#f4f1ec] leading-none">
              #{rank}<span className="text-white/30 text-[13px] font-medium"> / {total}</span>
            </span>
            {sc && <span className="te-mono text-[12px] tabular-nums mt-1" style={{ color: sc.color }}>{sc.text}</span>}
          </div>
        )}
        <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
      </div>
    </button>
  );
}

// ── Section (mounted inside ProfilePage) ────────────────────────
export function CompetitionsSection({ comps, friendsList }: {
  comps: CompetitionsApi;
  friendsList: ProfileLite[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [seed, setSeed] = useState<{ track: CompetitionTrack; participantIds: string[]; days: number; name: string } | null>(null);
  const [detail, setDetail] = useState<CompetitionSummary | null>(null);

  const openCreate = useCallback(() => { setSeed(null); setCreateOpen(true); }, []);

  const onRematch = useCallback((comp: CompetitionSummary, rows: CompetitionStanding[]) => {
    const days = Math.max(1, Math.round((new Date(comp.end_at).getTime() - new Date(comp.start_at).getTime()) / 86400000));
    setDetail(null);
    setSeed({
      track: comp.track,
      participantIds: rows.filter(r => !r.is_self).map(r => r.user_id),
      days,
      name: comp.name,
    });
    setCreateOpen(true);
  }, []);

  const invites = comps.pendingInvites;
  const active = comps.competitions.filter(c => c.status === 'active');
  const pendingMine = comps.competitions.filter(c => c.status === 'pending' && c.my_status === 'accepted');
  const completed = comps.competitions.filter(c => c.status === 'completed').slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[16px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Competitions
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 te-label active:opacity-60 transition-opacity"
          style={{ color: 'rgba(244,241,236,0.7)' }}
        >
          <PlusIcon className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {invites.length === 0 && active.length === 0 && pendingMine.length === 0 && completed.length === 0 ? (
        <button onClick={openCreate} className="te-panel w-full rounded-2xl px-5 py-8 text-center active:bg-white/[0.04] transition-colors">
          <Trophy className="w-8 h-8 mx-auto mb-2.5" style={{ color: '#e8c15a' }} />
          <p className="text-[16px] font-semibold text-[#f4f1ec] tracking-tight">Start a competition</p>
          <p className="text-[13px] text-white/45 mt-1 leading-snug">
            Challenge a friend to a consistency or volume duel.
          </p>
        </button>
      ) : (
        <div className="space-y-2.5">
          {invites.map(c => <InviteCard key={c.id} comp={c} comps={comps} />)}
          {active.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetail(c)} />)}
          {pendingMine.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetail(c)} />)}
          {completed.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetail(c)} />)}
        </div>
      )}

      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        comps={comps}
        friendsList={friendsList}
        seed={seed}
      />
      <CompetitionSheet
        open={detail !== null}
        comp={detail}
        comps={comps}
        onClose={() => setDetail(null)}
        onRematch={onRematch}
      />
    </div>
  );
}
