// Per-competition daily baselines — the client-side backbone of the "what did
// today's session do to my standing" line on the session recap. The first
// standings fetch of a calendar day freezes that day's baseline; the recap
// compares live standings against it. Purely local (localStorage), so it
// needs no migration and degrades to "no delta shown" on a fresh device.

export interface CompBaseline {
  score: number | null;  // ranking value (volume kg / streak days)
  delta: number | null;  // legacy volume %Δ — NULL on new-style rows
  dayKey: string;        // local calendar day the baseline was frozen
}

const KEY = 'comp_baselines_v1';

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadAll(): Record<string, CompBaseline> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, CompBaseline>;
  } catch { /* ignore */ }
  return {};
}

function saveAll(map: Record<string, CompBaseline>) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function baselineFor(compId: string): CompBaseline | null {
  return loadAll()[compId] ?? null;
}

/**
 * Freeze today's baseline for a competition — a no-op if today's is already
 * frozen. Call on the first standings fetch of the day (app open), which is
 * the closest client-side stand-in for "state before today's workout".
 */
export function recordBaseline(compId: string, snap: { score: number | null; delta: number | null }) {
  const all = loadAll();
  const cur = all[compId];
  const today = todayKey();
  if (cur?.dayKey === today) return;
  all[compId] = { score: snap.score, delta: snap.delta, dayKey: today };
  // Prune entries for competitions we no longer track (keep the map small).
  const keys = Object.keys(all);
  if (keys.length > 24) {
    for (const k of keys.slice(0, keys.length - 24)) delete all[k];
  }
  saveAll(all);
}
