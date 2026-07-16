// Per-day Log-page UI state (skipped / collapsed exercises), persisted to
// localStorage so it survives switching tabs — each view unmounts on tab
// change. Only the current day is kept; a new day (or reading a different day)
// returns nothing, so it resets automatically.

interface Stored {
  day: string;
  ids: string[];
}

// Stable per-calendar-day key, matching the format used in
// LogsView/AnalyticsView.
export function skipDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function loadDaySet(bucket: string, day: string): Set<string> {
  try {
    const raw = localStorage.getItem(`overload_daily_${bucket}`);
    if (!raw) return new Set();
    const s = JSON.parse(raw) as Stored;
    if (s.day !== day) return new Set();
    return new Set(s.ids);
  } catch {
    return new Set();
  }
}

export function saveDaySet(bucket: string, day: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`overload_daily_${bucket}`, JSON.stringify({ day, ids: Array.from(ids) }));
  } catch {
    /* ignore */
  }
}

// Convenience wrappers for the "skips" bucket (also read by AnalyticsView).
export function loadSkips(day: string): Set<string> {
  return loadDaySet('skips', day);
}

export function saveSkips(day: string, ids: Set<string>): void {
  saveDaySet('skips', day, ids);
}
