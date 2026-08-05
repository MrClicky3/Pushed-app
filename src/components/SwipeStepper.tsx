import { useRef, useState, useCallback } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
  fractional?: boolean;
}

const SWIPE_THRESHOLD = 18;

export default function SwipeStepper({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  fractional = false,
}: Props) {
  const startY = useRef<number | null>(null);
  const startVal = useRef(0);
  const [animDir, setAnimDir] = useState<'' | 'up' | 'down'>('');

  const clamp = useCallback((v: number) => {
    return Math.max(min, v);
  }, [min]);

  const applyStep = useCallback((delta: number) => {
    const current = parseFloat(value) || 0;
    const next = fractional
      ? Math.round((current + delta) * 100) / 100
      : Math.round(current + delta);
    onChange(String(clamp(next)));
    setAnimDir(delta > 0 ? 'up' : 'down');
    setTimeout(() => setAnimDir(''), 200);
  }, [value, onChange, clamp, fractional]);

  function handlePointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    startVal.current = parseFloat(value) || 0;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (startY.current === null) return;
    const dy = startY.current - e.clientY;
    if (Math.abs(dy) < SWIPE_THRESHOLD) return;

    const steps = Math.floor(Math.abs(dy) / SWIPE_THRESHOLD);
    const delta = (dy > 0 ? 1 : -1) * steps * step;
    const next = fractional
      ? Math.round((startVal.current + delta) * 100) / 100
      : Math.round(startVal.current + delta);
    onChange(String(clamp(next)));

    startY.current = e.clientY;
    startVal.current = next;
    setAnimDir(delta > 0 ? 'up' : 'down');
    setTimeout(() => setAnimDir(''), 200);
  }

  function handlePointerUp() {
    startY.current = null;
  }

  function handleWheel(e: React.WheelEvent) {
    if (Math.abs(e.deltaY) < 10) return;
    e.preventDefault();
    applyStep(e.deltaY < 0 ? step : -step);
  }

  const animClass = animDir === 'up' ? 'animate-slot-up' : animDir === 'down' ? 'animate-slot-down' : '';

  return (
    <div
      className="relative flex flex-col justify-between h-[80px] rounded-te-md touch-none"
      style={{ background: 'var(--te-well)', padding: '13px' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* shrink-0 is load-bearing: `overflow-hidden` clears the default
          min-height:auto, so without it the flex column collapsed this label to
          zero height and the Reps/Sets/Weight fields rendered unlabelled. */}
      <p className="te-label shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: 11 }}>{label}</p>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => e.target.select()}
        min={min}
        step={step}
        inputMode="decimal"
        className={`w-full bg-transparent te-t1 !text-[46px] font-bold te-mono focus:outline-none tabular-nums !leading-[36px] tracking-[-1px] text-left ${animClass}`}
        style={{ touchAction: 'none' }}
      />
      {/* Centred on the value's line rather than on the whole field, so the
          drag affordance sits beside the number it changes instead of
          floating between the label and the value. The field's bottom
          padding is 13px and the value's line box is 32px tall, putting that
          line's centre 29px up — half the 33px arrow stack below it. */}
      <div className="absolute right-2.5 flex flex-col gap-1.5 pointer-events-none" style={{ bottom: 12 }}>
        <ChevronUpIcon className="w-[13.5px] h-[13.5px] te-t4" />
        <ChevronDownIcon className="w-[13.5px] h-[13.5px] te-t4" />
      </div>
    </div>
  );
}
