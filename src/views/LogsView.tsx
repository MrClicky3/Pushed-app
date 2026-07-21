import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { QueueListIcon, PlusIcon, CheckIcon, ChevronDownIcon, ForwardIcon, XMarkIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { BookOpenIcon, StarIcon } from '@heroicons/react/24/solid';
import EmptyState from '../components/EmptyState';
import { CoffeeIcon } from '../components/Icons';
import ExerciseLibraryModal from '../components/ExerciseLibraryModal';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import type { LibraryExercise } from '../data/exerciseLibrary';
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';
import type { WeightUnit, WeekStartDay } from '../hooks/useSettings';
import type { useCompetitions } from '../hooks/useCompetitions';
import type { useFistBumps, BumpSender } from '../hooks/useFistBumps';
import Avatar from '../components/Avatar';
import { feedback } from '../lib/feedback';
import { loadDaySet, saveDaySet, saveWorkoutDoneAt, isWorkoutDone } from '../lib/skips';
import { dayCompletionPct } from '../lib/streak';
import { baselineFor, todayKey as compTodayKey } from '../lib/compSnapshots';
import { buildPREvents, prEventsOn, prEventsThisWeek, prLabel } from '../lib/prs';

interface Props {
  logs: WorkoutLog[];
  exercises: Exercise[];
  onAdd: () => void;
  onAddForExercise: (exercise: Exercise) => void;
  onEdit: (log: WorkoutLog) => void;
  onDelete: (id: string) => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  routines: Routine[];
  schedule: ScheduleDay[];
  focusMode?: boolean;
  weekStartDay?: WeekStartDay;
  onCreateRoutine: () => void;
  /** Jumps to Exercises and opens the add form. A routine needs exercises to
      put in it, so with none the card below offers this instead. */
  onCreateExercise: () => void;
  /** Fired when the day's workout is marked complete (epoch ms). */
  onWorkoutComplete?: (at: number) => void;
  /** Reports whether the selected calendar day is anything other than today.
      Logging is only allowed on today, so this blocks adds. */
  onNonTodaySelectedChange?: (nonToday: boolean) => void;
  competitions?: ReturnType<typeof useCompetitions>;
  fistBumps?: ReturnType<typeof useFistBumps>;
}

// Rest-day cup. An opaque grey rather than the translucent --te-text-4 the
// other empty-state glyphs use: this one is a line drawing with overlapping
// strokes, and at 36% alpha every crossing showed through as a brighter
// patch. Roughly where te-t4 lands over the page black, a shade deeper.
const REST_ICON: React.CSSProperties = { color: '#46443f' };

// Small inline chip on a set row: warmup / drop / PR
function SetBadge({ kind }: { kind: 'warmup' | 'drop' | 'pr' }) {
  const style: Record<string, { text: string; color: string; bg: string }> = {
    warmup: { text: 'Warmup', color: 'var(--te-text-4)', bg: 'var(--te-border)' },
    drop:   { text: 'Drop',   color: 'var(--te-warn)',          bg: 'rgba(255,107,94,0.10)' },
    pr:     { text: 'PR',     color: 'var(--te-success)',                 bg: 'rgba(48,209,88,0.12)' },
  };
  const s = style[kind];
  return (
    <span
      className="te-mono shrink-0"
      style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: s.color, background: s.bg, padding: '2.5px 6px', borderRadius: 9999, lineHeight: 1,
      }}
    >
      {s.text}
    </span>
  );
}

// ── Date helpers ──────────────────────────────────────────────
// Single-letter weekday initial, read directly off the date (not a
// Monday-anchored array) so it stays correct regardless of the configured
// week-start day.
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // indexed by Date#getDay()
function dayInitial(d: Date): string {
  return DAY_INITIALS[d.getDay()];
}

function startOfDay(d: Date): Date {
  const n = new Date(d); n.setHours(0, 0, 0, 0); return n;
}
function addDays(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n;
}
// Monday = 0 … Sunday = 6 — the schedule's canonical day-of-week index. This
// is a fixed data-model convention (matches ScheduleDay.day_of_week) and is
// independent of the user's display "start week on" preference.
function dowMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

const WEEK_START_JSDAY: Record<WeekStartDay, number> = { sunday: 0, monday: 1, saturday: 6 };

// Start of the visual week strip containing `d`, anchored to the configured
// start-of-week day (purely a display concern — the underlying schedule
// day-of-week indices above are unaffected).
function startOfWeekFor(d: Date, startDay: WeekStartDay): Date {
  const diff = (d.getDay() - WEEK_START_JSDAY[startDay] + 7) % 7;
  return addDays(startOfDay(d), -diff);
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function groupByExercise(logs: WorkoutLog[]): Map<string, WorkoutLog[]> {
  const map = new Map<string, WorkoutLog[]>();
  for (const log of logs) {
    if (!map.has(log.exercise_id)) map.set(log.exercise_id, []);
    map.get(log.exercise_id)!.push(log);
  }
  return map;
}

// ── Single day ring — track + progress arc + centered initial ──
function DayRing({
  date, initial, progress, isToday, isSelected, hasSchedule, onSelect,
}: {
  date: Date;
  initial: string;
  progress: number;      // 0…1
  isToday: boolean;
  isSelected: boolean;
  hasSchedule: boolean;  // a routine is scheduled for this day-of-week
  onSelect: (d: Date) => void;
}) {
  const size = 38;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, progress));

  const arcColor = isToday ? 'var(--te-accent)' : 'var(--te-text-1)';
  // White initial marks a day that's on the routine (or the selected day);
  // other days stay dim.
  const letterColor = isToday
    ? 'var(--te-accent)'
    : hasSchedule || isSelected
    ? 'var(--te-text-1)'
    : 'var(--te-text-4)';

  return (
    <button
      onClick={() => onSelect(date)}
      className="relative flex items-center justify-center shrink-0 active:opacity-70 transition-opacity"
      style={{ width: size, height: size }}
      aria-label={date.toDateString()}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--te-border-strong)" strokeWidth={stroke}
        />
        {progress > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={arcColor} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
        )}
      </svg>
      <span
        className="absolute select-none"
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em', color: letterColor }}
      >
        {initial}
      </span>
      {/* Dot below the ring (outside the circle) — the accent marks today,
          plain off-white marks the selected day */}
      {(isToday || isSelected) && (
        <span
          className="absolute rounded-full"
          style={{ width: 4, height: 4, background: isToday ? 'var(--te-accent)' : 'var(--te-text-1)', bottom: -7, left: '50%', transform: 'translateX(-50%)' }}
        />
      )}
    </button>
  );
}

