import { useState, useEffect, useMemo } from 'react';
import { ChevronRightIcon, CheckIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import Modal from './Modal';
import { WHITE_BUTTON, ToggleButton } from './SheetControls';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import type { Exercise, WorkoutLog, SetType } from '../types';
import type { WeightUnit } from '../hooks/useSettings';
import { feedback } from '../lib/feedback';
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
      className="te-panel w-full rounded-2xl overflow-hidden active:opacity-80 transition-opacity flex items-stretch text-left"
    >
      <div style={{
        width: 64, flexShrink: 0,
        background: '#0c0c10',
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
        <p className="text-[15px] font-semibold text-[#f4f1ec] truncate" style={{ letterSpacing: '-0.005em' }}>{ex.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="te-mono text-[11px] text-white/40 tabular-nums">{ex.target_reps}×{ex.sets}</span>
          <span className="te-mono text-[9px] text-white/20">·</span>
          <span className="te-mono text-[11px] text-white/40 tabular-nums">{toDisplay(ex.weight)}{unit}</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center gap-1 pr-4 shrink-0">
        <GroupChip group={ex.muscle_group} />
        <ChevronRightIcon className="w-4 h-4 text-white/20 shrink-0" />
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
  const isUpper = group === 'upper';
  const isLower = group === 'lower';
  const dotColor = isUpper ? 'var(--te-upper)' : isLower ? 'var(--te-lower)' : 'rgba(244,241,236,0.3)';
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
      className="te-toggle-off w-[50px] h-[35px] rounded-[50px] flex items-center justify-center te-mono text-[20px] text-white/80 select-none shrink-0"
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

  return (
    <div className="flex flex-col items-center gap-2.5 w-full">
      <span className="te-label" style={{ letterSpacing: '0.06em' }}>{label}</span>
      <div className="flex items-center justify-center gap-[15px] w-full">
        <StepperBtn label="–" onPress={() => onChange(clamp(value - step))} onLongPress={() => onChange(clamp(value - bigStep))} />

        <div className="flex-1 flex items-center justify-center rounded-[20px]" style={{ background: '#0b0b0b', border: '1px solid #232323' }}>
          <input
            type="number"
            inputMode="decimal"
            value={display}
            onChange={handleInputChange}
            onFocus={e => e.target.select()}
            min={min}
            step="any"
            className="te-mono !text-[52px] font-bold text-white tabular-nums !leading-[38px] bg-transparent border-none focus:outline-none w-full text-center"
            style={{ letterSpacing: '-1px' }}
          />
        </div>

        <StepperBtn label="+" onPress={() => onChange(clamp(value + step))} onLongPress={() => onChange(clamp(value + bigStep))} />
      </div>
    </div>
  );
}

export default function LogModal({
  open, onClose, onSave, onUpdate, onDelete,
  exercise, exercises = [], editLog,
  unit, toDisplay, fromDisplay,
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
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="te-field w-full rounded-xl px-4 py-3 text-white text-[15px] placeholder:text-white/25 focus:outline-none focus:border-white/[0.16] transition-colors"
            autoFocus
          />
          {filtered.length === 0 ? (
            <p className="te-label text-center py-8">No exercises found</p>
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

        {/* Set type — horizontally scrollable (room for more types later) */}
        <div className="flex gap-2.5 overflow-x-auto -my-1 py-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {SET_TYPES.map(({ key, label }) => (
            <ToggleButton
              key={key}
              active={setType === key}
              onClick={() => setSetType(key)}
              label={label}
              className="flex-1 min-w-[96px]"
            />
          ))}
        </div>

        {/* Log set */}
        <button
          type="submit"
          className="w-full h-[55px] rounded-[20px] flex items-center justify-center gap-1.5 active:opacity-80 transition-opacity"
          style={WHITE_BUTTON}
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
            className={`w-full py-3 rounded-[20px] text-[13px] font-semibold transition-all active:opacity-75 ${
              confirmDelete
                ? 'bg-apple-red/15 text-apple-red border border-apple-red/25'
                : 'text-apple-red/50'
            }`}
          >
            {confirmDelete ? 'Tap again to confirm' : 'Delete log'}
          </button>
        )}
      </form>
    </Modal>
  );
}
