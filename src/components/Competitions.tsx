// Competitions — time-boxed challenges between friends, capped at 6 players.
// Two tracks: volume (total working-set kg lifted inside the window) and
// streak (current workout streak in days when it ends). Standings are always
// fetched live from the server; the client never computes or caches a rank.
// See supabase/migrations for rules. Card layouts follow the Figma
// "Competition-volume/streak duel / 3-player / 6-player card" designs.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlusIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { FireIcon } from '@heroicons/react/24/solid';
import { Trophy, Medal, Award, CheckCircle2, Swords } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import { ToggleButton } from './SheetControls';
import { feedback } from '../lib/feedback';
import type { ProfileLite } from '../hooks/useFriends';
import type { useCompetitions } from '../hooks/useCompetitions';
import type { WeightUnit } from '../hooks/useSettings';
import type {
  CompetitionSummary, CompetitionStanding, Badge, BadgeTier, CompetitionTrack,
} from '../types';

type CompetitionsApi = ReturnType<typeof useCompetitions>;

// Formats a raw kg volume for display in the viewer's unit ("8923KG").
// No thousands separator — matches the Figma cards and buys a character of
// width back in a column that is already tight.
type VolFmt = (kg: number) => string;

export function makeVolFmt(unit: WeightUnit, toDisplay: (kg: number) => number): VolFmt {
  return kg => `${Math.round(toDisplay(kg))}${unit.toUpperCase()}`;
}

// Geist Mono advance width is 0.6em, so a value's pixel width is
// len × 0.6 × fontSize. Competition volumes run to five and six digits, which
// overflow the fixed-width duel/grid columns at the design size — step the
// size down for long values rather than truncating the number.
function fitFontSize(text: string, base: number, avail: number): number {
  return Math.max(14, Math.min(base, Math.floor(avail / (text.length * 0.6))));
}

// Card geometry. The duel divider is a fixed-width centre column, so the two
// side columns are whatever is left over — these are the widths a value has to
// fit into at a 375px viewport (the narrowest the app targets).
//
// The divider is drawn as an overlay inset from both edges by exactly the
// avatar width plus DUEL_RULE_GAP_PX, so its rules always stop the same short
// distance from each player's picture whatever the viewport. Equal insets also
// mean the "vs" lands dead centre for free. The middle grid column below is
// only a spacer, reserving room so long values never run into the "vs".
const AVATAR_PX = 50;
const RANK_BADGE_PX = 22;
const DUEL_DIVIDER_PX = 90;
const DUEL_RULE_GAP_PX = 10;
const DUEL_SIDE_PX = 102;
const GRID_CELL_PX = 92;

const MAX_PLAYERS = 6; // creator + 5 invitees — enforced server-side too

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

// The ranking value used for head-to-head comparison; null = no data yet.
// Both tracks rank on `score` (kg for volume, days for streak).
function scoreValue(s: CompetitionStanding): number | null {
  return s.score ?? null;
}

// A participant's headline value as text ("8,923KG" / "25d").
function valueText(track: CompetitionTrack, s: CompetitionStanding, volFmt: VolFmt): string {
  if (s.score === null || s.score === undefined) return '—';
  if (track === 'streak') return `${Math.round(s.score)}d`;
  return volFmt(s.score);
}

function trackLabel(t: CompetitionTrack): string {
  return t === 'streak' ? 'Streak' : 'Volume';
}

function playersLabel(n: number): string {
  return n === 2 ? 'duel' : `${n} players`;
}

function cancelledMessage(reason: CompetitionSummary['cancelled_reason']): string {
  return reason === 'mutual_agreement'
    ? 'All players agreed to end this early.'
    : 'Not enough players accepted before the start.';
}

// ── Card building blocks (Figma competition cards) ──────────────

// The leader wears a small trophy on the avatar rim; everyone else gets a
// quiet "#n" rank chip. Background matches the card surface so the chip
// visually punches out of the avatar ring.
function RankBadge({ rank, side = 'right' }: { rank: number; side?: 'left' | 'right' }) {
  const pos = side === 'right' ? { right: -7 } : { left: -7 };
  return (
    <span
      className="absolute flex items-center justify-center rounded-full"
      style={{ width: RANK_BADGE_PX, height: RANK_BADGE_PX, top: -5, ...pos, background: 'var(--te-surface-2)' }}
    >
      {rank === 1 ? (
        <Trophy style={{ width: 13, height: 13, color: 'var(--te-gold)' }} strokeWidth={2.25} />
      ) : (
        <span className="te-mono" style={{ fontSize: 9, fontWeight: 600, color: 'var(--te-text-4)' }}>
          #{rank}
        </span>
      )}
    </span>
  );
}

