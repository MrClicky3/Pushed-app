interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  /** Vertically centered in the remaining page area (Log empty states). */
  page?: boolean;
}

export default function EmptyState({ icon, title, subtitle, action, page }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${page ? 'min-h-[min(360px,42vh)]' : 'py-16'}`}
    >
      <div
        className="w-14 h-14 rounded-te-sm te-panel flex items-center justify-center mb-3"
      >
        {icon}
      </div>
      <p className="te-t1 font-semibold text-[17px] mb-0.5 tracking-tight">{title}</p>
      <p className="te-t4 text-[13px] max-w-[220px] leading-snug">{subtitle}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
