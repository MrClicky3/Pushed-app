// Small pure date helpers shared by the week calendar and its callers (the Log
// page and the Routines scheduler). Kept here rather than inline in a view so
// both places compute weeks and day-of-week indices the same way.
import type { WeekStartDay } from '../hooks/useSettings';

// Indexed by Date#getDay() (Sun=0 … Sat=6).
export const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function dayInitial(d: Date): string {
  return DAY_INITIALS[d.getDay()];
}

export function startOfDay(d: Date): Date {
  const n = new Date(d); n.setHours(0, 0, 0, 0); return n;
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n;
}

// Monday = 0 … Sunday = 6 — the schedule's canonical day-of-week index. This is
// a fixed data-model convention (matches ScheduleDay.day_of_week) and is
// independent of the user's display "start week on" preference.
export function dowMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

const WEEK_START_JSDAY: Record<WeekStartDay, number> = { sunday: 0, monday: 1, saturday: 6 };

// Start of the visual week strip containing `d`, anchored to the configured
// start-of-week day (purely a display concern — the day-of-week indices above
// are unaffected).
export function startOfWeekFor(d: Date, startDay: WeekStartDay): Date {
  const diff = (d.getDay() - WEEK_START_JSDAY[startDay] + 7) % 7;
  return addDays(startOfDay(d), -diff);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
