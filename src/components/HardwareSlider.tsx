interface Props<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export default function HardwareSlider<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="flex gap-1">
      {options.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`${active ? 'te-toggle-on' : 'te-toggle-off'} flex-1 py-[10px] px-2 rounded-xl text-[12px] font-semibold select-none`}
            style={{ color: active ? 'var(--te-accent-contrast)' : 'rgba(255,255,255,0.4)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
