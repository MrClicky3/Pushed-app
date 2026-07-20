export function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2" />
      <path d="M17.5 6.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2" />
      <rect x="3" y="9" width="3.5" height="6" rx="1" />
      <rect x="17.5" y="9" width="3.5" height="6" rx="1" />
      <line x1="6.5" y1="12" x2="17.5" y2="12" />
    </svg>
  );
}

export function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1.5" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

// Rest day. Traced from the Hugeicons "coffee-02" stroke-rounded glyph the
// user supplied; kept at its original 24-unit grid so it lines up with the
// heroicons used beside it.
// Tipped just enough to read as set down and idle rather than squared up to
// the grid. Kept shallow — past ~20° the cup stops looking rested and starts
// looking like it's about to go over.
export function CoffeeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={{ transform: 'rotate(15deg)', ...style }}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
    >
      <path d="M18.2505 10.5H19.6403C21.4918 10.5 22.0421 10.7655 21.9975 12.0838C21.9237 14.2674 20.939 16.8047 17 17.5" />
      <path d="M5.94627 20.6145C2.57185 18.02 2.07468 14.3401 2.00143 10.5001C1.96979 8.8413 2.45126 8.5 4.65919 8.5H15.3408C17.5487 8.5 18.0302 8.8413 17.9986 10.5001C17.9253 14.3401 17.4281 18.02 14.0537 20.6145C13.0934 21.3528 12.2831 21.5 10.9194 21.5H9.08064C7.71686 21.5 6.90658 21.3528 5.94627 20.6145Z" />
      <path d="M11.3089 2.5C10.7622 2.83861 10.0012 4 10.0012 5.5M7.53971 4C7.53971 4 7 4.5 7 5.5M14.0012 4C13.7279 4.1693 13.5 5 13.5 5.5" strokeLinejoin="round" />
    </svg>
  );
}
