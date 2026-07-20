interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

// Always vertically centered in the remaining page area — an empty page's
// message belongs in the middle of it, not hanging off the header.
export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[min(360px,42vh)]">
      {/* A tighter radius than the card scale: at 56px square, the card's 16px
          corner rounds the tile most of the way to a circle and reads as a
          different shape from the icon tiles elsewhere. */}
      <div
        className="w-14 h-14 te-panel flex items-center justify-center mb-3"
        style={{ borderRadius: 12 }}
      >
        {icon}
      </div>
      <p className="te-t1 font-semibold text-[17px] leading-tight tracking-tight">{title}</p>
      <p className="te-t4 text-[13px] max-w-[220px] leading-snug mt-[3px]">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
