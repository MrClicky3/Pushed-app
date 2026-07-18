// Per-category accent colors — the dot next to an exercise and the chart fill
// when that exercise is selected. Persisted in localStorage and applied as CSS
// variables (--te-upper, --te-lower, …) so the many CSS-driven consumers pick
// them up without prop drilling; JS consumers read the resolved value via
// categoryHex().

export const CATEGORY_KEYS = ['upper', 'lower', 'push', 'pull', 'legs', 'core'] as const;
export type CategoryKey = typeof CATEGORY_KEYS[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  upper: 'Upper', lower: 'Lower', push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core',
};

export interface Swatch { key: string; label: string; color: string }

export const CATEGORY_PALETTE: Swatch[] = [
  { key: 'purple', label: 'Purple', color: '#9b8cf2' },
  { key: 'orange', label: 'Orange', color: '#f2c08c' },
  { key: 'red',    label: 'Red',    color: '#ff453a' },
  { key: 'blue',   label: 'Blue',   color: '#9ec6f5' },
  { key: 'green',  label: 'Green',  color: '#a6deb0' },
  { key: 'yellow', label: 'Yellow', color: '#f2df9a' },
  { key: 'pink',   label: 'Pink',   color: '#f5a3c7' },
  { key: 'white',  label: 'White',  color: '#f4f1ec' },
];

// The minimal 4-swatch set offered in the Add Exercise sheet. A deliberate
// subset of the full palette (which still backs any value already stored) —
// includes the two category defaults so nothing looks unselected on open.
export const PICKER_SWATCH_KEYS = ['purple', 'orange', 'blue', 'green'] as const;
export const PICKER_SWATCHES: Swatch[] = PICKER_SWATCH_KEYS.map(
  k => CATEGORY_PALETTE.find(s => s.key === k)!,
);

// Matches the long-standing hard-coded defaults so nothing shifts on upgrade.
export const CATEGORY_DEFAULTS: Record<CategoryKey, string> = {
  upper: 'purple', lower: 'orange', push: 'red', pull: 'blue', legs: 'green', core: 'yellow',
};

export type CategoryColors = Record<CategoryKey, string>;

const KEY = 'settings_category_colors';

function swatch(paletteKey: string): Swatch {
  return CATEGORY_PALETTE.find(s => s.key === paletteKey) ?? CATEGORY_PALETTE[0];
}

export function loadCategoryColors(): CategoryColors {
  const out = { ...CATEGORY_DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CategoryColors>;
      for (const k of CATEGORY_KEYS) {
        const v = parsed[k];
        if (typeof v === 'string' && CATEGORY_PALETTE.some(s => s.key === v)) out[k] = v;
      }
    }
  } catch { /* ignore */ }
  return out;
}

export function applyCategoryColors(colors: CategoryColors) {
  try { localStorage.setItem(KEY, JSON.stringify(colors)); } catch { /* ignore */ }
  if (typeof document === 'undefined') return;
  for (const k of CATEGORY_KEYS) {
    document.documentElement.style.setProperty(`--te-${k}`, swatch(colors[k]).color);
  }
}

/** CSS value for a group, e.g. `var(--te-upper)`. Unknown groups fall back. */
export function categoryVar(group: string): string {
  return (CATEGORY_KEYS as readonly string[]).includes(group)
    ? `var(--te-${group})`
    : 'rgba(244,241,236,0.3)';
}

/** Resolved hex for a group — for SVG/canvas consumers that can't use var(). */
export function categoryHex(group: string): string {
  if (!(CATEGORY_KEYS as readonly string[]).includes(group)) return 'rgba(244,241,236,0.3)';
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--te-${group}`).trim();
    if (v) return v;
  }
  return swatch(loadCategoryColors()[group as CategoryKey]).color;
}