// Headline value under an avatar: mono digits, with a flame on the streak
// track (red for the leader, plain for everyone else — per the Figma cards).
// `px` is computed once per card from the longest value on it, so both sides
// of a duel (and every cell of a grid) share one type size — sizing each cell
// independently makes a card look broken when the totals differ in length.
function ValueLine({ track, s, volFmt, leader, size, px }: {
  track: CompetitionTrack;
  s: CompetitionStanding;
  volFmt: VolFmt;
  leader: boolean;
  size: 'lg' | 'sm';
  px: number;
}) {
  const flame = track === 'streak' && s.score !== null;
  const iconPx = size === 'lg' ? 19 : 15;
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      {flame && (
        <FireIcon
          style={{
            width: iconPx, height: iconPx, flexShrink: 0,
            color: leader ? 'var(--te-danger)' : 'var(--te-text-1)',
          }}
        />
      )}
      <span className="te-digit font-bold tabular-nums te-t1 truncate" style={{ fontSize: px, lineHeight: 1 }}>
        {valueText(track, s, volFmt)}
      </span>
    </span>
  );
}

// Shared type size for a set of rows, driven by the longest value.
function sharedValueSize(
  track: CompetitionTrack,
  rows: CompetitionStanding[],
  volFmt: VolFmt,
  size: 'lg' | 'sm',
): number {
  const longest = rows.reduce(
    (n, r) => Math.max(n, valueText(track, r, volFmt).length), 1,
  );
  const flame = track === 'streak' ? (size === 'lg' ? 25 : 21) : 0;
  const avail = (size === 'lg' ? DUEL_SIDE_PX : GRID_CELL_PX) - flame;
  return fitFontSize('x'.repeat(longest), size === 'lg' ? 26 : 20, avail);
}

// Status chip in the card header: live countdown (flipping to a caution tint
// inside the final 24h), or a muted Final/Pending label.
function CardTag({ comp }: { comp: CompetitionSummary }) {
  const active = comp.status === 'active';
  const done = comp.status === 'completed';
  const urgent = active && endsWithin24h(comp.end_at);
  const text = active ? fmtLeft(comp.end_at, 'ends in') : done ? 'Final' : 'Pending';
  return (
    <span
      className="te-label shrink-0 whitespace-nowrap inline-flex items-center rounded-full"
      style={{
        color: done ? 'var(--te-text-3)' : urgent ? 'var(--te-warn)' : 'var(--te-pr)',
        border: '1px solid var(--te-border-strong)',
        padding: '0 10px', height: 22,
      }}
    >
      {text}
    </span>
  );
}

