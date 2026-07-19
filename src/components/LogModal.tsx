import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChevronRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import Model from '@phelian/react-body-highlighter';
import Modal from './Modal';
import SearchField from './SearchField';
import { ToggleButton } from './SheetControls';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import type { Exercise, WorkoutLog, SetType } from '../types';
import type { WeightUnit } from '../hooks/useSettings';
import { feedback } from '../lib/feedback';
import { categoryVar } from '../lib/categoryColors';
import { accentHex } from '../lib/accent';

const SET_TYPES: { key: SetType; label: string }[] = [
  { key: 'warmup',  label: 'Warmup'  },
  { key: 'working', label: 'Working' },
  { key: 'drop',    label: 'Drop'    },
];

const POSTERIOR = new Set([
  'upper-back','lower-back','back-deltoids','trapezius',
  'hamstring','gluteal','calves','left-soleus','right-soleus',
]);
function bestView(muscles: string[]): 'anterior' | 'posterior' {
  const p = muscles.filter(m => POSTERIOR.has(m)).length;
  return p > muscles.length - p ? 'posterior' : 'anterior';
}
const FALLBACK: Record<string, string[]> = {
  upper: ['chest', 'front-deltoids'],
  lower: ['quadriceps', 'hamstring'],
};

function ExercisePickerCard({ ex, onPick, toDisplay, unit }: {
  ex: Exercise; onPick: () => void; toDisplay: (kg: number) => number; unit: WeightUnit;
}) {
  const libEx = useMemo(() => EXERCISE_LIBRARY.find(l => l.name.toLowerCase() === ex.name.toLowerCase()), [ex.name]);
  const muscles = libEx?.primaryMuscles ?? (FALLBACK[ex.muscle_group] ?? ['chest']) as never[];
  const view = bestView(muscles.map(String));
  const isUpper = ex.muscle_group !== 'lower';
  const mapData = [{ name: 'p', muscles }];

  return (
    <button
      type="button"
      onClick={onPick}
      className="te-panel w-full rounded-te-md overflow-hidden active:opacity-80 transition-opacity flex items-stretch text-left"
    >
      <div style={{
        width: 64, flexShrink: 0,
        background: 'var(--te-surface-1)',
        borderRight: '1px solid var(--te-border)',
        position: 'relative', overflow: 'hidden', minHeight: 72,
      }}>
        <div style={{
          position: 'absolute',
          [isUpper ? 'top' : 'bottom']: -4,
          left: '50%', transform: 'translateX(-50%)',
          width: '90%',
        }}>
          <Model type={view} data={mapData} bodyColor="#181818" highlightedColors={[accentHex()]} style={{ width: '100%' }} />
        </div>
      </div>
      <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col justify-center">
        <p className="text-[15px] font-semibold te-t1 truncate" style={{ letterSpacing: '-0.005em' }}>{ex.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="te-mono text-[10px] te-t4 tabular-nums">{ex.target_reps}×{ex.sets}</span>
          <span className="te-mono text-[10px] te-t4">·</span>
          <span className="te-mono text-[10px] te-t4 tabular-nums">{toDisplay(ex.weight)}{unit}</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center gap-1 pr-4 shrink-0">
        <GroupChip group={ex.muscle_group} />
        <ChevronRightIcon className="w-4 h-4 te-t4 shrink-0" />
      </div>
    </button>
  );
}

interface LogData {
  exercise_id: string;
  reps_done: number;
  weight: number;
  sets: number;
  comment: string;
  set_type: SetType;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: LogData) => void;
  onUpdate?: (id: string, data: Omit<LogData, 'exercise_id'>) => void;
  onDelete?: (id: string) => void;
  exercise?: Exercise | null;
  exercises?: Exercise[];
  editLog?: WorkoutLog | null;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  fromDisplay: (val: number) => number;
  barbellWeight: number;
}

function GroupChip({ group }: { group: string }) {
  const dotColor = categoryVar(group);
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: dotColor }} />
      <span className="te-label">{group}</span>
    </div>
  );
}

