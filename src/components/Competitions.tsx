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
  gold:     { label: 'Gold',     color: 'var(--te-gold)', Icon: Trophy },
  silver:   { label: 'Silver',   color: '#c6c8d0', Icon: Medal },
  bronze:   { label: 'Bronze',   color: '#cd8b5c', Icon: Medal },
  finisher: { label: 'Finisher', color: 'var(--te-pr)', Icon: Award },
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

function endsWithin24h(endAt: string): boolean {
  const ms = new Date(endAt).getTime() - Date.now();
  return ms > 0 && ms <= 86400000;
}

function fmtStarted(startAt: string): string {
  const d = new Date(startAt);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// A participant's own headline number — never a raw volume comparison.
function scoreText(track: CompetitionTrack, s: CompetitionStanding): { text: string; color: string } {
  if (track === 'volume') {
    if (s.delta === null || s.delta === undefined) return { text: '—', color: 'var(--te-text-4)' };
    const sign = s.delta > 0 ? '+' : '';
    return { text: `${sign}${s.delta}%`, color: s.delta >= 0 ? 'var(--te-pr)' : '#e8a657' };
  }
  if (s.score === null || s.score === undefined) return { text: '—', color: 'var(--te-text-4)' };
  return { text: `${Math.round(s.score)}%`, color: 'var(--te-text-1)' };
}

// The ranking value used for head-to-head comparison; null = no data yet.
function scoreValue(track: CompetitionTrack, s: CompetitionStanding): number | null {
  return track === 'volume' ? (s.delta ?? null) : (s.score ?? null);
}

function trackLabel(t: CompetitionTrack): string {
  return t === 'volume' ? 'Volume' : 'Consistency';
}

function cancelledMessage(reason: CompetitionSummary['cancelled_reason']): string {
  return reason === 'mutual_agreement'
    ? 'All players agreed to end this early.'
    : 'Not enough players accepted before the start.';
}

// ── Badge shelf (profile) ───────────────────────────────────────
// Placeholder icons — will be swapped for Figma exports.
export function BadgeShelf({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <div>
      <p className="text-[17px] font-bold te-t1 tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>
        Badges
      </p>
      <div className="te-panel rounded-te-md px-4 py-4">
        <div className="flex flex-wrap gap-4">
          {badges.map(b => {
            const meta = TIER_META[b.tier];
            const Icon = meta.Icon;
            return (
              <div key={b.id} className="flex flex-col items-center gap-1.5 w-16">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 48, height: 48, background: 'var(--te-border)', border: `1px solid ${meta.color}55` }}
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
    <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">
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
            <span className="te-mono text-[15px] tabular-nums w-5 shrink-0" style={{ color: medal ? TIER_META[medal].color : 'var(--te-text-4)' }}>
              {rank}
            </span>
            <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">
                {r.display_name || r.username}{r.is_self && <span className="te-t4 font-normal"> · you</span>}
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

// ── Head-to-head duel layout ────────────────────────────────────
// Most competitions are 1v1. A ranked list renders a duel as two rows that can
// both say "1", which reads broken — instead a duel gets a face-off: both
// players side by side, big scores, and a tug-of-war bar showing who leads.

// My share of the tug bar, 0..1. Consistency scores are 0–100; volume deltas
// can be negative, so those are mapped as a bounded lead around the center.
function duelShare(track: CompetitionTrack, me: number | null, them: number | null): number {
  if (me === null && them === null) return 0.5;
  // Any score beats no score — show a modest lead rather than comparing
  // against an implied 0 (a negative volume delta would then read as losing
  // to someone who hasn't even logged).
  if (them === null) return 0.62;
  if (me === null) return 0.38;
  if (track === 'volume') return 0.5 + Math.max(-0.42, Math.min(0.42, (me - them) / 80));
  if (me === 0 && them === 0) return 0.5;
  return Math.max(0.08, Math.min(0.92, me / (me + them)));
}

function duelStatusLine(track: CompetitionTrack, me: CompetitionStanding, them: CompetitionStanding, done: boolean): string {
  const a = scoreValue(track, me);
  const b = scoreValue(track, them);
  if (a === null && b === null) {
    return done ? 'No workouts were logged.' : 'No scores yet — first workouts count soon.';
  }
  const theirName = them.display_name || them.username;
  if (!done && b === null && a !== null) return `${theirName} hasn't scored yet — you're ahead.`;
  if (!done && a === null && b !== null) return `${theirName} is on the board — you're not yet.`;
  if ((a ?? -Infinity) > (b ?? -Infinity)) return done ? 'You won this one.' : "You're in the lead — keep it.";
  if ((b ?? -Infinity) > (a ?? -Infinity)) return done ? `${theirName} took this one.` : `${theirName} leads — your next workout closes the gap.`;
  return done ? 'Dead even — it ends in a tie.' : 'Dead even right now.';
}

function DuelFaceOff({ track, me, them, done }: {
  track: CompetitionTrack;
  me: CompetitionStanding;
  them: CompetitionStanding;
  done: boolean;
}) {
  const myScore = scoreText(track, me);
  const theirScore = scoreText(track, them);
  const a = scoreValue(track, me);
  const b = scoreValue(track, them);
  const iLead = (a ?? -Infinity) > (b ?? -Infinity);
  const theyLead = (b ?? -Infinity) > (a ?? -Infinity);
  const share = duelShare(track, a, b);

  const Side = ({ s, score, leads, alignRight }: {
    s: CompetitionStanding; score: { text: string; color: string }; leads: boolean; alignRight?: boolean;
  }) => (
    <div className={`flex-1 min-w-0 flex flex-col gap-1.5 ${alignRight ? 'items-end text-right' : 'items-start'}`}>
      <div className="relative">
        <Avatar name={s.display_name || s.username} avatarUrl={s.avatar_url} size={44} />
        {leads && (
          <span
            className="absolute flex items-center justify-center rounded-full"
            style={{ width: 18, height: 18, top: -5, [alignRight ? 'left' : 'right']: -5, background: 'var(--te-ink)', border: '1px solid color-mix(in srgb, var(--te-gold) 45%, transparent)' } as React.CSSProperties}
          >
            <Trophy className="w-2.5 h-2.5" style={{ color: 'var(--te-gold)' }} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <p className="text-[13px] font-semibold te-t1 tracking-tight truncate max-w-full">
        {s.is_self ? 'You' : (s.display_name || s.username)}
      </p>
      <span className="te-digit text-[24px] font-bold tabular-nums leading-none" style={{ color: score.color }}>
        {score.text}
      </span>
    </div>
  );

  return (
    <div>
      <div className="flex items-start gap-3">
        <Side s={me} score={myScore} leads={iLead} />
        <span
          className="shrink-0 self-center"
          style={{
            fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 700,
            letterSpacing: '0.12em', color: 'var(--te-text-4)',
          }}
        >
          VS
        </span>
        <Side s={them} score={theirScore} leads={theyLead} alignRight />
      </div>

      {/* Tug-of-war bar — your side fills from the left. */}
      <div className="mt-3 rounded-full overflow-hidden flex" style={{ height: 5, background: 'var(--te-border)' }}>
        <div
          style={{
            width: `${share * 100}%`,
            background: iLead ? 'var(--te-pr)' : 'rgba(244,241,236,0.55)',
            borderRadius: 9999,
            transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>

      <p className="te-label mt-2.5" style={{ color: 'var(--te-text-3)' }}>
        {duelStatusLine(track, me, them, done)}
      </p>
    </div>
  );
}

// Picks the duel pair out of standings rows: exactly two accepted players,
// one of whom is you. Returns null when the H2H layout doesn't apply.
function duelPair(rows: CompetitionStanding[]): { me: CompetitionStanding; them: CompetitionStanding } | null {
  const accepted = rows.filter(r => r.status === 'accepted');
  if (accepted.length !== 2) return null;
  const me = accepted.find(r => r.is_self);
  const them = accepted.find(r => !r.is_self);
  return me && them ? { me, them } : null;
}

// Vote-to-cancel — a deliberately low-key text link at the foot of the detail
// sheet, not a headline action. Cancels the moment every accepted participant
// has voted; a vote can be retracted beforehand. `rows` carries each
// participant's live voted_cancel flag.
function CancelVote({
  comp, rows, comps, onVoted,
}: {
  comp: CompetitionSummary;
  rows: CompetitionStanding[];
  comps: CompetitionsApi;
  onVoted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accepted = rows.filter(r => r.status === 'accepted');
  const me = rows.find(r => r.is_self);
  if (!me || me.status !== 'accepted' || accepted.length === 0) return null;

  const votes = accepted.filter(r => r.voted_cancel).length;
  const needed = accepted.length;
  const iVoted = !!me.voted_cancel;

  async function toggle() {
    if (!comp || busy) return;
    setBusy(true);
    setError(null);
    feedback.skip();
    try {
      // The RPC resolves with { ok: false } rather than throwing when the
      // server rejects it (or the function is missing), so check the result —
      // otherwise a failed vote looks identical to a successful one.
      const res = iVoted ? await comps.unvoteCancel(comp.id) : await comps.voteCancel(comp.id);
      if (!res?.ok) setError("Couldn't register your vote — try again.");
      onVoted();
    } catch {
      setError("Couldn't register your vote — try again.");
    } finally {
      setBusy(false);
    }
  }

  const suffix = needed > 1 ? ` · ${votes}/${needed} agreed` : '';

  return (
    <div>
      <button
        onClick={toggle}
        disabled={busy}
        className="w-full text-center py-1.5 active:opacity-60 transition-opacity disabled:opacity-40"
        style={{
          fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 500,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: iVoted ? 'rgba(255,69,58,0.75)' : 'var(--te-text-4)',
        }}
      >
        {iVoted ? `Voted to cancel${suffix} · undo` : `Cancel competition${suffix}`}
      </button>
      {error && (
        <p className="te-label text-center mt-1" style={{ color: 'var(--te-danger)' }}>{error}</p>
      )}
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

  const loadRows = useCallback(() => {
    if (!comp) return;
    return comps.getStandings(comp.id).then(r => setRows(r));
  }, [comp, comps]);

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
            <p className="te-label">
              {trackLabel(comp.track)} · {comp.participant_count === 2 ? 'duel' : `${comp.participant_count} players`} · started {fmtStarted(comp.start_at)}
            </p>
          </div>
          {comp.status === 'active' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <ClockIcon className="w-3.5 h-3.5 te-t4" />
              <span className="te-label" style={{ color: 'var(--te-text-2)' }}>{fmtLeft(comp.end_at, '')}</span>
            </div>
          )}
        </div>

        {comp.status === 'cancelled' && (
          <div className="te-panel rounded-te-md px-4 py-6 text-center">
            <p className="text-[15px] font-semibold te-t1">Cancelled</p>
            <p className="text-[13px] te-t3 mt-1 leading-snug">{cancelledMessage(comp.cancelled_reason)}</p>
          </div>
        )}

        {comp.status === 'pending' && (
          <div className="te-panel rounded-te-md px-4 py-6 text-center">
            <p className="text-[15px] font-semibold te-t1">Waiting for friend</p>
            <p className="text-[13px] te-t3 mt-1 leading-snug">Starts the moment your friend accepts.</p>
          </div>
        )}

        {(comp.status === 'active' || comp.status === 'completed') && (
          loading
            ? <div className="te-panel rounded-te-md px-4 py-8 text-center te-label">Loading…</div>
            : (() => {
                const pair = duelPair(rows);
                return pair
                  ? (
                    <div className="te-panel rounded-te-md px-4 py-4">
                      <DuelFaceOff track={comp.track} me={pair.me} them={pair.them} done={done} />
                    </div>
                  )
                  : <StandingsList track={comp.track} rows={rows} />;
              })()
        )}

        {(comp.status === 'active' || comp.status === 'completed') && !loading && (
          <p className="te-label px-0.5 leading-relaxed" style={{ color: 'var(--te-text-4)' }}>
            {comp.track === 'volume'
              ? 'Scored as % change vs your own 30-day baseline — you race your own numbers, not raw weight.'
              : 'Scored as % of your own scheduled training days completed — fair at any level.'}
          </p>
        )}

        {(comp.status === 'pending' || comp.status === 'active') && !loading && (
          <CancelVote comp={comp} rows={rows} comps={comps} onVoted={loadRows} />
        )}

        {done && (
          <button
            onClick={() => { feedback.log(); onRematch(comp, rows); }}
            className="te-white-btn w-full rounded-te-md font-semibold text-[15px]"
            style={{ height: 48 }}
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
            className="w-full rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none"
            style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
          />
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Track</p>
          <div className="grid grid-cols-2 gap-2.5">
            {(['consistency', 'volume'] as const).map(t => (
              <ToggleButton key={t} active={track === t} onClick={() => setTrack(t)} label={t} heightPx={44} />
            ))}
          </div>
          {/* Fairness is the whole point of both tracks — say it up front so
              a weaker/newer lifter isn't scared off challenging a stronger
              friend. */}
          <p className="te-label mt-2 px-0.5 leading-relaxed" style={{ color: 'var(--te-text-4)' }}>
            {track === 'consistency'
              ? 'Who shows up more — % of your own scheduled days completed. Fair at any strength level.'
              : 'Who improves more — % change vs your own last 30 days. You race your own baseline, not their numbers.'}
          </p>
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
              className="w-full mt-2.5 rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none"
              style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
            />
          )}
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Players {selected.size > 0 && `· ${selected.size}`}</p>
          {friendsList.length === 0 ? (
            <div className="te-panel rounded-te-md px-4 py-5 text-center text-[13px] te-t3">Add friends first to compete.</div>
          ) : (
            <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05] max-h-[240px] overflow-y-auto">
              {friendsList.map(f => {
                const on = selected.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className="w-full flex items-center px-4 py-3 gap-3 text-left active:bg-white/[0.04] transition-colors"
                  >
                    <Avatar name={f.display_name || f.username} avatarUrl={f.avatar_url} size={30} />
                    <span className="flex-1 min-w-0 text-[15px] font-semibold te-t1 tracking-tight truncate">
                      {f.display_name || f.username}
                    </span>
                    <CheckCircle2
                      className="w-5 h-5 shrink-0"
                      style={{ color: on ? 'var(--te-pr)' : 'rgba(255,255,255,0.15)' }}
                      strokeWidth={2}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="te-label px-0.5" style={{ color: 'var(--te-danger)' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={saving || friendsList.length === 0}
          className="te-white-btn w-full rounded-te-md font-semibold text-[15px] disabled:opacity-50"
          style={{ height: 48 }}
        >
          {saving ? 'Creating…' : 'Start competition'}
        </button>
        <p className="te-label text-center" style={{ color: 'var(--te-text-4)' }}>
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
    <div className="te-panel rounded-te-md px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Trophy className="w-4 h-4 shrink-0" style={{ color: 'var(--te-gold)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">{comp.name}</p>
          <p className="te-label mt-0.5">{trackLabel(comp.track)} · invited you</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <button
          onClick={() => act(false)} disabled={busy}
          className="rounded-te-md font-semibold text-[13px] te-toggle-off disabled:opacity-50"
          style={{ height: 42, color: 'var(--te-text-3)' }}
        >
          Decline
        </button>
        <button
          onClick={() => act(true)} disabled={busy}
          className="te-white-btn rounded-te-md font-semibold text-[13px] disabled:opacity-50"
          style={{ height: 42 }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

// Small status chip: time-left (green, live) for active — flipping to a
// caution tint inside the final 24h — or a muted label otherwise.
function StatusPill({ text, live, urgent }: { text: string; live?: boolean; urgent?: boolean }) {
  return (
    <span
      className="shrink-0 whitespace-nowrap"
      style={{
        fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 600,
        letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1,
        padding: '4px 8px', borderRadius: 9999,
        color: urgent ? '#e8a657' : live ? 'var(--te-pr)' : 'var(--te-text-3)',
        background: urgent ? 'rgba(232,166,87,0.12)' : live ? 'rgba(127,213,127,0.12)' : 'var(--te-border)',
      }}
    >
      {text}
    </span>
  );
}

// ── Active / completed card ─────────────────────────────────────
// Hevy-style: a title + status chip, then a compact ranked mini-leaderboard
// (top 3, "you" highlighted). One glance answers name / who's winning / how
// long left — no scattered stat clusters.
function CompetitionCard({ comp, comps, onOpen }: {
  comp: CompetitionSummary;
  comps: CompetitionsApi;
  onOpen: () => void;
}) {
  const [rows, setRows] = useState<CompetitionStanding[]>([]);

  useEffect(() => {
    if (comp.status !== 'active' && comp.status !== 'completed') return;
    let alive = true;
    comps.getStandings(comp.id).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [comp.id, comp.status, comps]);

  const active = comp.status === 'active';
  const done = comp.status === 'completed';
  const urgent = active && endsWithin24h(comp.end_at);
  const pill = active ? fmtLeft(comp.end_at, 'ends') : done ? 'Final' : 'Pending';
  const preview = rows.filter(r => r.status === 'accepted').slice(0, 3);
  const pair = duelPair(rows);

  return (
    <button
      onClick={onOpen}
      className="te-panel w-full rounded-te-md px-4 py-3.5 text-left active:bg-white/[0.04] transition-colors"
    >
      {/* Header — name + status chip */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">{comp.name}</p>
          <p className="te-label mt-1">{trackLabel(comp.track)} · {comp.participant_count === 2 ? 'duel' : `${comp.participant_count} players`}</p>
        </div>
        <StatusPill text={pill} live={active} urgent={urgent} />
      </div>

      {/* Duel → head-to-head face-off */}
      {(active || done) && pair && (
        <div className="mt-3 pt-3 border-t border-[color:var(--te-border)]">
          <DuelFaceOff track={comp.track} me={pair.me} them={pair.them} done={done} />
        </div>
      )}

      {/* 3+ players → ranked mini-leaderboard */}
      {(active || done) && !pair && preview.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[color:var(--te-border)] space-y-2">
          {preview.map((r, i) => {
            const rank = r.rank ?? i + 1;
            const s = scoreText(comp.track, r);
            return (
              <div key={r.user_id} className="flex items-center gap-2.5">
                <span className="te-mono text-[13px] tabular-nums w-3.5 shrink-0" style={{ color: rank === 1 ? 'var(--te-gold)' : 'var(--te-text-4)' }}>
                  {rank}
                </span>
                <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={22} />
                <span
                  className="flex-1 min-w-0 text-[13px] font-medium tracking-tight truncate"
                  style={{ color: r.is_self ? '#f4f1ec' : 'var(--te-text-2)' }}
                >
                  {r.display_name || r.username}{r.is_self && <span className="te-t4"> · you</span>}
                </span>
                <span className="te-digit text-[13px] font-bold tabular-nums shrink-0" style={{ color: s.color }}>
                  {s.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending — a single quiet line */}
      {comp.status === 'pending' && (
        <p className="text-[13px] te-t3 mt-2">Waiting for friend to accept</p>
      )}
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
  // Looked up by id (not a static snapshot) so the sheet reflects live status
  // changes — e.g. it flips straight to "Cancelled" the instant a mutual
  // cancel vote lands, without needing to be closed and reopened.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? comps.competitions.find(c => c.id === detailId) ?? null : null;

  const openCreate = useCallback(() => { setSeed(null); setCreateOpen(true); }, []);

  const onRematch = useCallback((comp: CompetitionSummary, rows: CompetitionStanding[]) => {
    const days = Math.max(1, Math.round((new Date(comp.end_at).getTime() - new Date(comp.start_at).getTime()) / 86400000));
    setDetailId(null);
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
        <p className="text-[17px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Competitions
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 te-label active:opacity-60 transition-opacity"
          style={{ color: 'var(--te-text-2)' }}
        >
          <PlusIcon className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {invites.length === 0 && active.length === 0 && pendingMine.length === 0 && completed.length === 0 ? (
        <button onClick={openCreate} className="te-panel w-full rounded-te-md px-5 py-8 text-center active:bg-white/[0.04] transition-colors">
          <Trophy className="w-8 h-8 mx-auto mb-2.5" style={{ color: 'var(--te-gold)' }} />
          <p className="text-[17px] font-semibold te-t1 tracking-tight">Start a competition</p>
          <p className="text-[13px] te-t3 mt-1 leading-snug">
            Challenge a friend to a consistency or volume duel.
          </p>
        </button>
      ) : (
        <div className="space-y-2.5">
          {invites.map(c => <InviteCard key={c.id} comp={c} comps={comps} />)}
          {active.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetailId(c.id)} />)}
          {pendingMine.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetailId(c.id)} />)}
          {completed.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} onOpen={() => setDetailId(c.id)} />)}
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
        onClose={() => setDetailId(null)}
        onRematch={onRematch}
      />
    </div>
  );
}

// ── Mini widget for the Progress page ───────────────────────────
// Shows a compact row of active competitions: who's leading and when it ends.
// Tapping a row opens the full detail sheet (self-contained).
// Compact Progress-page banner: the single active competition ending soonest,
// showing who's leading + time left, with an arrow into the profile's
// Competitions section.
export function CompetitionMiniWidget({ comps, onOpen }: {
  comps: CompetitionsApi;
  onOpen: () => void;
}) {
  const soonest = comps.competitions
    .filter(c => c.status === 'active')
    .sort((a, b) => new Date(a.end_at).getTime() - new Date(b.end_at).getTime())[0] ?? null;

  // One line of standing context ("You lead · +8%" / "Jānis leads") so the
  // banner answers am-I-winning without a trip into the profile.
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!soonest) { setStatus(null); return; }
    let alive = true;
    comps.getStandings(soonest.id).then(rows => {
      if (!alive) return;
      const accepted = rows.filter(r => r.status === 'accepted');
      const me = accepted.find(r => r.is_self);
      if (!me || accepted.length < 2) { setStatus(null); return; }
      const mine = scoreValue(soonest.track, me);
      const best = Math.max(...accepted.filter(r => !r.is_self).map(r => scoreValue(soonest.track, r) ?? -Infinity));
      if (mine === null && best === -Infinity) { setStatus('No scores yet'); return; }
      if ((mine ?? -Infinity) > best) { setStatus(`You lead · ${scoreText(soonest.track, me).text}`); return; }
      if ((mine ?? -Infinity) === best) { setStatus('Tied for the lead'); return; }
      const leader = accepted.filter(r => !r.is_self).sort((a, b) => (scoreValue(soonest.track, b) ?? -Infinity) - (scoreValue(soonest.track, a) ?? -Infinity))[0];
      setStatus(`${leader.display_name || leader.username} leads`);
    });
    return () => { alive = false; };
    // Re-check when the competition or its standings could have changed.
  }, [soonest?.id, soonest?.track, comps]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!soonest) return null;
  const urgent = endsWithin24h(soonest.end_at);

  return (
    <button
      onClick={onOpen}
      className="te-panel-dark w-full rounded-te-md px-4 py-3 flex items-center gap-2.5 text-left active:bg-white/[0.04] transition-colors mb-[18px]"
    >
      <Trophy className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--te-gold)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold te-t1 tracking-tight truncate">{soonest.name}</p>
        {status && <p className="te-label mt-0.5 truncate">{status}</p>}
      </div>
      <span className="te-label shrink-0 whitespace-nowrap" style={urgent ? { color: '#e8a657' } : undefined}>
        ends {fmtLeft(soonest.end_at, '')}
      </span>
      <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
    </button>
  );
}
