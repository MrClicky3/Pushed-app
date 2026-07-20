// Shared visual tokens for the redesigned bottom-sheet forms
// (New exercise / Add log) — matches the Figma "menu" designs.
import type { CSSProperties } from 'react';

// Section heading — Geist Mono, uppercase, dim white.
export const SECTION_LABEL: CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: '12px',
  fontWeight: 500,
  textTransform: 'uppercase',
  color: 'var(--te-text-4)',
  letterSpacing: '-0.17px',
};

// Segmented / choice pill — white when active, recessed dark when idle.
export function ToggleButton({
  active, onClick, label, className = '', heightPx = 45,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
  heightPx?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} rounded-te-md flex items-center justify-center text-[13px] font-semibold capitalize select-none ${className}`}
      style={{ color: active ? 'var(--te-ink)' : 'var(--te-text-4)', height: heightPx }}
    >
      {label}
    </button>
  );
}
