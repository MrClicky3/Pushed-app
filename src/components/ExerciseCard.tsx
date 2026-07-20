import { ChevronRightIcon } from '@heroicons/react/20/solid';
import type { Exercise, WorkoutLog } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

interface Props {
  exercise: Exercise;
  lastLog?: WorkoutLog;
  onEdit: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  /** Est-1RM change vs the previous month, in % (null = not enough history). */
  trendPct?: number | null;
}

// Right-hand load label: "30kg" | "BW" | "BW +10kg"
function loadLabel(ex: Exercise, unit: WeightUnit, toDisplay: (kg: number) => number): string {
  if (ex.load_type === 'bodyweight') return 'BW';
  if (ex.load_type === 'weighted_bw') {
    return ex.weight > 0 ? `BW +${toDisplay(ex.weight)}${unit}` : 'BW';
  }
  return `${toDisplay(ex.weight)}${unit}`;
}

// ▲/▼ month-over-month strength trend (est. 1RM). Quietly omitted until two
// months of history exist — a missing chip is neutral, a wrong one is noise.
function TrendChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  const color = up ? 'var(--te-pr)' : 'var(--te-warn)';
  const shown = Math.abs(Math.round(pct * 10) / 10);
  return (
    <span
      className="te-mono shrink-0 tabular-nums"
      style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', color }}
    >
      {up ? '▲' : '▼'} {shown}%
    </span>
  );
}

export default function ExerciseCard({ exercise, lastLog, onEdit, unit, toDisplay, trendPct }: Props) {
  // Line: green if target hit, subtle grey otherwise
  const hit = lastLog && lastLog.reps_done >= exercise.target_reps;
  const lineColor = !lastLog
    ? 'var(--te-border)'
    : hit
    ? 'var(--te-pr)'
    : 'var(--te-text-4)';

  return (
    <button
      onClick={onEdit}
      className="relative w-full h-[70px] flex items-center gap-4 px-[18px] text-left active:opacity-80 transition-opacity min-w-0"
    >
      {/* Affordance chevron, pinned to the card's top-right corner rather than
          riding the vertical centre — the row's centre line already carries
          the name and the load, and a third element there crowded them. */}
      <ChevronRightIcon
        className="w-[13px] h-[13px] te-t4 absolute pointer-events-none"
        style={{ top: 10, right: 12 }}
      />
      <div className="w-[3px] h-[38px] rounded-full shrink-0" style={{ background: lineColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-semibold te-t1 truncate" style={{ letterSpacing: '-0.17px' }}>
          {exercise.name}
        </p>
        <p className="te-mono text-[13px] mt-[1px] flex items-center gap-2" style={{ color: 'var(--te-text-4)', fontFeatureSettings: '"tnum"' }}>
          {exercise.target_reps} x {exercise.sets}
          {trendPct !== null && trendPct !== undefined && <TrendChip pct={trendPct} />}
        </p>
      </div>
      {/* Same step as the exercise name: the load is the row's value, not its
          headline. At 20px it outweighed the name it belongs to, so the list
          scanned as a column of numbers with captions attached. The mono face
          already sets it apart without needing extra size. */}
      <span
        className="te-mono text-[17px] font-semibold te-t1 tabular-nums uppercase shrink-0 leading-none"
        style={{ letterSpacing: '-0.17px' }}
      >
        {loadLabel(exercise, unit, toDisplay)}
      </span>
    </button>
  );
}
