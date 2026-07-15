import { ChevronRightIcon } from '@heroicons/react/20/solid';
import type { Exercise, WorkoutLog } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

interface Props {
  exercise: Exercise;
  lastLog?: WorkoutLog;
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

export default function ExerciseCard({ exercise, lastLog, onEdit, unit, toDisplay }: Props) {
  // Line: green if target hit, subtle grey otherwise
  const hit = lastLog && lastLog.reps_done >= exercise.target_reps;
  const lineColor = !lastLog
    ? 'rgba(255,255,255,0.06)'
    : hit
    ? 'var(--te-pr)'
    : 'rgba(255,255,255,0.14)';

  return (
    <button
      onClick={onEdit}
      className="w-full h-[70px] flex items-center gap-4 px-[18px] text-left active:opacity-80 transition-opacity min-w-0"
    >
      <div className="w-[3px] h-[38px] rounded-full shrink-0" style={{ background: lineColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-white truncate" style={{ letterSpacing: '-0.17px' }}>
          {exercise.name}
        </p>
        <p className="te-mono text-[12px] mt-[1px]" style={{ color: 'rgba(244,241,236,0.35)', fontFeatureSettings: '"tnum"' }}>
          {exercise.target_reps} x {exercise.sets}
        </p>
      </div>
      <span
        className="te-mono text-[22px] font-semibold text-white tabular-nums uppercase shrink-0 leading-none"
        style={{ letterSpacing: '-0.17px' }}
      >
        {loadLabel(exercise, unit, toDisplay)}
      </span>
      <ChevronRightIcon className="w-[15px] h-[15px] text-white/25 shrink-0" />
    </button>
  );
}
