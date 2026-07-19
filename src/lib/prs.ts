// Personal-record events. A PR isn't stored anywhere — it's derived by
// replaying an exercise's logs in chronological order and asking, at each set,
// "was this the best I'd ever done at that point?". That makes the whole PR
// history retroactive for existing data and keeps records honest if a log is
// later edited or deleted.
import type { WorkoutLog } from '../types';

// weight → heaviest working set ever
// reps   → most reps at your heaviest weight
// e1rm   → best estimated 1RM (Epley), which can fall on a lighter, longer set
export type PRKind = 'weight' | 'reps' | 'e1rm';

export interface PREvent {
  logId: string;
  exerciseId: string;
  kind: PRKind;
  weight: number;
  reps: number;
  e1rm: number;
  /** created_at of the set that set the record. */
  date: string;
}

export function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function isWorking(l: WorkoutLog): boolean {
  return l.set_type !== 'warmup';
}

/**
 * Every PR ever set, newest first. One event per set at most: a set that beats
 * several records is reported as the most significant one (weight, then reps
 * at that weight, then estimated 1RM) so "3 PRs today" counts moments, not
 * metrics. An exercise's very first set is a baseline, not a record.
 */
export function buildPREvents(logs: WorkoutLog[]): PREvent[] {
  const byExercise = new Map<string, WorkoutLog[]>();
  for (const l of logs) {
    if (!isWorking(l)) continue;
    if (!byExercise.has(l.exercise_id)) byExercise.set(l.exercise_id, []);
    byExercise.get(l.exercise_id)!.push(l);
  }

  const events: PREvent[] = [];
  for (const [exerciseId, exLogs] of byExercise) {
    const chrono = exLogs
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let bestWeight = -Infinity;
    let bestE1rm = -Infinity;
    const bestRepsAtWeight = new Map<number, number>();
    let seenAny = false;

    for (const log of chrono) {
      const e1rm = epley(log.weight, log.reps_done);
      const prevRepsHere = bestRepsAtWeight.get(log.weight) ?? -Infinity;

      let kind: PRKind | null = null;
      if (seenAny) {
        if (log.weight > bestWeight) kind = 'weight';
        else if (log.weight === bestWeight && log.reps_done > prevRepsHere) kind = 'reps';
        else if (e1rm > bestE1rm) kind = 'e1rm';
      }

      if (kind) {
        events.push({
          logId: log.id,
          exerciseId,
          kind,
          weight: log.weight,
          reps: log.reps_done,
          e1rm,
          date: log.created_at,
        });
      }

      seenAny = true;
      if (log.weight > bestWeight) bestWeight = log.weight;
      if (e1rm > bestE1rm) bestE1rm = e1rm;
      if (log.reps_done > prevRepsHere) bestRepsAtWeight.set(log.weight, log.reps_done);
    }
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function prEventsOn(events: PREvent[], day: Date): PREvent[] {
  const k = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
  return events.filter(e => {
    const d = new Date(e.date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === k;
  });
}

/** PRs set since the start of the current week (Monday). */
export function prEventsThisWeek(events: PREvent[]): PREvent[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return events.filter(e => new Date(e.date) >= monday);
}

/** Human phrase for a PR event, e.g. "62.5kg" or "9 reps @ 60kg". */
export function prLabel(
  e: PREvent,
  unit: string,
  toDisplay: (kg: number) => number,
): string {
  if (e.kind === 'weight') return `${toDisplay(e.weight)}${unit}`;
  if (e.kind === 'reps') return `${e.reps} reps @ ${toDisplay(e.weight)}${unit}`;
  return `${Math.round(toDisplay(e.e1rm))}${unit} est. 1RM`;
}

export function prKindLabel(kind: PRKind): string {
  return kind === 'weight' ? 'Heaviest' : kind === 'reps' ? 'Most reps' : 'Best 1RM';
}