function StepperBtn({ label, onPress, onLongPress }: { label: string; onPress: () => void; onLongPress?: () => void }) {
  const longTimer = { current: null as ReturnType<typeof setTimeout> | null };

  function handlePointerDown() {
    longTimer.current = setTimeout(() => { onLongPress?.(); }, 400);
  }
  function handlePointerUp() {
    if (longTimer.current) clearTimeout(longTimer.current);
  }

  return (
    <button
      type="button"
      onClick={onPress}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      className="te-toggle-off w-[50px] h-[35px] rounded-full flex items-center justify-center te-mono text-[20px] te-t2 select-none shrink-0"
    >
      {label}
    </button>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  bigStep = 5,
  min = 0,
  fractional = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  bigStep?: number;
  min?: number;
  fractional?: boolean;
}) {
  function clamp(v: number) { return Math.max(min, v); }
  const display = fractional ? (Number.isInteger(value) ? String(value) : value.toFixed(1)) : String(value);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= min) onChange(clamp(parsed));
  }

  // ── Swipe-to-change ──
  const startY = useRef<number | null>(null);
  const startVal = useRef(0);
  const [animDir, setAnimDir] = useState<'' | 'up' | 'down'>('');
  const SWIPE_THRESHOLD = 18;

  const applyDelta = useCallback((delta: number) => {
    const next = fractional
      ? Math.round((startVal.current + delta) * 100) / 100
      : Math.round(startVal.current + delta);
    onChange(clamp(next));
    setAnimDir(delta > 0 ? 'up' : 'down');
    setTimeout(() => setAnimDir(''), 200);
  }, [clamp, fractional, onChange]);

  function handlePointerDown(e: React.PointerEvent) {
    startY.current = e.clientY;
    startVal.current = value;
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
    onChange(clamp(next));

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
    applyDelta(e.deltaY < 0 ? step : -step);
  }

  const animClass = animDir === 'up' ? 'animate-slot-up' : animDir === 'down' ? 'animate-slot-down' : '';

  return (
    <div className="flex flex-col items-center gap-2.5 w-full">
      <span className="te-label whitespace-nowrap" style={{ letterSpacing: '0.06em' }}>{label}</span>
      <div className="flex items-center justify-center gap-[15px] w-full">
        <StepperBtn label="–" onPress={() => onChange(clamp(value - step))} onLongPress={() => onChange(clamp(value - bigStep))} />

        <div
          className="relative flex-1 flex items-center justify-center rounded-te-md touch-none"
          style={{ background: 'var(--te-well)', border: '1px solid var(--te-border-strong)' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <input
            type="number"
            inputMode="decimal"
            value={display}
            onChange={handleInputChange}
            onFocus={e => e.target.select()}
            min={min}
            step="any"
            className={`te-mono !text-[52px] font-bold te-t1 tabular-nums !leading-[38px] bg-transparent border-none focus:outline-none w-full text-center ${animClass}`}
            style={{ letterSpacing: '-1px', touchAction: 'none' }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none">
            <ChevronUpIcon className="w-[13.5px] h-[13.5px] te-t4" />
            <ChevronDownIcon className="w-[13.5px] h-[13.5px] te-t4" />
          </div>
        </div>

        <StepperBtn label="+" onPress={() => onChange(clamp(value + step))} onLongPress={() => onChange(clamp(value + bigStep))} />
      </div>
    </div>
  );
}

// ── Plate calculator ────────────────────────────────────────────
// Per-side plate breakdown for barbell loads, from the user's configured bar
// weight. Display-unit aware; greedy decomposition over standard plates.
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const PLATES_LBS = [45, 35, 25, 10, 5, 2.5];

function platesPerSide(totalDisplay: number, barDisplay: number, unit: WeightUnit): { plates: number[]; leftover: number } | null {
  const perSide = (totalDisplay - barDisplay) / 2;
  if (barDisplay <= 0 || perSide < 0) return null;
  const denoms = unit === 'lbs' ? PLATES_LBS : PLATES_KG;
  const plates: number[] = [];
  let rest = perSide;
  for (const p of denoms) {
    while (rest >= p - 1e-9) { plates.push(p); rest = Math.round((rest - p) * 1000) / 1000; }
  }
  return { plates, leftover: rest };
}

function fmtPlate(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function PlateCalc({ weightDisplay, barbellKg, unit, toDisplay }: {
  weightDisplay: number;
  barbellKg: number;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('plate_calc_open') === '1'; } catch { return false; }
  });
  function toggle() {
    setOpen(o => {
      try { localStorage.setItem('plate_calc_open', o ? '0' : '1'); } catch { /* ignore */ }
      return !o;
    });
  }

  const barDisplay = toDisplay(barbellKg);
  const breakdown = platesPerSide(weightDisplay, barDisplay, unit);

  return (
    <div className="rounded-te-md overflow-hidden" style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 active:bg-white/[0.03] transition-colors"
      >
        <span className="te-label" style={{ color: 'var(--te-text-3)' }}>
          Plates per side · bar {fmtPlate(barDisplay)}{unit}
        </span>
        <ChevronDownIcon
          className="w-3.5 h-3.5 te-t4 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div className="grid" style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="px-3.5 pb-3 pt-0.5">
            {!breakdown ? (
              <p className="te-label" style={{ color: 'var(--te-text-4)' }}>Set a barbell weight in Settings to use this.</p>
            ) : breakdown.plates.length === 0 ? (
              <p className="te-label" style={{ color: 'var(--te-text-4)' }}>
                {weightDisplay <= barDisplay ? 'Empty bar (or lighter than the bar).' : 'Bar only.'}
              </p>
            ) : (
              <div className="flex items-center flex-wrap gap-1.5">
                {breakdown.plates.map((p, i) => {
                  // Plate pill height scales with weight so the row reads like
                  // a loaded sleeve at a glance.
                  const max = unit === 'lbs' ? 45 : 25;
                  const h = 22 + Math.round((p / max) * 14);
                  return (
                    <span
                      key={i}
                      className="te-mono tabular-nums flex items-center justify-center rounded-[5px] shrink-0"
                      style={{
                        fontSize: 10, fontWeight: 700, minWidth: 30, height: h,
                        padding: '0 5px',
                        background: 'var(--te-border-strong)',
                        border: '1px solid rgba(244,241,236,0.14)',
                        color: 'var(--te-text-1)',
                      }}
                    >
                      {fmtPlate(p)}
                    </span>
                  );
                })}
                {breakdown.leftover > 0.01 && (
                  <span className="te-label" style={{ color: 'var(--te-warn)' }}>
                    +{fmtPlate(Math.round(breakdown.leftover * 100) / 100)}{unit} left over
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LogModal({
  open, onClose, onSave, onUpdate, onDelete,
  exercise, exercises = [], editLog,
  unit, toDisplay, fromDisplay, barbellWeight,
}: Props) {
  const [step, setStep] = useState<'pick' | 'log'>('log');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [reps, setReps] = useState(0);
  const [displayWeight, setDisplayWeight] = useState(0);
  const [comment, setComment] = useState('');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [setType, setSetType] = useState<SetType>('working');

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    setSearch('');
    setConfirmDelete(false);

    if (editLog) {
      const ex = editLog.exercises ?? exercises.find(e => e.id === editLog.exercise_id) ?? null;
      setSelected(ex);
      setReps(editLog.reps_done);
      setDisplayWeight(toDisplay(editLog.weight));
      setComment(editLog.comment ?? '');
      setSetType(editLog.set_type ?? 'working');
      setStep('log');
    } else if (exercise) {
      setSelected(exercise);
      setStep('log');
      setReps(exercise.target_reps);
      setDisplayWeight(toDisplay(exercise.weight));
      setComment('');
      setSetType('working');
    } else {
      setSelected(null);
      setStep('pick');
      setReps(0);
      setDisplayWeight(0);
      setComment('');
      setSetType('working');
    }
  }, [editLog, exercise, open]);

  function pickExercise(ex: Exercise) {
    setSelected(ex);
    setReps(ex.target_reps);
    setDisplayWeight(toDisplay(ex.weight));
    setStep('log');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = fromDisplay(displayWeight);
    if (editLog && onUpdate) {
      onUpdate(editLog.id, { reps_done: reps, weight: weightKg, sets: 1, comment, set_type: setType });
      onClose();
      return;
    }
    if (!selected) return;
    onSave({ exercise_id: selected.id, reps_done: reps, weight: weightKg, sets: 1, comment, set_type: setType });
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (editLog && onDelete) {
      feedback.deleteLog();
      onDelete(editLog.id);
      onClose();
    }
  }

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase())
  );

  if (step === 'pick') {
    return (
      <Modal open={open} onClose={onClose} title="Choose exercise">
        <div className="space-y-3">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search exercises"
          />
          {filtered.length === 0 ? (
            <div className="te-panel rounded-te-md px-4 py-8 text-center">
              <p className="text-[15px] font-semibold te-t1 tracking-tight">No exercises found</p>
              <p className="text-[13px] te-t3 mt-1 leading-snug">Try a different search.</p>
            </div>
          ) : (
            <div className="space-y-2 pb-2">
              {filtered.map(ex => (
                <ExercisePickerCard
                  key={ex.id}
                  ex={ex}
                  onPick={() => pickExercise(ex)}
                  toDisplay={toDisplay}
                  unit={unit}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  const isEditing = !!editLog;
  const weightStep = unit === 'lbs' ? 1 : 0.5;
  const weightBigStep = unit === 'lbs' ? 5 : 2.5;

  const canGoBack = !exercise && !isEditing;

  return (
    <Modal open={open} onClose={onClose} title="" onBack={canGoBack ? () => { setStep('pick'); setSelected(null); } : undefined}>
      <form onSubmit={handleSubmit} className="space-y-[15px] pt-1">

        {/* Reps stepper */}
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} bigStep={5} min={0} />

        {/* Weight stepper */}
        <Stepper
          label={`Weight (${unit})`}
          value={displayWeight}
          onChange={setDisplayWeight}
          step={weightStep}
          bigStep={weightBigStep}
          min={0}
          fractional={true}
        />

        {/* Plate calculator — barbell-loaded exercises only */}
        {(selected?.load_type ?? 'weighted') === 'weighted' && (
          <PlateCalc weightDisplay={displayWeight} barbellKg={barbellWeight} unit={unit} toDisplay={toDisplay} />
        )}

        {/* Set type — horizontally scrollable (room for more types later) */}
        <div className="flex gap-2.5 overflow-x-auto -my-1 py-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {SET_TYPES.map(({ key, label }) => (
            <ToggleButton
              key={key}
              active={setType === key}
              onClick={() => setSetType(key)}
              label={label}
              className="flex-1 min-w-[88px]"
              heightPx={36}
            />
          ))}
        </div>

        {/* Log set */}
        <button
          type="submit"
          className="te-white-btn w-full h-[55px] rounded-te-md flex items-center justify-center gap-1.5"
        >
          <CheckIcon className="w-[15px] h-[15px] text-black stroke-[2.5]" />
          <span className="text-[15px] font-semibold text-black tracking-[-0.17px]">
            {isEditing ? 'Update' : 'Log set'}
          </span>
        </button>

        {isEditing && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className={`w-full py-3 rounded-te-md text-[13px] font-semibold transition-all active:opacity-75 ${
              confirmDelete
                // Grey at rest — deleting is a rare escape hatch, not something
                // the sheet should advertise. Only the armed state goes red.
                ? 'bg-[color-mix(in_srgb,var(--te-danger)_15%,transparent)] text-[color:var(--te-danger)] border border-[color-mix(in_srgb,var(--te-danger)_25%,transparent)]'
                : 'te-t4'
            }`}
          >
            {confirmDelete ? 'Tap again to confirm' : 'Delete log'}
          </button>
        )}
      </form>
    </Modal>
  );
}