// One week's row of 7 day rings
function WeekRow({
  weekStart, selectedDate, today, onSelect, progressFor, hasScheduleFor,
}: {
  weekStart: Date;
  selectedDate: Date;
  today: Date;
  onSelect: (d: Date) => void;
  progressFor: (d: Date) => number;
  hasScheduleFor: (d: Date) => boolean;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  return (
    // justify-around (not justify-between) so the half-gap at each week's edge
    // combines with the neighbour's to make the spacing across the week seam
    // match the spacing within a week when swiping between weeks.
    <div className="flex items-center justify-around shrink-0" style={{ width: '33.3333%' }}>
      {days.map(d => (
        <DayRing
          key={keyOf(d)}
          date={d}
          initial={dayInitial(d)}
          progress={progressFor(d)}
          isToday={isSameDay(d, today)}
          isSelected={isSameDay(d, selectedDate)}
          hasSchedule={hasScheduleFor(d)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── 7-day week strip — swipe left/right to change weeks ────────
// A three-week track (prev · current · next) that follows the finger and
// snaps continuously into the neighbouring week based on swipe direction.
function WeekCalendar({
  weekStart, selectedDate, today, onSelect, onShiftWeek, progressFor, hasScheduleFor,
}: {
  weekStart: Date;
  selectedDate: Date;
  today: Date;
  onSelect: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
  progressFor: (d: Date) => number;
  hasScheduleFor: (d: Date) => boolean;
}) {
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const width = useRef(0);
  const pendingShift = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const THRESHOLD = 55;

  const prevWeek = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const nextWeek = useMemo(() => addDays(weekStart, 7), [weekStart]);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = true;
    width.current = containerRef.current?.offsetWidth ?? 0;
    setSnapping(false);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX) + 6) { active.current = false; return; }
    setDx(deltaX);
  }
  function onTouchEnd() {
    if (!active.current) return;
    active.current = false;
    const w = width.current || 1;
    setSnapping(true);
    if (dx <= -THRESHOLD) { pendingShift.current = 1; setDx(-w); }        // reveal next week
    else if (dx >= THRESHOLD) { pendingShift.current = -1; setDx(w); }    // reveal prev week
    else { pendingShift.current = 0; setDx(0); }                          // snap back
  }
  function onTransitionEnd(e: React.TransitionEvent) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (!snapping) return;
    const shift = pendingShift.current;
    pendingShift.current = 0;
    setSnapping(false);
    setDx(0);                                  // recenter without animation
    if (shift !== 0) onShiftWeek(shift);       // adopt the revealed week as current
  }

  return (
    // paddingBottom leaves room for the day dots that sit outside the rings so
    // overflow-hidden (which masks the neighbouring weeks) doesn't clip them.
    <div ref={containerRef} className="overflow-hidden" style={{ touchAction: 'pan-y', paddingBottom: 10 }}>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={onTransitionEnd}
        className="flex items-center"
        style={{
          width: '300%',
          transform: `translateX(calc(-33.3333% + ${dx}px))`,
          transition: snapping ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
          willChange: 'transform',
        }}
      >
        <WeekRow weekStart={prevWeek} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
        <WeekRow weekStart={weekStart} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
        <WeekRow weekStart={nextWeek} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
      </div>
    </div>
  );
}

// ── Swipeable row — swipe right to skip, swipe right again to un-skip ──
function SwipeableRow({ skipped, onToggle, children }: { skipped: boolean; onToggle: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const THRESHOLD = 80;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = true;
    setSnapping(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX) + 6) { active.current = false; return; }
    if (deltaX > 0) setDx(Math.min(deltaX * 0.62, 110));
  }

  function onTouchEnd() {
    active.current = false;
    setSnapping(true);
    if (dx >= THRESHOLD) onToggle();
    setDx(0);
  }

  const progress = Math.min(dx / THRESHOLD, 1);

  return (
    <div style={{ position: 'relative' }}>
      {/* Skip hint revealed behind the card */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 88,
        display: 'flex', alignItems: 'center', paddingLeft: 18, gap: 6,
        opacity: progress,
        transition: snapping ? 'opacity 0.2s ease' : 'none',
        pointerEvents: 'none',
      }}>
        <ForwardIcon style={{ width: 14, height: 14, color: 'var(--te-text-4)', strokeWidth: 2 }} />
        <span style={{
          fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--te-text-4)',
        }}>{skipped ? 'Unskip' : 'Skip'}</span>
      </div>
      {/* Card */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: snapping ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none',
          touchAction: 'pan-y',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Session recap — compact card shown once the workout is complete ────
const RECAP_HEADLINES = [
  'Great session.',
  'Solid work.',
  'Strong session.',
  'Well done.',
  'Crushed it.',
  'Keep building.',
];

function recapStorageKey(suffix: string) {
  const d = new Date();
  return `recap-${suffix}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// One competition's movement today: "62% → 71%" with the name beside it.
interface CompContribution {
  id: string;
  name: string;
  text: string;
  improved: boolean;
}

function SessionRecapCard({
  logs,
  exercises,
  unit,
  toDisplay,
  competitions,
  fistBumps,
}: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  competitions?: ReturnType<typeof useCompetitions>;
  fistBumps?: ReturnType<typeof useFistBumps>;
}) {
  const [headline] = useState(
    () => RECAP_HEADLINES[Math.floor(Math.random() * RECAP_HEADLINES.length)]
  );
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(recapStorageKey('dismissed')) === '1'
  );

  // What today's session did to each active competition — live standings vs
  // the baseline frozen on the day's first fetch. Only rows that actually
  // moved are shown; no movement, no noise.
  const [contribs, setContribs] = useState<CompContribution[]>([]);
  useEffect(() => {
    if (!competitions || dismissed) return;
    const active = competitions.competitions.filter(c => c.status === 'active');
    if (active.length === 0) { setContribs([]); return; }
    let alive = true;
    Promise.all(active.map(async c => {
      const rows = await competitions.getStandings(c.id);
      const me = rows.find(r => r.is_self);
      if (!me) return null;
      const base = baselineFor(c.id);
      if (!base || base.dayKey !== compTodayKey()) return null;
      // Both tracks rank on `score` now: raw kg for volume, streak days.
      const cur = me.score ?? null;
      const prev = base.score;
      if (cur === null || prev === null || Math.round(cur) === Math.round(prev)) return null;
      const fmt = (v: number) => c.track === 'streak'
        ? `${Math.round(v)}d`
        : `${Math.round(toDisplay(v)).toLocaleString()}${unit.toUpperCase()}`;
      return {
        id: c.id,
        name: c.name,
        text: `${fmt(prev)} → ${fmt(cur)}`,
        improved: cur > prev,
      } as CompContribution;
    })).then(rows => {
      if (alive) setContribs(rows.filter((r): r is CompContribution => r !== null));
    });
    return () => { alive = false; };
    // Refetch when today's log count changes — each set can move a standing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitions?.competitions, logs.length, dismissed]);

  // PRs set today, and the running week tally — the toast that flashed during
  // the set becomes a record you can still see afterwards.
  const { todayPRs, weekPRCount } = useMemo(() => {
    const all = buildPREvents(logs);
    return { todayPRs: prEventsOn(all, new Date()), weekPRCount: prEventsThisWeek(all).length };
  }, [logs]);

  // Fist bumps received today (hidden until the migration is live).
  const [bumps, setBumps] = useState<BumpSender[]>([]);
  useEffect(() => {
    if (!fistBumps || dismissed) return;
    let alive = true;
    fistBumps.loadBumpsForMeToday().then(b => { if (alive) setBumps(b); });
    return () => { alive = false; };
  }, [fistBumps, dismissed]);

  function dismiss() {
    localStorage.setItem(recapStorageKey('dismissed'), '1');
    setDismissed(true);
  }

  const { todayLogs, summaries, sentence, score } = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const tLogs = logs.filter(l => {
      const d = new Date(l.created_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    });

    const map = new Map<string, { exercise: Exercise; bestWeight: number; bestReps: number; sets: number }>();
    for (const log of tLogs) {
      const ex = exercises.find(e => e.id === log.exercise_id);
      if (!ex) continue;
      const cur = map.get(log.exercise_id);
      if (!cur) {
        map.set(log.exercise_id, { exercise: ex, bestWeight: log.weight, bestReps: log.reps_done, sets: 1 });
      } else {
        cur.sets++;
        if (log.weight > cur.bestWeight || (log.weight === cur.bestWeight && log.reps_done > cur.bestReps)) {
          cur.bestWeight = log.weight;
          cur.bestReps = log.reps_done;
        }
      }
    }
    const sums = Array.from(map.values());
    const sets = tLogs.length;
    const vol = Math.round(tLogs.reduce((s, l) => s + toDisplay(l.weight) * l.reps_done, 0));
    const exCount = sums.length;
    const sent = `${exCount} exercise${exCount !== 1 ? 's' : ''}, ${sets} set${sets !== 1 ? 's' : ''}, ${vol} ${unit} moved.`;

    let scoreVal: number | null = null;
    if (sums.length > 0) {
      const exScores = sums.map(({ exercise, bestWeight, bestReps, sets: setsLogged }) => {
        const stt = exercise.sets > 0 ? exercise.sets : null;
        const rt = exercise.target_reps > 0 ? exercise.target_reps : null;
        const wt = exercise.weight > 0 ? exercise.weight : null;
        if (!stt && !rt && !wt) return 0.7;
        const parts: number[] = [];
        if (stt) parts.push(Math.min(setsLogged / stt, 1.0));
        if (rt) parts.push(Math.min(bestReps / rt, 1.1));
        if (wt) parts.push(Math.min(bestWeight / wt, 1.1));
        return parts.reduce((a, b) => a + b, 0) / parts.length;
      });
      const overall = exScores.reduce((a, b) => a + b, 0) / exScores.length;
      scoreVal = Math.max(1, Math.min(10, Math.round(overall * 10)));
    }

    return { todayLogs: tLogs, summaries: sums, sentence: sent, score: scoreVal };
  }, [logs, exercises, toDisplay, unit]);

  if (!todayLogs.length || dismissed) return null;

  return (
    <div className="te-panel-dark rounded-te-md overflow-hidden">
      <div className="px-3.5 py-3 flex items-start justify-between gap-3" style={{ background: 'rgba(48,209,88,0.1)' }}>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold te-t1 tracking-tight leading-tight">{headline}</p>
          <p className="text-[13px] mt-1 te-t3 leading-snug">{sentence}</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {score !== null && (
            <div className="flex items-baseline gap-1">
              <span className="text-[17px] font-bold tabular-nums leading-none te-digit" style={{ color: 'var(--te-success)' }}>{score}</span>
              <span className="te-label">/10</span>
            </div>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="p-1 -mr-1 active:opacity-50 transition-opacity"
            style={{ color: 'var(--te-text-4)' }}
            aria-label="Dismiss recap"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {summaries.length > 0 && (
        <div className="divide-y divide-[color:var(--te-border)]" style={{ maxHeight: 110, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as never }}>
          <div className="h-px" style={{ background: 'var(--te-border)' }} />
          {summaries.map(({ exercise, bestWeight, bestReps, sets }) => (
            <div key={exercise.id} className="flex items-center justify-between px-3.5 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold te-t2 tracking-tight truncate">{exercise.name}</p>
                <p className="te-label" style={{ marginTop: 1 }}>
                  {sets} set{sets !== 1 ? 's' : ''}
                </p>
              </div>
              <p className="te-mono text-[10px] font-semibold te-t4 tabular-nums shrink-0 ml-3">
                {toDisplay(bestWeight)}{unit} × {bestReps}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* PRs set today — the headline achievement of the session */}
      {todayPRs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--te-border)', background: 'rgba(48,209,88,0.06)' }}>
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
            <div className="flex items-center gap-1.5">
              <StarIcon className="w-3.5 h-3.5" style={{ color: 'var(--te-success)' }} />
              <p className="te-label" style={{ color: 'var(--te-success)' }}>
                {todayPRs.length} personal record{todayPRs.length === 1 ? '' : 's'}
              </p>
            </div>
            {weekPRCount > todayPRs.length && (
              <p className="te-label" style={{ color: 'var(--te-text-4)' }}>{weekPRCount} this week</p>
            )}
          </div>
          <div className="pb-2">
            {todayPRs.map(pr => {
              const ex = exercises.find(e => e.id === pr.exerciseId);
              return (
                <div key={pr.logId} className="flex items-center justify-between px-3.5 py-1 gap-3">
                  <p className="text-[13px] font-semibold te-t2 tracking-tight truncate">
                    {ex?.name ?? 'Unknown'}
                  </p>
                  <p className="te-mono text-[11px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--te-success)' }}>
                    {prLabel(pr, unit, toDisplay)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competition movement — what this session did to your standings */}
      {contribs.length > 0 && (
        <div className="divide-y divide-[color:var(--te-border)]" style={{ borderTop: '1px solid var(--te-border)' }}>
          {contribs.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3.5 py-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <TrophyIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--te-gold)' }} />
                <p className="text-[13px] font-semibold te-t2 tracking-tight truncate">{c.name}</p>
              </div>
              <p
                className="te-mono text-[11px] font-semibold tabular-nums shrink-0"
                style={{ color: c.improved ? 'var(--te-success)' : 'var(--te-text-3)' }}
              >
                {c.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Fist bumps received today */}
      {bumps.length > 0 && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderTop: '1px solid var(--te-border)' }}>
          <span className="text-[15px] leading-none">👊</span>
          <div className="flex -space-x-1.5 shrink-0">
            {bumps.slice(0, 4).map(b => (
              <Avatar key={b.id} name={b.display_name || b.username} avatarUrl={b.avatar_url} size={18} />
            ))}
          </div>
          <p className="text-[13px] te-t3 truncate">
            {bumps.map(b => b.display_name || b.username).slice(0, 2).join(' & ')}
            {bumps.length > 2 ? ` +${bumps.length - 2}` : ''} bumped you
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main log view ─────────────────────────────────────────────
type DisplayEntry = { exerciseId: string; exercise: Exercise | undefined; logs: WorkoutLog[] };

export default function LogsView({ logs, exercises, onAdd: _onAdd, onAddForExercise, onEdit, onDelete: _onDelete, unit, toDisplay, routines, schedule, focusMode = false, weekStartDay = 'monday', onCreateRoutine, onCreateExercise, onWorkoutComplete, onNonTodaySelectedChange, competitions, fistBumps }: Props) {
  const [viewLibraryEx, setViewLibraryEx]     = useState<LibraryExercise | null>(null);
  const [noRoutineDismissed, setNoRoutineDismissed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Today (stable across renders within the same day)
  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = useMemo(() => keyOf(today), [today]);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart]       = useState<Date>(() => startOfWeekFor(today, weekStartDay));
  // The Settings sheet can change this while the Log page stays mounted
  // underneath — re-anchor the calendar to the newly configured start day.
  useEffect(() => { setWeekStart(startOfWeekFor(today, weekStartDay)); }, [weekStartDay, today]);

  // Skip + collapse state persist to localStorage (per day) so they survive
  // switching tabs; a new day resets automatically.
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => loadDaySet('skips', todayKey));
  useEffect(() => { saveDaySet('skips', todayKey, skippedIds); }, [skippedIds, todayKey]);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadDaySet('collapsed', todayKey));
  useEffect(() => { saveDaySet('collapsed', todayKey, collapsedIds); }, [collapsedIds, todayKey]);

  // Exercises we've auto-collapsed on completion — lets us avoid fighting a
  // manual re-expand, and re-collapse if an exercise becomes complete again.
  // Persisted so the auto-collapse doesn't re-fire (and override a manual
  // expand) after a tab switch.
  const autoCollapsedRef = useRef<Set<string>>(loadDaySet('autocollapsed', todayKey));
  const persistAuto = useCallback(() => saveDaySet('autocollapsed', todayKey, autoCollapsedRef.current), [todayKey]);

  // Manual "workout complete" for the day — persisted, and read by the recap
  // card below so a session can be finished at any time (>=1 set). One-way:
  // once set, there's no UI path back to incomplete for today.
  const [workoutDone, setWorkoutDone] = useState<boolean>(() => isWorkoutDone(todayKey));
  function completeWorkout() {
    if (workoutDone) return;
    setWorkoutDone(true);
    const at = Date.now();
    saveWorkoutDoneAt(todayKey, at);
    // Lets the header stop its live session counter and show the total.
    onWorkoutComplete?.(at);
    feedback.workoutDone();
  }

  // "Complete workout" is a tap-again-to-confirm button (same pattern as the
  // destructive-delete confirms elsewhere) since completing is irreversible.
  // The armed state auto-reverts after a few seconds since, unlike those
  // modals, this button lives permanently on the page rather than resetting
  // on close.
  const [confirmComplete, setConfirmComplete] = useState(false);
  const confirmCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (confirmCompleteTimer.current) clearTimeout(confirmCompleteTimer.current); }, []);
  function handleCompletePress() {
    if (!confirmComplete) {
      setConfirmComplete(true);
      if (confirmCompleteTimer.current) clearTimeout(confirmCompleteTimer.current);
      confirmCompleteTimer.current = setTimeout(() => setConfirmComplete(false), 3000);
      return;
    }
    if (confirmCompleteTimer.current) clearTimeout(confirmCompleteTimer.current);
    setConfirmComplete(false);
    completeWorkout();
  }

  // Auto-prompt to finish once every planned exercise on a routine day is done
  // or skipped. Dismissible so it doesn't nag; not persisted (a fresh session
  // may want to re-surface it).
  const [promptDismissed, setPromptDismissed] = useState(false);
  function completeFromPrompt() {
    completeWorkout();
    setPromptDismissed(true);
  }

  const isToday = isSameDay(selectedDate, today);
  const isFuture = selectedDate > today && !isToday;

  // Let the shell know when the calendar is parked on any day but today, so
  // the global swipe-add can refuse. A log always lands on "now", so writing
  // one while looking at another day would silently file it somewhere else.
  useEffect(() => { onNonTodaySelectedChange?.(!isToday); }, [isToday, onNonTodaySelectedChange]);
  // Reset on unmount (tab switch) so the block doesn't leak to other tabs.
  useEffect(() => () => onNonTodaySelectedChange?.(false), [onNonTodaySelectedChange]);

  const libraryByName = useMemo(() =>
    new Map(EXERCISE_LIBRARY.map(e => [e.name.toLowerCase(), e])),
  []);

  // Collapsing is always the user's call — including after the workout is
  // finished, and on past days, where reviewing what you did is the whole
  // point of opening the page.
  function toggleCollapsed(id: string) {
    setCollapsedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // Resolve the routine scheduled for a given date's day-of-week
  const routineForDate = useMemo(() => {
    return (date: Date): Routine | null => {
      const entry = schedule.find(s => s.day_of_week === dowMon(date));
      if (!entry?.routine_id) return null;
      return routines.find(r => r.id === entry.routine_id) ?? entry.routines ?? null;
    };
  }, [schedule, routines]);

  // Logs bucketed by calendar day for quick per-day lookups
  const logsByDay = useMemo(() => {
    const map = new Map<string, WorkoutLog[]>();
    for (const log of logs) {
      const k = keyOf(new Date(log.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(log);
    }
    return map;
  }, [logs]);

  // Ring fill for a day = working sets completed / target sets for that day
  const progressFor = useMemo(() => {
    return (date: Date): number => dayCompletionPct(date, logs, schedule, routines, exercises);
  }, [logs, schedule, routines, exercises]);

  // A day "has a schedule" if a routine is assigned to its day-of-week
  const hasScheduleFor = useMemo(() => {
    return (date: Date): boolean => routineForDate(date) != null;
  }, [routineForDate]);

  // iPod scroll depth effect
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    let scrollEl: HTMLElement | null = container.parentElement;
    while (scrollEl) {
      const oy = window.getComputedStyle(scrollEl).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    const update = () => {
      const sRect = scrollEl!.getBoundingClientRect();
      const centerY = sRect.top + sRect.height * 0.44;
      const halfH   = sRect.height * 0.52;
      // Release the fade at the scroll extremes: cards above centre stop
      // fading as you reach the top, cards below stop as you reach the bottom.
      // This is what lets the bottom margin be small — the last card comes to
      // full size when you hit the end instead of needing headroom to scroll
      // itself up to the centre.
      const maxScroll = Math.max(1, scrollEl!.scrollHeight - scrollEl!.clientHeight);
      const topFactor    = Math.min(scrollEl!.scrollTop / 80, 1);
      const bottomFactor = Math.min((maxScroll - scrollEl!.scrollTop) / 80, 1);
      container.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
        const r    = card.getBoundingClientRect();
        const raw  = r.top + r.height / 2 - centerY;
        const dist = raw < 0 ? Math.abs(raw) * topFactor : raw * bottomFactor;
        const norm = Math.min(dist / halfH, 1);
        const ease = norm * norm;
        card.style.transform = `scale(${(1 - ease * 0.09).toFixed(4)})`;
        card.style.opacity   = (1 - ease * 0.58).toFixed(4);
      });
    };
    scrollEl.addEventListener('scroll', update, { passive: true });
    const raf = requestAnimationFrame(update);
    return () => { scrollEl!.removeEventListener('scroll', update); cancelAnimationFrame(raf); };
  }, [logs, selectedDate]);

  // Logs for the currently selected day
  const dayLogs = useMemo(
    () => logsByDay.get(keyOf(selectedDate)) ?? [],
    [logsByDay, selectedDate],
  );

  const selectedRoutine = routineForDate(selectedDate);

  // Working sets don't count warmups toward target completion
  const completedSetsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of dayLogs) {
      if (l.set_type === 'warmup') continue;
      map.set(l.exercise_id, (map.get(l.exercise_id) ?? 0) + 1);
    }
    return map;
  }, [dayLogs]);

  // All-time best working weight from before the selected day — a heavier set that
  // day is a PR
  const selectedStart = useMemo(() => startOfDay(selectedDate).getTime(), [selectedDate]);
  const prevMaxWeights = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      if (l.set_type === 'warmup') continue;
      if (new Date(l.created_at).getTime() >= selectedStart) continue;
      if (l.weight > (map.get(l.exercise_id) ?? 0)) map.set(l.exercise_id, l.weight);
    }
    return map;
  }, [logs, selectedStart]);

  const grouped = useMemo(() => groupByExercise(dayLogs), [dayLogs]);

  // What to render below the calendar:
  //  • Today with a routine → planned routine exercises + any extras logged (interactive)
  //  • Any other day → only the exercises actually logged that day (read-only history)
  const displayEntries: DisplayEntry[] = useMemo(() => {
    const entries: DisplayEntry[] = [];
    if (isToday && selectedRoutine) {
      const seen = new Set<string>();
      for (const exId of selectedRoutine.exercise_ids) {
        const ex = exercises.find(e => e.id === exId);
        if (!ex) continue;
        seen.add(exId);
        entries.push({ exerciseId: exId, exercise: ex, logs: grouped.get(exId) ?? [] });
      }
      for (const [exId, exLogs] of grouped) {
        if (seen.has(exId)) continue;
        entries.push({ exerciseId: exId, exercise: exLogs[0].exercises ?? exercises.find(e => e.id === exId), logs: exLogs });
      }
    } else {
      // Order logged exercises by the day's routine when there is one
      const order = selectedRoutine?.exercise_ids ?? [];
      const seen = new Set<string>();
      for (const exId of order) {
        if (!grouped.has(exId)) continue;
        seen.add(exId);
        entries.push({ exerciseId: exId, exercise: exercises.find(e => e.id === exId), logs: grouped.get(exId)! });
      }
      for (const [exId, exLogs] of grouped) {
        if (seen.has(exId)) continue;
        entries.push({ exerciseId: exId, exercise: exLogs[0].exercises ?? exercises.find(e => e.id === exId), logs: exLogs });
      }
    }
    return entries;
  }, [grouped, selectedRoutine, exercises, isToday]);

  // Today's interactive list is tiered: incomplete on top, then completed,
  // then skipped at the very bottom. Each partition is stable, so finishing,
  // skipping, or un-skipping moves an exercise between tiers without
  // scrambling the rest.
  const orderedEntries: DisplayEntry[] = useMemo(() => {
    if (!isToday) return displayEntries;
    const isDone = (id: string) => {
      const target = exercises.find(e => e.id === id)?.sets ?? 0;
      return target > 0 && (completedSetsMap.get(id) ?? 0) >= target;
    };
    const incomplete: DisplayEntry[] = [];
    const completed: DisplayEntry[] = [];
    const skipped: DisplayEntry[] = [];
    for (const e of displayEntries) {
      if (skippedIds.has(e.exerciseId)) skipped.push(e);
      else if (isDone(e.exerciseId)) completed.push(e);
      else incomplete.push(e);
    }
    return [...incomplete, ...completed, ...skipped];
  }, [displayEntries, skippedIds, isToday, exercises, completedSetsMap]);

  // Auto-collapse an exercise the moment its last set lands (today only), with
  // the existing collapse animation. A manual re-expand sticks; if the exercise
  // later drops below its target again it re-expands so you can keep logging.
  useEffect(() => {
    if (!isToday) return;
    const auto = autoCollapsedRef.current;
    const toCollapse: string[] = [];
    const toExpand: string[] = [];
    for (const { exerciseId, exercise } of displayEntries) {
      const target = exercise?.sets ?? 0;
      const done = target > 0 && (completedSetsMap.get(exerciseId) ?? 0) >= target;
      if (done && !auto.has(exerciseId)) { auto.add(exerciseId); toCollapse.push(exerciseId); }
      else if (!done && auto.has(exerciseId)) { auto.delete(exerciseId); toExpand.push(exerciseId); }
    }
    if (toCollapse.length || toExpand.length) {
      persistAuto();
      setCollapsedIds(prev => {
        const next = new Set(prev);
        toCollapse.forEach(id => next.add(id));
        toExpand.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [completedSetsMap, displayEntries, isToday, persistAuto]);

  // When the workout is marked complete, collapse every exercise. Fires only on
  // the transition into the complete stage so it doesn't fight a user re-opening
  // an incomplete exercise afterwards.
  const wasWorkoutDoneRef = useRef(workoutDone);
  useEffect(() => {
    if (workoutDone && !wasWorkoutDoneRef.current) {
      setCollapsedIds(prev => {
        const next = new Set(prev);
        for (const { exerciseId } of displayEntries) next.add(exerciseId);
        return next;
      });
    }
    wasWorkoutDoneRef.current = workoutDone;
  }, [workoutDone, displayEntries]);

  const selectedLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // On a routine day, the whole session is "complete" once every planned
  // exercise is either done (target sets logged) or skipped.
  const routineComplete = useMemo(() => {
    if (!isToday || !selectedRoutine) return false;
    const ids = selectedRoutine.exercise_ids;
    if (ids.length === 0) return false;
    return ids.every(id => {
      if (skippedIds.has(id)) return true;
      const target = exercises.find(e => e.id === id)?.sets ?? 0;
      if (target <= 0) return true;
      return (completedSetsMap.get(id) ?? 0) >= target;
    });
  }, [isToday, selectedRoutine, skippedIds, exercises, completedSetsMap]);

  const showCompletePrompt = routineComplete && !workoutDone && !promptDismissed;

  return (
    <div className="space-y-4">

      <div
        className="grid"
        style={{ gridTemplateRows: focusMode ? '0fr' : '1fr', transition: 'grid-template-rows 0.36s cubic-bezier(0.22,1,0.36,1)' }}
      >
        <div style={{ overflow: 'hidden', opacity: focusMode ? 0 : 1, transition: `opacity ${focusMode ? '0.15s ease' : '0.3s ease 0.08s'}` }}>
          {/* 7-day calendar — replaces the Upper/Lower filter */}
          <div className="pt-0.5 pb-4">
            <WeekCalendar
              weekStart={weekStart}
              selectedDate={selectedDate}
              today={today}
              onSelect={setSelectedDate}
              onShiftWeek={delta => setWeekStart(prev => addDays(prev, delta * 7))}
              progressFor={progressFor}
              hasScheduleFor={hasScheduleFor}
            />
          </div>

          {/* Selected date + session info */}
          <div className="flex items-center gap-2 pb-2 mb-3" style={{ borderBottom: '1px solid var(--te-border)' }}>
            <p className="te-label" style={{ color: isToday ? 'var(--te-accent)' : 'var(--te-text-3)' }}>
              {isToday ? 'Today' : selectedLabel}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              {selectedRoutine && (
                <p className="te-label" style={{ color: 'var(--te-text-1)' }}>{selectedRoutine.name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding card. A routine is a group of exercises, so with none on
          file "Create a routine" leads straight into a dead end — the builder
          can only tell you to go make an exercise somewhere else. Ask for the
          prerequisite first and only offer the routine once it can be filled. */}
      {routines.length === 0 && !noRoutineDismissed && (
        <div className="te-panel-dark rounded-te-md overflow-hidden">
          <div className="px-4 py-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--te-border)' }}>
              <QueueListIcon className="w-4 h-4 te-t3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold te-t1 tracking-tight">
                {exercises.length === 0 ? 'Start with an exercise' : 'No routine yet'}
              </p>
              {/* Sentence-length copy belongs in te-caption, not te-label —
                  tracked-out uppercase mono wraps to two lines here and reads
                  as a system message rather than a prompt. */}
              <p className="text-[13px] mt-1 te-t3 leading-snug">
                {exercises.length === 0
                  ? 'Add the lifts you train, then group them into a routine.'
                  : 'Plan your week by creating a routine.'}
              </p>
            </div>
            <button
              onClick={() => setNoRoutineDismissed(true)}
              className="p-1 -mr-1 -mt-1 te-t4 active:text-white/50 transition-colors"
              aria-label="Dismiss"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={exercises.length === 0 ? onCreateExercise : onCreateRoutine}
            className="w-full py-3 text-[13px] font-semibold text-center active:bg-white/[0.04] transition-colors"
            style={{ borderTop: '1px solid var(--te-border)', color: 'var(--te-text-1)' }}
          >
            {exercises.length === 0 ? 'Create an exercise' : 'Create a routine'}
          </button>
        </div>
      )}

      {/* Selected day's exercise cards */}
      {displayEntries.length === 0 ? (
        isToday && exercises.length === 0 ? (
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 te-t4" />}
            title="Your exercises will appear here"
            subtitle="Go to Exercises first and create an exercise to start logging."
          />
        ) : isFuture ? (
          // Future day — nothing can be logged here yet. The cup is reserved
          // for a planned rest day; every other state keeps the list glyph.
          <EmptyState
            icon={selectedRoutine
              ? <QueueListIcon className="w-7 h-7 te-t4" />
              : <CoffeeIcon className="w-8 h-8" style={REST_ICON} />}
            title={selectedRoutine ? `${selectedRoutine.name} is planned` : 'Rest day planned'}
            subtitle="This day hasn't happened yet."
          />
        ) : selectedRoutine ? (
          // Day has a planned routine but nothing was recorded
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 te-t4" />}
            title="No workout logged"
            subtitle={isToday ? 'Swipe up to log a workout.' : 'Nothing was recorded on this day.'}
          />
        ) : (
          // Day has no routine scheduled
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 te-t4" />}
            title="Your logs will appear here"
            subtitle="No routine is scheduled for this day."
          />
        )
      ) : (
        <div ref={listRef} className="space-y-3.5">
          {orderedEntries.map(({ exerciseId, exercise, logs: exerciseLogs }) => {
            const targetSets      = exercise?.sets ?? 0;
            const workingLogs     = exerciseLogs.filter(l => l.set_type !== 'warmup');
            const totalSets       = workingLogs.length;
            const displayedWeight = workingLogs.length > 0
              ? toDisplay(workingLogs[0].weight)
              : exerciseLogs.length > 0
              ? toDisplay(exerciseLogs[0].weight)
              : toDisplay(exercise?.weight ?? 0);
            const isDone      = targetSets > 0 && (completedSetsMap.get(exerciseId) ?? 0) >= targetSets;
            const isCollapsed = collapsedIds.has(exerciseId);
            const isSkipped   = skippedIds.has(exerciseId);

            function handleToggleSkip() {
              feedback.skip();
              const wasSkipped = skippedIds.has(exerciseId);
              const toggle = (prev: Set<string>) => {
                const n = new Set(prev);
                if (wasSkipped) n.delete(exerciseId); else n.add(exerciseId);
                return n;
              };
              setSkippedIds(toggle);
              setCollapsedIds(toggle);
              if (wasSkipped) { autoCollapsedRef.current.delete(exerciseId); persistAuto(); }
            }

            const card = (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    className="flex-1 text-left active:opacity-70 transition-opacity min-w-0"
                    onClick={() => toggleCollapsed(exerciseId)}
                  >
                    <div className="flex items-baseline min-w-0">
                      <p className="text-[17px] font-semibold te-t1 tracking-tight truncate min-w-0" style={{ letterSpacing: '-0.01em' }}>
                        {exercise?.name ?? 'Unknown'}
                      </p>
                      {/* set/set counter — smoothly slides in to the right of the
                          name while the card is collapsed */}
                      <span
                        className="te-mono tabular-nums shrink-0 overflow-hidden whitespace-nowrap leading-none"
                        style={{
                          color: isDone ? 'var(--te-success)' : 'var(--te-text-3)',
                          fontSize: 13,
                          maxWidth: isCollapsed ? 64 : 0,
                          opacity: isCollapsed ? 1 : 0,
                          marginLeft: isCollapsed ? 8 : 0,
                          transition: 'max-width 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, margin-left 0.28s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      >
                        {totalSets}{targetSets > 0 ? `/${targetSets}` : ''}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isSkipped ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'var(--te-border)' }}>
                        <ForwardIcon className="w-3 h-3 stroke-[2]" style={{ color: 'var(--te-text-4)' }} />
                        <span className="te-label" style={{ color: 'var(--te-text-4)' }}>Skipped</span>
                      </div>
                    ) : isDone ? (
                      <div
                        key={`done-${exerciseId}`}
                        className="animate-check-pop flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(48,209,88,0.14)' }}
                      >
                        <CheckIcon className="w-3 h-3 stroke-[2.5]" style={{ color: 'var(--te-success)' }} />
                        <span className="te-label" style={{ color: 'var(--te-success)' }}>Done</span>
                      </div>
                    ) : null}
                    {exercise && libraryByName.has(exercise.name.toLowerCase()) && (
                      <button
                        onClick={() => setViewLibraryEx(libraryByName.get(exercise.name.toLowerCase())!)}
                        className="p-1 te-t4 active:text-white/50 transition-colors"
                      >
                        <BookOpenIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => toggleCollapsed(exerciseId)} className="p-1 te-t4 active:text-white/50 transition-colors">
                      <ChevronDownIcon
                        className="w-4 h-4 transition-transform duration-200"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr', transition: 'grid-template-rows 200ms ease' }}>
                  <div style={{ overflow: 'hidden' }}>

                    <div className="te-panel rounded-te-md overflow-hidden mb-2">
                      <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                        <div className="flex flex-col items-center py-3">
                          <span className="text-[20px] font-bold tabular-nums leading-none te-digit" style={{ color: isDone ? 'var(--te-success)' : 'white' }}>
                            {totalSets}{targetSets > 0 && (
                              <span className="text-[20px] font-bold" style={{ color: isDone ? 'var(--te-success)' : 'white' }}>/{targetSets}</span>
                            )}
                          </span>
                          <span className="te-label mt-1.5">sets</span>
                        </div>
                        <div className="flex flex-col items-center py-3">
                          <span className="text-[20px] font-bold te-t1 tabular-nums leading-none te-digit">
                            {displayedWeight}<span className="text-[20px] font-bold te-t1 ml-px">{unit}</span>
                          </span>
                          <span className="te-label mt-1.5">weight</span>
                        </div>
                      </div>
                    </div>

                    {exerciseLogs.length > 0 && (
                      <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.04]">
                        {exerciseLogs.map(log => {
                          const prevMax = prevMaxWeights.get(log.exercise_id) ?? 0;
                          const isPR = log.set_type !== 'warmup' && prevMax > 0 && log.weight > prevMax;
                          return (
                          <button
                            key={log.id}
                            onClick={() => onEdit(log)}
                            className="w-full flex items-center px-4 py-[15px] gap-3 active:bg-white/[0.04] transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex items-baseline gap-1.5 shrink-0">
                                    <span className="te-digit text-[15px] font-semibold te-t2 tabular-nums leading-none">
                                      {log.reps_done}{exercise?.target_reps ? `/${exercise.target_reps}` : ''}
                                    </span>
                                    <span className="te-label">reps</span>
                                  </span>
                                  {log.set_type === 'warmup' && <SetBadge kind="warmup" />}
                                  {log.set_type === 'drop' && <SetBadge kind="drop" />}
                                  {isPR && <SetBadge kind="pr" />}
                                  {log.comment && (
                                    <span className="text-[10px] te-t4 italic truncate">{log.comment}</span>
                                  )}
                                </div>
                                <span className="te-label shrink-0">{formatTime(log.created_at)}</span>
                              </div>
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    )}

                    {exercise && isToday && !isSkipped && !workoutDone && (
                      <button
                        onClick={() => onAddForExercise(exercise)}
                        className="w-full mt-2 py-3.5 rounded-te-sm bg-transparent te-label active:bg-white/[0.03] transition-all flex items-center justify-center gap-1.5"
                      >
                        <PlusIcon className="w-3 h-3" />
                        Add set
                      </button>
                    )}

                  </div>
                </div>
              </>
            );

            return (
              <div
                key={exerciseId}
                data-card
                style={{ transformOrigin: 'center center', willChange: 'transform, opacity', opacity: isSkipped ? 0.45 : undefined }}
              >
                {isToday ? (
                  <SwipeableRow skipped={isSkipped} onToggle={handleToggleSkip}>{card}</SwipeableRow>
                ) : (
                  card
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Complete workout — manual finish for non-routine days (routine days use
          the auto prompt instead). Shown once >=1 working set is logged.
          Tap-again-to-confirm since completing is irreversible for the day.
          Before completion this is the page's primary action, so it gets the
          white button. After completion it is a disabled status, not an action
          — it steps back to a tinted confirmation rather than staying a
          full-bleed saturated green slab that outshouted the content beneath. */}
      {isToday && !selectedRoutine && dayLogs.some(l => l.set_type !== 'warmup') && (
        <button
          onClick={workoutDone ? undefined : handleCompletePress}
          disabled={workoutDone}
          className={`w-full rounded-te-md font-semibold text-[15px] flex items-center justify-center gap-2 select-none ${
            workoutDone ? '' : 'te-white-btn'
          }`}
          style={workoutDone
            ? {
                height: 52,
                background: 'color-mix(in srgb, var(--te-success) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--te-success) 22%, transparent)',
                color: 'var(--te-success)',
              }
            : { height: 52, opacity: confirmComplete ? 0.7 : 1 }}
        >
          {workoutDone
            ? (<><CheckIcon className="w-4 h-4 stroke-[2.5]" /> Workout complete</>)
            : confirmComplete ? 'Tap again to confirm' : 'Complete workout'}
        </button>
      )}

      {isToday && workoutDone && (
        <div className="mt-3">
          <SessionRecapCard logs={logs} exercises={exercises} unit={unit} toDisplay={toDisplay} competitions={competitions} fistBumps={fistBumps} />
        </div>
      )}

      {/* Routine-complete prompt — every planned exercise is done or skipped */}
      {showCompletePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-4"
          style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setPromptDismissed(true)}
          />
          <div className="relative w-full max-w-lg te-panel rounded-te-md px-5 py-5 animate-slide-up z-10">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: 'rgba(48,209,88,0.14)' }}>
                <CheckIcon className="w-3 h-3 stroke-[2.5]" style={{ color: 'var(--te-success)' }} />
              </div>
              <p className="text-[17px] font-semibold te-t1 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                All exercises done
              </p>
            </div>
            <p className="text-[13px] mb-4" style={{ color: 'var(--te-text-3)' }}>
              You've finished every exercise in {selectedRoutine?.name}. Complete this workout?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPromptDismissed(true)}
                className="te-toggle-off flex-1 py-[10px] rounded-te-sm text-[13px] font-semibold select-none"
                style={{ color: 'var(--te-text-3)' }}
              >
                Not yet
              </button>
              <button
                onClick={completeFromPrompt}
                className="te-white-btn flex-1 py-[10px] rounded-te-sm text-[13px] font-semibold select-none"
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}

      <ExerciseLibraryModal
        open={!!viewLibraryEx}
        onClose={() => setViewLibraryEx(null)}
        onSelect={() => {}}
        existingNames={new Set(exercises.map(e => e.name.toLowerCase()))}
        initialSelected={viewLibraryEx ?? undefined}
      />
    </div>
  );
}
