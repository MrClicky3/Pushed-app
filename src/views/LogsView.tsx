import { useState, useMemo, useEffect, useRef } from 'react';
import { QueueListIcon, PlusIcon, CheckIcon, ChevronDownIcon, ForwardIcon } from '@heroicons/react/24/outline';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import EmptyState from '../components/EmptyState';
import ExerciseLibraryModal from '../components/ExerciseLibraryModal';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import type { LibraryExercise } from '../data/exerciseLibrary';
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';
import type { WeightUnit } from '../hooks/useSettings';
import { feedback } from '../lib/feedback';

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
  showDuration?: boolean;
  focusMode?: boolean;
}

// Small inline chip on a set row: warmup / drop / PR
function SetBadge({ kind }: { kind: 'warmup' | 'drop' | 'pr' }) {
  const style: Record<string, { text: string; color: string; bg: string }> = {
    warmup: { text: 'Warmup', color: 'rgba(244,241,236,0.35)', bg: 'rgba(255,255,255,0.05)' },
    drop:   { text: 'Drop',   color: 'var(--te-warn)',          bg: 'rgba(232,166,87,0.10)' },
    pr:     { text: 'PR',     color: '#30d158',                 bg: 'rgba(48,209,88,0.12)' },
  };
  const s = style[kind];
  return (
    <span
      className="te-mono shrink-0"
      style={{
        fontSize: 8.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: s.color, background: s.bg, padding: '2.5px 6px', borderRadius: 100, lineHeight: 1,
      }}
    >
      {s.text}
    </span>
  );
}

