// App accent color — drives toggle buttons, switch levers and the "muscles
// worked" body models. Persisted in localStorage and applied as CSS variables
// so CSS-driven elements pick it up instantly; JS-driven bits (the SVG body
// models) read the resolved value via accentHex().

export type AccentKey = 'red' | 'white' | 'yellow' | 'blue' | 'green';

export const ACCENTS: Record<AccentKey, { label: string; color: string; contrast: string }> = {
  red:    { label: 'Red',    color: '#ff453a', contrast: '#ffffff' },
  white:  { label: 'White',  color: '#f4f1ec', contrast: '#0a0908' },
  yellow: { label: 'Yellow', color: '#f2df9a', contrast: '#0a0908' },
  blue:   { label: 'Blue',   color: '#9ec6f5', contrast: '#0a0908' },
  green:  { label: 'Green',  color: '#a6deb0', contrast: '#0a0908' },
};

export const ACCENT_ORDER: AccentKey[] = ['red', 'white', 'yellow', 'blue', 'green'];

const KEY = 'settings_accent';

export function loadAccent(): AccentKey {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in ACCENTS) return v as AccentKey;
  } catch { /* ignore */ }
  return 'red';
}

export function applyAccent(key: AccentKey) {
  const a = ACCENTS[key] ?? ACCENTS.red;
  try { localStorage.setItem(KEY, key); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--te-accent', a.color);
    document.documentElement.style.setProperty('--te-accent-contrast', a.contrast);
  }
}

// Live accent hex — reads the resolved CSS variable so JS consumers stay in sync
export function accentHex(): string {
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--te-accent').trim();
    if (v) return v;
  }
  return ACCENTS[loadAccent()].color;
}

export function accentAlpha(alpha: number): string {
  const hex = accentHex().replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