// Duel body: the two players face off across a hairline "vs" divider.
// `names` adds a small name caption per side (used in the detail sheet; the
// list cards stay avatar+value only, per Figma).
function DuelBody({ track, me, them, volFmt, names }: {
  track: CompetitionTrack;
  me: CompetitionStanding;
  them: CompetitionStanding;
  volFmt: VolFmt;
  names?: boolean;
}) {
  const a = scoreValue(me);
  const b = scoreValue(them);
  const iLead = (a ?? -Infinity) > (b ?? -Infinity);
  const theyLead = (b ?? -Infinity) > (a ?? -Infinity);
  const px = sharedValueSize(track, [me, them], volFmt, 'lg');

  const Side = ({ s, leads, right }: { s: CompetitionStanding; leads: boolean; right?: boolean }) => (
    <div className={`flex flex-col gap-3.5 min-w-0 ${right ? 'items-end text-right' : 'items-start'}`}>
      <div className="relative">
        <Avatar name={s.display_name || s.username} avatarUrl={s.avatar_url} size={AVATAR_PX} />
        {leads && <RankBadge rank={1} side={right ? 'left' : 'right'} />}
      </div>
      {names && (
        <p className="text-[13px] font-semibold te-t1 tracking-tight truncate max-w-full">
          {s.is_self ? 'You' : (s.display_name || s.username)}
        </p>
      )}
      <ValueLine track={track} s={s} volFmt={volFmt} leader={leads} size="lg" px={px} />
    </div>
  );

  // Equal-width (1fr) outer columns centre the card; the vs divider is an
  // overlay on the avatar row, inset AVATAR_PX + DUEL_RULE_GAP_PX from each
  // edge so the rules always stop 10px from each picture.
  return (
    <div className="relative grid" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
      <Side s={me} leads={iLead} />
      <div aria-hidden style={{ width: DUEL_DIVIDER_PX, height: AVATAR_PX }} />
      <Side s={them} leads={theyLead} right />
      <div
        className="absolute inset-x-0 top-0 flex items-center gap-2.5 pointer-events-none"
        style={{
          height: AVATAR_PX,
          paddingLeft: AVATAR_PX + DUEL_RULE_GAP_PX,
          paddingRight: AVATAR_PX + DUEL_RULE_GAP_PX,
        }}
      >
        <span className="flex-1 h-px" style={{ background: 'var(--te-border-strong)' }} />
        <span
          className="te-mono shrink-0"
          style={{
            fontSize: 15, fontWeight: 500, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--te-text-4)', lineHeight: 1,
          }}
        >
          vs
        </span>
        <span className="flex-1 h-px" style={{ background: 'var(--te-border-strong)' }} />
      </div>
    </div>
  );
}

// 3+ players: a 3-column grid of avatar+value cells (wraps to a second row
// for up to 6 players). Every cell carries its rank badge.
function GridBody({ track, rows, volFmt }: {
  track: CompetitionTrack;
  rows: CompetitionStanding[];
  volFmt: VolFmt;
}) {
  const px = sharedValueSize(track, rows, volFmt, 'sm');
  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-5">
      {rows.map((r, i) => {
        const rank = r.rank ?? i + 1;
        return (
          <div key={r.user_id} className="flex flex-col items-center gap-2.5 min-w-0">
            <div className="relative">
              <Avatar name={r.display_name || r.username} avatarUrl={r.avatar_url} size={AVATAR_PX} />
              <RankBadge rank={rank} />
            </div>
            <ValueLine track={track} s={r} volFmt={volFmt} leader={rank === 1} size="sm" px={px} />
          </div>
        );
      })}
    </div>
  );
}

