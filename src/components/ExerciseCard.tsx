import { ChevronRightIcon } from '@heroicons/react/20/solid';
import type { Exercise } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

interface Props {
  exercise: Exercise;
  /** Is this exercise part of today's scheduled routine? Drives the accent
      bar: white when it's on today's plan, dim grey otherwise. */
  inTodaysSchedule: boolean;
  onEdit: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}

// Right-hand load label: "30kg" | "BW" | "BW +10kg"
function loadLabel(ex: Exercise, unit: WeightUnit, toDisplay: (kg: number) => number): string {
  if (ex.load_type === 'bodyweight') return 'BW';
  if (ex.load_type === 'weighted_bw') {
    return ex.weight > 0 ? `BW +${toDisplay(ex.weight)}${unit}` : 'BW';
  }
  return `${toDisplay(ex.weight)}${unit}`;
}

export default function ExerciseCard({ exercise, inTodaysSchedule, onEdit, unit, toDisplay }: Props) {
  const lineColor = inTodaysSchedule ? 'var(--te-text-1)' : 'var(--te-text-4)';

  return (
    <button
      onClick={onEdit}
      className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:opacity-80 transition-opacity min-w-0"
    >
      {/* Stretches to the text block's own height (not the button's), via the
          items-stretch wrapper below — a fixed/full-card-height bar read too
          long against just two lines of text. */}
      <div className="flex items-stretch gap-3 flex-1 min-w-0">
        <div className="w-[4px] rounded-full shrink-0" style={{ background: lineColor }} />
        {/* leading-none on both lines: default line-height leaves invisible
            space above/below the glyphs, which the items-stretch bar was
            matching literally — it looked taller than the text it sits next
            to even though it was already sized to the block, not the card. */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="text-[17px] leading-none font-semibold te-t1 truncate" style={{ letterSpacing: '-0.17px' }}>
              {exercise.name}
            </p>
            <span className="te-mono text-[13px] leading-none shrink-0" style={{ color: 'var(--te-text-4)', fontFeatureSettings: '"tnum"' }}>
              {exercise.target_reps} x {exercise.sets}
            </span>
          </div>
          <p className="te-mono text-[13px] leading-none mt-[6px]" style={{ color: 'var(--te-text-4)', fontFeatureSettings: '"tnum"' }}>
            {loadLabel(exercise, unit, toDisplay)}
          </p>
        </div>
      </div>
      {/* Top-right, nudged to sit level with the name's cap-height rather than
          centred against the whole (now auto-height) row. */}
      <ChevronRightIcon className="w-[15px] h-[15px] te-t4 shrink-0 mt-[3px]" />
    </button>
  );
}
