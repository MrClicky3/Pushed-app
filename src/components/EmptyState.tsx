interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

// Sits in the upper part of the remaining page area rather than dead centre —
// centred, the message drifted so far down an empty page that it read as
// unrelated to the header above it.
export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-start text-center min-h-[min(360px,42vh)] pt-14">
      {/* No plate behind the icon — the glyph carries it on its own, the same
          way the Leaderboard's section mark does. */}
      <div className="flex items-center justify-center mb-3.5">
        {icon}
      </div>
      <p className="te-t1 font-semibold text-[17px] leading-tight tracking-tight">{title}</p>
      <p className="te-t4 text-[13px] max-w-[220px] leading-snug mt-[3px]">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
