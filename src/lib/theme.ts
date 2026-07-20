// Light / dark app theme. Like lib/accent, the choice is persisted in
// localStorage and applied as a `data-theme` attribute on <html> so the CSS
// variable overrides in index.css switch instantly. 'system' follows the OS
// preference and keeps tracking it live.

export type ThemeMode = 'dark' | 'light' | 'system';

const KEY = 'settings_theme';

export function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'dark';
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: light)').matches;
}

// The concrete theme actually painted, after resolving 'system'.
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') return systemPrefersLight() ? 'light' : 'dark';
  return mode;
}

function paint(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  // Native form controls (scrollbars, date pickers) follow this.
  root.style.colorScheme = resolved;
}

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

export function applyTheme(mode: ThemeMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  paint(resolveTheme(mode));

  // Only subscribe to OS changes while in 'system'; tear the listener down
  // otherwise so an explicit choice is never overridden.
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaQuery = null;
    mediaListener = null;
  }
  if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaListener = e => paint(e.matches ? 'light' : 'dark');
    mediaQuery.addEventListener('change', mediaListener);
  }
}
