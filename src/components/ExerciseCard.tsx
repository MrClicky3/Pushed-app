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
      className="w-full h-[70px] flex items-center gap-3 px-[18px] text-left active:opacity-80 transition-opacity min-w-0"
    >
      {/* Full-height, matches the iOS row's Capsule().frame(maxHeight: .infinity)
          — was a short 38px floating segment before, which read thinner and
          less anchored than the reference. */}
      <div className="w-[4px] self-stretch my-[10px] rounded-full shrink-0" style={{ background: lineColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-[17px] font-semibold te-t1 truncate" style={{ letterSpacing: '-0.17px' }}>
            {exercise.name}
          </p>
          <span className="te-mono text-[13px] shrink-0" style={{ color: 'var(--te-text-4)', fontFeatureSettings: '"tnum"' }}>
            {exercise.target_reps} x {exercise.sets}
          </span>
          {trendPct !== null && trendPct !== undefined && <TrendChip pct={trendPct} />}
        </div>
        {/* Own line, natural case ("30kg" / "BW +10kg") — no longer forced
            uppercase or crammed onto the name's line. */}
        <p className="te-mono text-[13px] mt-[2px]" style={{ color: 'var(--te-text-4)', fontFeatureSettings: '"tnum"' }}>
          {loadLabel(exercise, unit, toDisplay)}
        </p>
      </div>
      <ChevronRightIcon className="w-[15px] h-[15px] te-t4 shrink-0" />
    </button>
  );
}