// ── Date helpers ──────────────────────────────────────────────
const DOW_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function startOfDay(d: Date): Date {
  const n = new Date(d); n.setHours(0, 0, 0, 0); return n;
}
function addDays(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n;
}
// Monday = 0 … Sunday = 6
function dowMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}
function mondayOf(d: Date): Date {
  return addDays(startOfDay(d), -dowMon(d));
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

function formatSessionAge(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `Started ${mins}m ago`;
  return `Started ${Math.floor(mins / 60)}h ${mins % 60}m ago`;
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
  const size = 34;
  const stroke = 2.4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, progress));

  const arcColor = isToday ? '#ff453a' : '#f4f1ec';
  // White initial marks a day that's on the routine (or the selected day);
  // other days stay dim.
  const letterColor = isToday
    ? '#ff453a'
    : hasSchedule || isSelected
    ? '#f4f1ec'
    : 'rgba(244,241,236,0.35)';

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
          fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke}
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
        style={{ fontSize: 10.7, fontWeight: 600, letterSpacing: '-0.01em', color: letterColor }}
      >
        {initial}
      </span>
      {/* Dot below the ring (outside the circle) — red marks today, white marks
          the selected day */}
      {(isToday || isSelected) && (
        <span
          className="absolute rounded-full"
          style={{ width: 4, height: 4, background: isToday ? '#ff453a' : '#f4f1ec', bottom: -7, left: '50%', transform: 'translateX(-50%)' }}
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
      {days.map((d, i) => (
        <DayRing
          key={keyOf(d)}
          date={d}
          initial={DOW_INITIALS[i]}
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

// ── Swipeable row — swipe right to skip ───────────────────────
function SwipeableRow({ onSkip, children }: { onSkip: () => void; children: React.ReactNode }) {
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
    if (dx >= THRESHOLD) onSkip();
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
        <ForwardIcon style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.35)', strokeWidth: 2 }} />
        <span style={{
          fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
        }}>Skip</span>
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

// ── Main log view ─────────────────────────────────────────────
type DisplayEntry = { exerciseId: string; exercise: Exercise | undefined; logs: WorkoutLog[] };

export default function LogsView({ logs, exercises, onAdd: _onAdd, onAddForExercise, onEdit, onDelete: _onDelete, unit, toDisplay, routines, schedule, showDuration = true, focusMode = false }: Props) {
  const [collapsedIds, setCollapsedIds]       = useState<Set<string>>(new Set());
  const [viewLibraryEx, setViewLibraryEx]     = useState<LibraryExercise | null>(null);
  const [skippedIds, setSkippedIds]           = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // Exercises we've auto-collapsed on completion — lets us avoid fighting a
  // manual re-expand, and re-collapse if an exercise becomes complete again.
  const autoCollapsedRef = useRef<Set<string>>(new Set());

  // Today (stable across renders within the same day)
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart]       = useState<Date>(() => mondayOf(today));

  const isToday = isSameDay(selectedDate, today);

  const libraryByName = useMemo(() =>
    new Map(EXERCISE_LIBRARY.map(e => [e.name.toLowerCase(), e])),
  []);

  function toggleCollapsed(id: string) {
    setCollapsedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
    return (date: Date): number => {
      const dLogs = logsByDay.get(keyOf(date)) ?? [];
      const routine = routineForDate(date);
      const plannedIds = routine
        ? routine.exercise_ids
        : Array.from(new Set(dLogs.map(l => l.exercise_id)));

      let target = 0;
      let done = 0;
      for (const id of plannedIds) {
        const ex = exercises.find(e => e.id === id);
        const t = ex?.sets ?? 0;
        if (t <= 0) continue;
        const working = dLogs.filter(l => l.exercise_id === id && l.set_type !== 'warmup').length;
        target += t;
        done += Math.min(working, t);
      }
      if (target === 0) return dLogs.length > 0 ? 1 : 0;
      return Math.max(0, Math.min(1, done / target));
    };
  }, [logsByDay, routineForDate, exercises]);

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
      container.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
        const r    = card.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - centerY);
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

  const sessionStart = useMemo(() => {
    if (!dayLogs.length) return null;
    return dayLogs.reduce((a, l) => new Date(l.created_at) < new Date(a.created_at) ? l : a).created_at;
  }, [dayLogs]);

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
      setCollapsedIds(prev => {
        const next = new Set(prev);
        toCollapse.forEach(id => next.add(id));
        toExpand.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [completedSetsMap, displayEntries, isToday]);

  const selectedLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  // The whole routine is finished when every planned exercise is done or skipped
  const routineComplete = !!selectedRoutine && selectedRoutine.exercise_ids.every(id => {
    const ex = exercises.find(e => e.id === id);
    if (!ex || ex.sets <= 0) return true;
    const done = (completedSetsMap.get(id) ?? 0) >= ex.sets;
    return done || skippedIds.has(id);
  });

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
          <div className="flex items-center gap-2 pb-2 mb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="te-label" style={{ color: isToday ? '#ff453a' : 'rgba(244,241,236,0.5)' }}>
              {isToday ? 'Today' : selectedLabel}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              {isToday && sessionStart && showDuration && (
                <p className="te-label" style={{ color: 'rgba(244,241,236,0.5)' }}>{formatSessionAge(sessionStart)}</p>
              )}
              {selectedRoutine && (
                <p className="te-label" style={{ color: '#f4f1ec' }}>{selectedRoutine.name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected day's exercise cards */}
      {displayEntries.length === 0 ? (
        isToday && exercises.length === 0 ? (
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 text-apple-label-tertiary" />}
            title="No exercises yet"
            subtitle="Go to Exercises first and create an exercise to start logging."
          />
        ) : selectedRoutine ? (
          // Day has a planned routine but nothing was recorded
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 text-apple-label-tertiary" />}
            title="No workout logged"
            subtitle={isToday ? 'Tap + to log a workout.' : 'Nothing was recorded on this day.'}
          />
        ) : (
          // Day has no routine scheduled
          <EmptyState
            icon={<QueueListIcon className="w-7 h-7 text-apple-label-tertiary" />}
            title="No workout planned"
            subtitle="No routine is scheduled for this day."
          />
        )
      ) : (
        <div ref={listRef} className="space-y-3.5">
          {displayEntries.map(({ exerciseId, exercise, logs: exerciseLogs }) => {
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

            function handleSkip() {
              feedback.skip();
              setSkippedIds(prev => { const n = new Set(prev); n.add(exerciseId); return n; });
              setCollapsedIds(prev => { const n = new Set(prev); n.add(exerciseId); return n; });
            }

            const card = (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    className="flex-1 text-left active:opacity-70 transition-opacity min-w-0"
                    onClick={() => toggleCollapsed(exerciseId)}
                  >
                    <div className="flex items-baseline min-w-0">
                      <p className="text-[16px] font-semibold text-[#f4f1ec] tracking-tight truncate min-w-0" style={{ letterSpacing: '-0.01em' }}>
                        {exercise?.name ?? 'Unknown'}
                      </p>
                      {/* set/set counter — smoothly slides in to the right of the
                          name while the card is collapsed */}
                      <span
                        className="te-mono tabular-nums shrink-0 overflow-hidden whitespace-nowrap leading-none"
                        style={{
                          color: isDone ? '#30d158' : 'rgba(244,241,236,0.5)',
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
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <ForwardIcon className="w-3 h-3 stroke-[2]" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        <span className="te-label" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Skipped</span>
                      </div>
                    ) : isDone ? (
                      <div
                        key={`done-${exerciseId}`}
                        className="animate-check-pop flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(48,209,88,0.14)' }}
                      >
                        <CheckIcon className="w-3 h-3 stroke-[2.5]" style={{ color: '#30d158' }} />
                        <span className="te-label" style={{ color: '#30d158', fontSize: 10 }}>Done</span>
                      </div>
                    ) : null}
                    {exercise && libraryByName.has(exercise.name.toLowerCase()) && (
                      <button
                        onClick={() => setViewLibraryEx(libraryByName.get(exercise.name.toLowerCase())!)}
                        className="p-1 text-white/25 active:text-white/60 transition-colors"
                      >
                        <BookOpenIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => toggleCollapsed(exerciseId)} className="p-1 text-white/20 active:text-white/50 transition-colors">
                      <ChevronDownIcon
                        className="w-4 h-4 transition-transform duration-200"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                      />
                    </button>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr', transition: 'grid-template-rows 200ms ease' }}>
                  <div style={{ overflow: 'hidden' }}>

                    <div className="te-panel rounded-2xl overflow-hidden mb-2">
                      <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                        <div className="flex flex-col items-center py-3">
                          <span className="text-[20px] font-bold tabular-nums leading-none te-digit" style={{ color: isDone ? '#30d158' : 'white' }}>
                            {totalSets}{targetSets > 0 && (
                              <span className="text-[20px] font-bold" style={{ color: isDone ? '#30d158' : 'white' }}>/{targetSets}</span>
                            )}
                          </span>
                          <span className="te-label mt-1.5">sets</span>
                        </div>
                        <div className="flex flex-col items-center py-3">
                          <span className="text-[20px] font-bold text-white tabular-nums leading-none te-digit">
                            {displayedWeight}<span className="text-[20px] font-bold text-white ml-px">{unit}</span>
                          </span>
                          <span className="te-label mt-1.5">weight</span>
                        </div>
                      </div>
                    </div>

                    {exerciseLogs.length > 0 && (
                      <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
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
                                  <span className="te-mono text-[14px] font-normal text-white/45 tabular-nums leading-none">
                                    {log.reps_done}{exercise?.target_reps ? `/${exercise.target_reps}` : ''} reps
                                  </span>
                                  {log.set_type === 'warmup' && <SetBadge kind="warmup" />}
                                  {log.set_type === 'drop' && <SetBadge kind="drop" />}
                                  {isPR && <SetBadge kind="pr" />}
                                  {log.comment && (
                                    <span className="text-[11px] text-white/25 italic truncate">{log.comment}</span>
                                  )}
                                </div>
                                <span className="te-label shrink-0" style={{ fontSize: 9 }}>{formatTime(log.created_at)}</span>
                              </div>
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    )}

                    {exercise && isToday && !isSkipped && (
                      <button
                        onClick={() => onAddForExercise(exercise)}
                        className="w-full mt-2 py-3.5 rounded-xl bg-transparent te-label active:bg-white/[0.03] transition-all flex items-center justify-center gap-1.5"
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
                  <SwipeableRow onSkip={handleSkip}>{card}</SwipeableRow>
                ) : (
                  card
                )}
              </div>
            );
          })}

          {/* Workout summary — only on the Log page for a routine day (today),
              once something has been skipped or the whole routine is complete */}
          {isToday && selectedRoutine && (skippedIds.size > 0 || routineComplete) && (
            <div className="te-panel rounded-2xl px-4 py-3.5 space-y-2" style={{ opacity: 0.8 }}>
              <p className="te-label" style={{ color: 'rgba(244,241,236,0.4)' }}>Workout summary</p>
              {displayEntries.map(({ exerciseId, exercise }) => {
                const done    = (completedSetsMap.get(exerciseId) ?? 0) >= (exercise?.sets ?? 0) && (exercise?.sets ?? 0) > 0;
                const skipped = skippedIds.has(exerciseId);
                if (!done && !skipped) return null;
                return (
                  <div key={exerciseId} className="flex items-center gap-2">
                    {done ? (
                      <CheckIcon className="w-3 h-3 shrink-0 stroke-[2.5]" style={{ color: '#30d158' }} />
                    ) : (
                      <ForwardIcon className="w-3 h-3 shrink-0 stroke-[2]" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    )}
                    <span className="text-[13px]" style={{ color: done ? 'rgba(244,241,236,0.6)' : 'rgba(244,241,236,0.25)', letterSpacing: '-0.01em' }}>
                      {exercise?.name ?? 'Unknown'}
                    </span>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          )}
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
