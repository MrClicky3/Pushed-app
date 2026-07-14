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
