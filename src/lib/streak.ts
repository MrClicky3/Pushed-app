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

export function calcStreak(
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
) {
  const completedDays = buildCompletedDays(logs, schedule, routines, exercises);

  // Current streak
  let current = 0;
  const now = new Date();
  const todayKey = dayKey(now);
  const startOffset = completedDays.has(todayKey) ? 0 : 1;
  for (let i = startOffset; i <= 365; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (completedDays.has(dayKey(d))) current++;
    else break;
  }

  // Longest streak
  const sorted = Array.from(completedDays).sort();
  let longest = 0, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const [y1, m1, d1] = sorted[i - 1].split('-').map(Number);
    const [y2, m2, d2] = sorted[i].split('-').map(Number);
    const diff = (new Date(y2, m2, d2).getTime() - new Date(y1, m1, d1).getTime()) / 86400000;
    if (diff === 1) { run++; longest = Math.max(longest, run); } else run = 1;
  }
  if (sorted.length === 1) longest = 1;

  // This week (Mon–today)
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  let thisWeek = 0;
  for (let i = 0; i <= daysFromMon; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (completedDays.has(dayKey(d))) thisWeek++;
  }

  return { current, longest, thisWeek, totalDays: completedDays.size };
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
