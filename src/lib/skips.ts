// Per-day "skipped exercise" state, persisted to localStorage so a skip
// survives switching tabs (each view unmounts on tab change). Only the current
// day's skips are kept — a new day resets automatically, and reading a
// different day returns nothing.

const KEY = 'overload_daily_skips';

interface Stored {
  day: string;
  ids: string[];
}

// Mon=0…Sun=6 is irrelevant here; this is just a stable per-calendar-day key
// matching the format used in LogsView/AnalyticsView.
export function skipDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function loadSkips(day: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const s = JSON.parse(raw) as Stored;
    if (s.day !== day) return new Set();
    return new Set(s.ids);
  } catch {
    return new Set();
  }
}

export function saveSkips(day: string, ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day, ids: Array.from(ids) }));
  } catch {
    /* ignore */
  }
}
