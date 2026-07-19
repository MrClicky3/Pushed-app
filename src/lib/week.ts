// "This week" summary — the Progress page's headline. Pure so the wording of
// every case (on plan, behind, all done, no routine) can be reasoned about and
// tested without rendering anything.
import { buildCompletedDays, isScheduledDay } from './streak';
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';

export type WeekSegmentState = 'done' | 'missed' | 'today' | 'upcoming' | 'bonus' | 'idle';

export interface WeekSegment {
  state: WeekSegmentState;
  /** Weekday abbreviation, e.g. "Mon". */
  label: string;
}

export interface WeekSummary {
  segments: WeekSegment[];
  headline: string;
  subline: string;
  /** Null when there's no routine to be on plan with. */
  chip: { text: string; ok: boolean } | null;
  scheduledTotal: number;
  doneScheduled: number;
  bonusDays: number;
  trainedDays: number;
  missedLabels: string[];
}

const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function buildWeekSummary(
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
  now: Date = new Date(),
): WeekSummary {
  const completed = buildCompletedDays(logs, schedule, routines, exercises);
  const trained = new Set<string>();
  for (const l of logs) {
    if (l.set_type === 'warmup') continue;
    trained.add(dayKey(new Date(l.created_at)));
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const raw: WeekSegment[] = [];
  const missedLabels: string[] = [];
  let scheduledTotal = 0, doneScheduled = 0, bonusDays = 0, trainedDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = dayKey(d);
    const scheduled = isScheduledDay(d, schedule, routines);
    const isPast = d < today;
    const isToday = d.getTime() === today.getTime();
    const done = completed.has(k);
    const didTrain = trained.has(k);
    const label = WEEKDAY_ABBR[i];

    if (done || didTrain) trainedDays++;

    if (scheduled) {
      scheduledTotal++;
      if (done) { doneScheduled++; raw.push({ state: 'done', label }); }
      else if (isPast) { missedLabels.push(label); raw.push({ state: 'missed', label }); }
      else raw.push({ state: isToday ? 'today' : 'upcoming', label });
    } else if (didTrain) {
      bonusDays++;
      raw.push({ state: 'bonus', label });
    } else {
      raw.push({ state: 'idle', label });
    }
  }

  // Untrained rest days earn a segment only when nothing is scheduled at all —
  // there the meter needs all seven days to have a denominator. Once a routine
  // exists they drop out entirely: a rest day isn't a shortfall.
  const segments: WeekSegment[] = scheduledTotal > 0
    ? raw.filter(s => s.state !== 'idle')
    : raw.map(s => (s.state === 'idle' ? { ...s, state: 'upcoming' as const } : s));

  const allRoutineDone = scheduledTotal > 0 && doneScheduled === scheduledTotal;
  const onPlan = scheduledTotal > 0 && missedLabels.length === 0;

  // Finishing every routine day is the week's win condition, so it gets a
  // sentence rather than a fraction.
  const headline = scheduledTotal === 0
    ? (trainedDays > 0 ? `${trainedDays} day${trainedDays === 1 ? '' : 's'} trained` : 'No workouts yet')
    : allRoutineDone
    ? (bonusDays > 0 ? `All routine days + ${bonusDays} extra` : 'All routine days trained')
    : `${doneScheduled} of ${scheduledTotal} routine days`;

  const subline = scheduledTotal === 0
    ? 'No routine scheduled'
    : missedLabels.length > 0
    ? `Missed ${missedLabels.join(', ')}`
    : allRoutineDone
    ? 'Nothing left on the plan'
    : `${scheduledTotal - doneScheduled} to go`;

  const chip = scheduledTotal === 0
    ? null
    : { text: onPlan ? (allRoutineDone ? 'Complete' : 'On plan') : `${missedLabels.length} missed`, ok: onPlan };

  return { segments, headline, subline, chip, scheduledTotal, doneScheduled, bonusDays, trainedDays, missedLabels };
}