// ── Badge case ──────────────────────────────────────────────────
// Each badge carries its story: which competition, against whom, the final
// score, and when. Tapping a badge opens the story sheet; icons are still
// placeholders pending Figma exports.
function fmtBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function BadgeDetailSheet({ badge, comps, volFmt, onClose }: {
  badge: Badge | null;
  comps: CompetitionsApi;
  volFmt: VolFmt;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CompetitionStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const comp = badge?.competition_id
    ? comps.competitions.find(c => c.id === badge.competition_id) ?? null
    : null;

  const { getStandings, getCachedStandings } = comps;
  const compId = comp?.id ?? null;

  useEffect(() => {
    if (!badge || !compId) { setRows([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const cached = getCachedStandings(compId);
    if (cached) { setRows(cached); setLoading(false); return; }
    getStandings(compId).then(r => { if (alive) { setRows(r); setLoading(false); } });
    return () => { alive = false; };
  }, [badge, compId, getStandings, getCachedStandings]);

  if (!badge) return null;
  const meta = TIER_META[badge.tier];
  const Icon = meta.Icon;
  const pair = duelPair(rows);

  return (
    <Modal open={!!badge} onClose={onClose} title="Badge">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 pt-1">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, background: 'var(--te-border)', border: `1.5px solid ${meta.color}66` }}
          >
            <Icon className="w-9 h-9" style={{ color: meta.color }} strokeWidth={1.6} />
          </div>
          <div className="text-center">
            <p className="text-[20px] font-bold te-t1 tracking-tight">{meta.label}</p>
            <p className="te-label mt-1">{fmtBadgeDate(badge.awarded_at)}</p>
          </div>
        </div>

        {comp ? (
          <>
            <div className="te-panel rounded-te-md px-4 py-3.5">
              <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">{comp.name}</p>
              <p className="te-label mt-1">
                {trackLabel(comp.track)} · {playersLabel(comp.participant_count)} · {fmtStarted(comp.start_at)} – {fmtStarted(comp.end_at)}
              </p>
            </div>
            {loading ? (
              <div className="te-panel rounded-te-md px-4 py-6 text-center te-label">Loading…</div>
            ) : pair ? (
              <div className="te-panel rounded-te-md px-4 py-4">
                <DuelFaceOff track={comp.track} me={pair.me} them={pair.them} volFmt={volFmt} done />
              </div>
            ) : rows.length > 0 ? (
              <StandingsList track={comp.track} rows={rows} volFmt={volFmt} />
            ) : null}
          </>
        ) : (
          <p className="te-label text-center py-2" style={{ color: 'var(--te-text-4)' }}>
            Earned in a competition that's no longer available.
          </p>
        )}
      </div>
    </Modal>
  );
}

export function BadgeShelf({ badges, comps, unit, toDisplay }: {
  badges: Badge[];
  comps: CompetitionsApi;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}) {
  const [openBadge, setOpenBadge] = useState<Badge | null>(null);
  const volFmt = useMemo(() => makeVolFmt(unit, toDisplay), [unit, toDisplay]);
  if (badges.length === 0) return null;
  return (
    <div>
      <p className="text-[17px] font-bold te-t1 tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>
        Badge case
      </p>
      <div className="te-panel rounded-te-md px-4 py-4">
        <div className="flex flex-wrap gap-4">
          {badges.map(b => {
            const meta = TIER_META[b.tier];
            const Icon = meta.Icon;
            const comp = b.competition_id ? comps.competitions.find(c => c.id === b.competition_id) : null;
            return (
              <button
                key={b.id}
                onClick={() => setOpenBadge(b)}
                className="flex flex-col items-center gap-1.5 w-16 active:opacity-70 transition-opacity"
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 48, height: 48, background: 'var(--te-border)', border: `1px solid ${meta.color}55` }}
                >
                  <Icon className="w-6 h-6" style={{ color: meta.color }} strokeWidth={1.75} />
                </div>
                <span className="te-label text-center leading-tight truncate w-full">
                  {comp ? comp.name : meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <BadgeDetailSheet badge={openBadge} comps={comps} volFmt={volFmt} onClose={() => setOpenBadge(null)} />
    </div>
  );
}

// ── Standings list (detail sheet, 3+ players) ───────────────────
function StandingsList({ track, rows, volFmt }: {
  track: CompetitionTrack;
  rows: CompetitionStanding[];
  volFmt: VolFmt;
}) {
  return (
    <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">
      {rows.map((r, i) => {
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
                {r.scored_days} day{r.scored_days === 1 ? '' : 's'} logged
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-1.5">
              {track === 'streak' && r.score !== null && (
                <FireIcon className="w-4 h-4" style={{ color: rank === 1 ? 'var(--te-danger)' : 'var(--te-text-1)' }} />
              )}
              <span className="te-digit text-[20px] font-bold tabular-nums te-t1">
                {valueText(track, r, volFmt)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Head-to-head duel layout (detail sheet) ─────────────────────
// Most competitions are 1v1. A ranked list renders a duel as two rows that can
// both say "1", which reads broken — instead a duel gets a face-off: both
// players side by side, big values, and a tug-of-war bar showing who leads.

// My share of the tug bar, 0..1. Both tracks now rank on non-negative totals,
// so a simple proportional split works.
function duelShare(me: number | null, them: number | null): number {
  if (me === null && them === null) return 0.5;
  // Any score beats no score — show a modest lead rather than comparing
  // against an implied 0.
  if (them === null) return 0.62;
  if (me === null) return 0.38;
  // Competitions finalized under the old %Δ scoring carry negative frozen
  // scores, which a proportional split would invert — show a plain lead.
  if (me < 0 || them < 0) return me > them ? 0.62 : me < them ? 0.38 : 0.5;
  if (me === 0 && them === 0) return 0.5;
  return Math.max(0.08, Math.min(0.92, me / (me + them)));
}

function duelStatusLine(me: CompetitionStanding, them: CompetitionStanding, done: boolean): string {
  const a = scoreValue(me);
  const b = scoreValue(them);
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

function DuelFaceOff({ track, me, them, volFmt, done }: {
  track: CompetitionTrack;
  me: CompetitionStanding;
  them: CompetitionStanding;
  volFmt: VolFmt;
  done: boolean;
}) {
  const a = scoreValue(me);
  const b = scoreValue(them);
  const iLead = (a ?? -Infinity) > (b ?? -Infinity);
  const share = duelShare(a, b);

  return (
    <div>
      <DuelBody track={track} me={me} them={them} volFmt={volFmt} names />

      {/* Tug-of-war bar — your side fills from the left. */}
      <div className="mt-4 rounded-full overflow-hidden flex" style={{ height: 5, background: 'var(--te-border)' }}>
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
        {duelStatusLine(me, them, done)}
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

// ── Seasons ─────────────────────────────────────────────────────
// A "season" is the running series of completed duels against the same
// opponent on the same track. Computed entirely client-side from cached
// standings (cards fetch them anyway), so it needs no schema change.
export interface SeasonRecord {
  wins: number;
  losses: number;
  ties: number;
  rounds: number;
  opponentId: string;
  opponentName: string;
}

function seasonRecordFor(
  competitions: CompetitionSummary[],
  getCachedStandings: CompetitionsApi['getCachedStandings'],
  track: CompetitionTrack,
  opponentId: string,
): SeasonRecord | null {
  let wins = 0, losses = 0, ties = 0, rounds = 0;
  let opponentName = '';
  for (const c of competitions) {
    if (c.status !== 'completed' || c.track !== track) continue;
    const rows = getCachedStandings(c.id);
    if (!rows) continue;
    const pair = duelPair(rows);
    if (!pair || pair.them.user_id !== opponentId) continue;
    rounds++;
    opponentName = pair.them.display_name || pair.them.username;
    const a = scoreValue(pair.me) ?? -Infinity;
    const b = scoreValue(pair.them) ?? -Infinity;
    if (a > b) wins++;
    else if (b > a) losses++;
    else ties++;
  }
  if (rounds < 2) return null; // one match isn't a season yet
  return { wins, losses, ties, rounds, opponentId, opponentName };
}

function seasonLine(rec: SeasonRecord): string {
  const score = `${rec.wins}–${rec.losses}${rec.ties > 0 ? ` (${rec.ties} tied)` : ''}`;
  if (rec.wins > rec.losses) return `Season vs ${rec.opponentName}: you lead ${score}`;
  if (rec.losses > rec.wins) return `Season vs ${rec.opponentName}: ${rec.opponentName} leads ${rec.losses}–${rec.wins}${rec.ties > 0 ? ` (${rec.ties} tied)` : ''}`;
  return `Season vs ${rec.opponentName}: level at ${score}`;
}

// The most recent completed duel (last 7 days) with no follow-up yet — the
// hook for the "continue the season" prompt.
function findSeasonContinuation(comps: CompetitionsApi): {
  comp: CompetitionSummary;
  opponent: CompetitionStanding;
  round: number;
} | null {
  const completedDuels = comps.competitions
    .filter(c => c.status === 'completed' && c.participant_count === 2)
    .sort((a, b) => new Date(b.end_at).getTime() - new Date(a.end_at).getTime());
  for (const c of completedDuels) {
    if (Date.now() - new Date(c.end_at).getTime() > 7 * 86400000) break;
    const rows = comps.getCachedStandings(c.id);
    const pair = rows ? duelPair(rows) : null;
    if (!pair) continue;
    // Skip when a rematch on this track is already running or pending.
    const hasSuccessor = comps.competitions.some(x => {
      if (x.id === c.id || x.track !== c.track) return false;
      if (x.status !== 'active' && x.status !== 'pending') return false;
      const xr = comps.getCachedStandings(x.id);
      if (x.participant_count !== 2) return false;
      if (!xr) return true; // unknown standings on a live comp → play safe, don't nag
      const xp = duelPair(xr);
      return !xp || xp.them.user_id === pair.them.user_id;
    });
    if (hasSuccessor) continue;
    let round = 1;
    for (const x of comps.competitions) {
      if (x.status !== 'completed' || x.track !== c.track || x.id === c.id) continue;
      const xr = comps.getCachedStandings(x.id);
      const xp = xr ? duelPair(xr) : null;
      if (xp && xp.them.user_id === pair.them.user_id) round++;
    }
    return { comp: c, opponent: pair.them, round: round + 1 };
  }
  return null;
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
  open, comp, comps, volFmt, onClose, onRematch,
}: {
  open: boolean;
  comp: CompetitionSummary | null;
  comps: CompetitionsApi;
  volFmt: VolFmt;
  onClose: () => void;
  onRematch: (comp: CompetitionSummary, rows: CompetitionStanding[]) => void;
}) {
  const [rows, setRows] = useState<CompetitionStanding[]>([]);
  const [loading, setLoading] = useState(true);
  // Depend on the stable fetcher, never the whole api object — `comps` gets a
  // fresh identity on every render of the hook, which would refire this.
  const { getStandings } = comps;
  const compId = comp?.id ?? null;

  const loadRows = useCallback(() => {
    if (!compId) return;
    return getStandings(compId).then(r => setRows(r));
  }, [compId, getStandings]);

  useEffect(() => {
    if (!open || !compId) return;
    let alive = true;
    setLoading(true);
    getStandings(compId).then(r => { if (alive) { setRows(r); setLoading(false); } });
    return () => { alive = false; };
  }, [open, compId, getStandings]);

  // Season record for a finished duel. Standings for the earlier rounds have
  // to be fetched before the tally can be counted — the cache only holds what
  // has already been rendered.
  const [season, setSeason] = useState<SeasonRecord | null>(null);
  const competitions = comps.competitions;
  const { getCachedStandings } = comps;
  useEffect(() => {
    const pair = duelPair(rows);
    if (!open || !comp || comp.status !== 'completed' || !pair) { setSeason(null); return; }
    let alive = true;
    const priorRounds = competitions
      .filter(c => c.status === 'completed' && c.track === comp.track && c.participant_count === 2)
      .slice(0, 10);
    Promise.all(priorRounds.map(c => getStandings(c.id))).then(() => {
      if (alive) setSeason(seasonRecordFor(competitions, getCachedStandings, comp.track, pair.them.user_id));
    });
    return () => { alive = false; };
  }, [open, comp, rows, competitions, getStandings, getCachedStandings]);

  if (!comp) return null;
  const done = comp.status === 'completed';
  const title = done ? 'Results' : comp.name;

  return (
    // No height floor: the sheet's own content plus the safe-area padding now
    // gives it the right presence, and forcing a minimum only added dead space
    // under the last row.
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-center justify-between px-0.5">
          <div>
            <p className="te-label">
              {trackLabel(comp.track)} · {playersLabel(comp.participant_count)} · started {fmtStarted(comp.start_at)}
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
            <p className="text-[15px] font-semibold te-t1">Waiting for friends</p>
            <p className="text-[13px] te-t3 mt-1 leading-snug">Starts the moment a friend accepts.</p>
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
                      <DuelFaceOff track={comp.track} me={pair.me} them={pair.them} volFmt={volFmt} done={done} />
                    </div>
                  )
                  : <StandingsList track={comp.track} rows={rows} volFmt={volFmt} />;
              })()
        )}

        {(comp.status === 'active' || comp.status === 'completed') && !loading && (
          <p className="te-label px-0.5 leading-relaxed" style={{ color: 'var(--te-text-4)' }}>
            {comp.track === 'streak'
              ? 'Scored on your current workout streak — keep it alive through the finish.'
              : 'Scored as total working-set volume lifted during the competition. Flagged outlier sets don\'t count.'}
          </p>
        )}

        {(comp.status === 'pending' || comp.status === 'active') && !loading && (
          <CancelVote comp={comp} rows={rows} comps={comps} onVoted={loadRows} />
        )}

        {done && (
          <>
            {season && (
              <p className="te-label text-center" style={{ color: 'var(--te-text-3)' }}>
                {seasonLine(season)}
              </p>
            )}
            <button
              onClick={() => { feedback.log(); onRematch(comp, rows); }}
              className="te-white-btn w-full rounded-te-md font-semibold text-[15px]"
              style={{ height: 48 }}
            >
              {season ? `Run it back · Round ${season.rounds + 1}` : 'Rematch'}
            </button>
          </>
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
  const [track, setTrack] = useState<CompetitionTrack>('volume');
  const [days, setDays] = useState<number>(7);
  const [customDays, setCustomDays] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(seed?.name ?? '');
    // Seeds from legacy competitions may carry a retired track — fall back.
    setTrack(seed?.track === 'streak' || seed?.track === 'volume' ? seed.track : 'volume');
    setDays(seed?.days ?? 7);
    setCustomDays(seed && !DURATIONS.includes(seed.days as 7) ? String(seed.days) : '');
    setSelected(new Set(seed?.participantIds ?? []).size <= MAX_PLAYERS - 1
      ? new Set(seed?.participantIds ?? [])
      : new Set((seed?.participantIds ?? []).slice(0, MAX_PLAYERS - 1)));
    setError(null);
  }, [open, seed]);

  const isCustom = !DURATIONS.includes(days as 7);
  const effectiveDays = isCustom ? Math.max(1, Math.min(365, parseInt(customDays || '0', 10) || 0)) : days;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setError(null);
      } else {
        if (next.size >= MAX_PLAYERS - 1) {
          setError(`Competitions cap out at ${MAX_PLAYERS} players.`);
          return prev;
        }
        setError(null);
        next.add(id);
      }
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
      setError(
        res.reason === 'no_participants' ? 'Those friends could not be invited.'
        : res.reason === 'too_many_players' ? `Competitions cap out at ${MAX_PLAYERS} players.`
        : 'Could not create — try again.',
      );
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
            {(['volume', 'streak'] as const).map(t => (
              <ToggleButton key={t} active={track === t} onClick={() => setTrack(t)} label={t} heightPx={44} />
            ))}
          </div>
          <p className="te-label mt-2 px-0.5 leading-relaxed" style={{ color: 'var(--te-text-4)' }}>
            {track === 'volume'
              ? 'Who lifts the most — total working-set volume while the competition runs.'
              : 'Who keeps the longest workout streak alive by the finish.'}
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
          <p className="te-label mb-2 px-0.5">
            Players{selected.size > 0 && ` · ${selected.size + 1}/${MAX_PLAYERS}`}
          </p>
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
          Starts when a friend accepts
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

// ── Active / completed card ─────────────────────────────────────
// Figma competition card: name + track/players subtitle, countdown tag, then
// the players themselves — a face-off row for duels, a 3-column avatar grid
// for 3–6 players. Values are the raw totals (kg / streak days).
function CompetitionCard({ comp, comps, volFmt, onOpen }: {
  comp: CompetitionSummary;
  comps: CompetitionsApi;
  volFmt: VolFmt;
  onOpen: () => void;
}) {
  const [rows, setRows] = useState<CompetitionStanding[]>([]);
  const { getStandings } = comps;

  useEffect(() => {
    if (comp.status !== 'active' && comp.status !== 'completed') return;
    let alive = true;
    getStandings(comp.id).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [comp.id, comp.status, getStandings]);

  const live = comp.status === 'active' || comp.status === 'completed';
  const accepted = rows.filter(r => r.status === 'accepted');
  const pair = duelPair(rows);

  return (
    // p-4 + px-0.5 on the content mirrors the Leaderboard card, so both
    // sections' contents start on the same vertical line.
    <button
      onClick={onOpen}
      className="te-panel w-full rounded-te-md p-4 text-left active:bg-white/[0.04] transition-colors"
    >
      {/* Header — name, track · players, status tag */}
      <div className="flex items-start gap-2.5 px-0.5">
        <div className="flex-1 min-w-0">
          <p className="te-section te-t1 truncate">{comp.name}</p>
          <p className="te-label mt-2">
            {trackLabel(comp.track)} · {playersLabel(comp.participant_count)}
          </p>
        </div>
        <CardTag comp={comp} />
      </div>

      {/* Duel → face-off across the vs divider */}
      {live && pair && (
        <div className="mt-4 px-0.5">
          <DuelBody track={comp.track} me={pair.me} them={pair.them} volFmt={volFmt} />
        </div>
      )}

      {/* 3–6 players → avatar grid with rank badges */}
      {live && !pair && accepted.length > 0 && (
        <div className="mt-4 px-0.5">
          <GridBody track={comp.track} rows={accepted} volFmt={volFmt} />
        </div>
      )}

      {/* Pending — a single quiet line */}
      {comp.status === 'pending' && (
        <p className="text-[13px] te-t3 mt-2.5 px-0.5">Waiting for friends to accept</p>
      )}
    </button>
  );
}

// ── Section (mounted inside ProfilePage) ────────────────────────
export function CompetitionsSection({ comps, friendsList, unit, toDisplay }: {
  comps: CompetitionsApi;
  friendsList: ProfileLite[];
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [seed, setSeed] = useState<{ track: CompetitionTrack; participantIds: string[]; days: number; name: string } | null>(null);
  // Looked up by id (not a static snapshot) so the sheet reflects live status
  // changes — e.g. it flips straight to "Cancelled" the instant a mutual
  // cancel vote lands, without needing to be closed and reopened.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? comps.competitions.find(c => c.id === detailId) ?? null : null;

  const volFmt = useMemo(() => makeVolFmt(unit, toDisplay), [unit, toDisplay]);

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

  // "Continue the season" — recomputes as card fetches fill the standings
  // cache (standingsVersion in deps via getCachedStandings identity).
  const continuation = useMemo(
    () => findSeasonContinuation(comps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comps.competitions, comps.getCachedStandings],
  );

  const startContinuation = useCallback(() => {
    if (!continuation) return;
    const { comp, opponent } = continuation;
    const days = Math.max(1, Math.round((new Date(comp.end_at).getTime() - new Date(comp.start_at).getTime()) / 86400000));
    feedback.log();
    setSeed({ track: comp.track, participantIds: [opponent.user_id], days, name: comp.name });
    setCreateOpen(true);
  }, [continuation]);

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
            Challenge friends to a volume or streak battle — up to {MAX_PLAYERS} players.
          </p>
        </button>
      ) : (
        <div className="space-y-2.5">
          {invites.map(c => <InviteCard key={c.id} comp={c} comps={comps} />)}

          {/* Season continuation prompt — one tap seeds the next round */}
          {continuation && (
            <div className="te-panel-dark rounded-te-md px-4 py-3.5 flex items-center gap-3">
              <Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--te-gold)' }} strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">Continue the season?</p>
                <p className="te-label mt-0.5 truncate">
                  Round {continuation.round} vs {continuation.opponent.display_name || continuation.opponent.username}
                </p>
              </div>
              <button
                onClick={startContinuation}
                className="shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold active:opacity-80 transition-opacity"
                style={{ background: '#f4f1ec', color: 'var(--te-ink)' }}
              >
                Start
              </button>
            </div>
          )}

          {active.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} volFmt={volFmt} onOpen={() => setDetailId(c.id)} />)}
          {pendingMine.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} volFmt={volFmt} onOpen={() => setDetailId(c.id)} />)}
          {completed.map(c => <CompetitionCard key={c.id} comp={c} comps={comps} volFmt={volFmt} onOpen={() => setDetailId(c.id)} />)}
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
        volFmt={volFmt}
        onClose={() => setDetailId(null)}
        onRematch={onRematch}
      />
    </div>
  );
}

// ── Mini widget for the Progress page ───────────────────────────
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

  // One line of standing context ("You lead" / "Jānis leads") so the banner
  // answers am-I-winning without a trip into the profile.
  const [status, setStatus] = useState<string | null>(null);
  const { getStandings } = comps;
  useEffect(() => {
    if (!soonest) { setStatus(null); return; }
    let alive = true;
    getStandings(soonest.id).then(rows => {
      if (!alive) return;
      const accepted = rows.filter(r => r.status === 'accepted');
      const me = accepted.find(r => r.is_self);
      if (!me || accepted.length < 2) { setStatus(null); return; }
      const mine = scoreValue(me);
      const best = Math.max(...accepted.filter(r => !r.is_self).map(r => scoreValue(r) ?? -Infinity));
      if (mine === null && best === -Infinity) { setStatus('No scores yet'); return; }
      if ((mine ?? -Infinity) > best) { setStatus('You lead'); return; }
      if ((mine ?? -Infinity) === best) { setStatus('Tied for the lead'); return; }
      const leader = accepted.filter(r => !r.is_self).sort((a, b) => (scoreValue(b) ?? -Infinity) - (scoreValue(a) ?? -Infinity))[0];
      setStatus(`${leader.display_name || leader.username} leads`);
    });
    return () => { alive = false; };
    // Re-check when the competition changes; getStandings is stable.
  }, [soonest?.id, getStandings]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <span className="te-label shrink-0 whitespace-nowrap" style={urgent ? { color: 'var(--te-warn)' } : undefined}>
        ends {fmtLeft(soonest.end_at, '')}
      </span>
      <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
    </button>
  );
}
