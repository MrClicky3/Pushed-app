interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-full te-panel flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="te-t1 font-semibold text-[17px] mb-1.5 tracking-tight">{title}</p>
      <p className="te-t4 text-[13px] max-w-[220px] leading-relaxed">{subtitle}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
