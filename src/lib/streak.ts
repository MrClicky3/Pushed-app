// Streak / completion logic — the single source of truth for "did the user
// complete their scheduled routine on a given day". Used by AnalyticsView for
// the streak card and by the social layer to push stats to the leaderboard.
//
// A day counts as completed when it has a scheduled routine and every routine
// exercise has >= its target sets of logs at reps_done >= target_reps.
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function buildCompletedDays(
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
): Set<string> {
  // Group logs by day key
  const logsByDay = new Map<string, WorkoutLog[]>();
  for (const l of logs) {
    const key = dayKey(new Date(l.created_at));
    if (!logsByDay.has(key)) logsByDay.set(key, []);
    logsByDay.get(key)!.push(l);
  }

  const completed = new Set<string>();

  for (const [dk, dayLogs] of logsByDay) {
    const [y, m, d] = dk.split('-').map(Number);
    const date = new Date(y, m, d);
    // Mon=0 … Sun=6
    const dow = (date.getDay() + 6) % 7;

    const entry = schedule.find(s => s.day_of_week === dow);
    if (!entry?.routine_id) continue; // rest day — doesn't count

    const routine = routines.find(r => r.id === entry.routine_id);
    if (!routine || routine.exercise_ids.length === 0) continue;

    let allDone = true;
    for (const exId of routine.exercise_ids) {
      const ex = exercises.find(e => e.id === exId);
      if (!ex) continue; // deleted exercise — skip check
      const done = dayLogs.filter(l => l.exercise_id === exId && l.reps_done >= ex.target_reps).length;
      if (done < ex.sets) { allDone = false; break; }
    }

    if (allDone) completed.add(dk);
  }

  return completed;
}

// Whole-day set completion: working sets logged across every planned exercise
// that day (routine's exercise_ids if one's scheduled, else whatever was
// actually logged) divided by their target sets. Mirrors the day-ring math on
// the Log page and backs the Overall progress chart.
export function dayCompletionPct(
  date: Date,
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
): number {
  const dk = dayKey(date);
  const dow = (date.getDay() + 6) % 7;
  const dLogs = logs.filter(l => dayKey(new Date(l.created_at)) === dk);

  const entry = schedule.find(s => s.day_of_week === dow);
  const routine = entry?.routine_id ? routines.find(r => r.id === entry.routine_id) : null;
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
}

// Is a routine (with exercises) scheduled on this date's weekday?
export function isScheduledDay(
  date: Date,
  schedule: ScheduleDay[],
  routines: Routine[],
): boolean {
  const dow = (date.getDay() + 6) % 7;
  const entry = schedule.find(s => s.day_of_week === dow);
  const routine = entry?.routine_id ? routines.find(r => r.id === entry.routine_id) : null;
  return !!routine && routine.exercise_ids.length > 0;
}

// Streak semantics: only *scheduled* days can break the streak. Rest days are
// neutral — they neither count nor break — unless the user trained anyway
// (>=1 working set), which credits a bonus day. A scheduled day counts when
// the full routine was completed.
//   credited  = scheduled+completed, or unscheduled+trained
//   breaking  = scheduled+not completed (except today, which is still open)
//   neutral   = unscheduled+untrained
export function calcStreak(
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
) {
  const completedDays = buildCompletedDays(logs, schedule, routines, exercises);

  // Days with at least one working set — credits unscheduled training days.
  const trainedDays = new Set<string>();
  let earliest: Date | null = null;
  for (const l of logs) {
    if (l.set_type === 'warmup') continue;
    const d = new Date(l.created_at);
    trainedDays.add(dayKey(d));
    if (!earliest || d < earliest) earliest = d;
  }

  const now = new Date();
  const todayKey = dayKey(now);
  // Rest-day forgiveness only makes sense when a schedule exists to define
  // rest days. Without any schedule, the streak falls back to the classic
  // rule: consecutive trained days, any idle day breaks it.
  const hasAnySchedule = schedule.some(s => {
    const r = s.routine_id ? routines.find(x => x.id === s.routine_id) : null;
    return !!r && r.exercise_ids.length > 0;
  });
  type DayState = 'credited' | 'breaking' | 'neutral';
  const stateOf = (d: Date): DayState => {
    const k = dayKey(d);
    if (isScheduledDay(d, schedule, routines)) {
      if (completedDays.has(k)) return 'credited';
      // Today's scheduled routine may still be in progress — a trained-but-
      // unfinished today stays neutral rather than snapping the streak.
      return k === todayKey ? 'neutral' : 'breaking';
    }
    if (trainedDays.has(k)) return 'credited';
    if (!hasAnySchedule) return k === todayKey ? 'neutral' : 'breaking';
    return 'neutral';
  };

  // Current streak — walk back from today, skipping neutral days.
  let current = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const s = stateOf(d);
    if (s === 'credited') current++;
    else if (s === 'breaking') break;
    // neutral → keep walking
  }

  // Longest streak — same walk across the whole log history. totalDays is
  // counted in the same pass: a scheduled day only adds to the total once its
  // full routine is done, same rule the streak itself uses — a day with only
  // some of the routine's exercises logged is "credited" for neither.
  let longest = 0;
  let run = 0;
  let totalDays = 0;
  if (earliest) {
    const start = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const s = stateOf(d);
      if (s === 'credited') { run++; longest = Math.max(longest, run); totalDays++; }
      else if (s === 'breaking') run = 0;
    }
  }
  longest = Math.max(longest, current);

  // This week (Mon–today): credited days
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  let thisWeek = 0;
  for (let i = 0; i <= daysFromMon; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (stateOf(d) === 'credited') thisWeek++;
  }

  return { current, longest, thisWeek, totalDays };
}

// Trailing-30d consistency: completed scheduled days / scheduled days (%).
// Returns null when no days were scheduled in the window (matches the SQL/UI
// "no schedule → —" contract).
export function calcConsistency(
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
): number | null {
  const completedDays = buildCompletedDays(logs, schedule, routines, exercises);
  const now = new Date();

  let scheduled = 0;
  let completed = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dow = (d.getDay() + 6) % 7;
    const entry = schedule.find(s => s.day_of_week === dow);
    const routine = entry?.routine_id ? routines.find(r => r.id === entry.routine_id) : null;
    if (!routine || routine.exercise_ids.length === 0) continue;
    scheduled++;
    if (completedDays.has(dayKey(d))) completed++;
  }

  if (scheduled === 0) return null;
  return Math.round((completed / scheduled) * 100);
}
