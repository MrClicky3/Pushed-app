import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { SECTION_LABEL, WHITE_BUTTON, ToggleButton } from './SheetControls';
import type { Exercise, LoadType } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

const GROUPS = [
  'upper', 'lower',
  'chest', 'upper back', 'lower back', 'shoulders',
  'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
];

const LOAD_TYPES: { key: LoadType; label: string }[] = [
  { key: 'weighted', label: 'Weighted' },
  { key: 'bodyweight', label: 'Bodyweight' },
  { key: 'weighted_bw', label: 'Weighted BW' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<Exercise, 'id' | 'device_id' | 'created_at'>) => void;
  onDelete?: (id: string) => void;
  exercise?: Exercise | null;
  prefill?: { name: string; muscle_group: string };
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  fromDisplay: (val: number) => number;
}

export default function ExerciseModal({ open, onClose, onSave, onDelete, exercise, prefill, unit, toDisplay, fromDisplay }: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('upper');
  const [loadType, setLoadType] = useState<LoadType>('weighted');
  const [reps, setReps] = useState('12');
  const [sets, setSets] = useState('3');
  const [displayWeight, setDisplayWeight] = useState('0');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    setConfirmDelete(false);
    if (exercise) {
      setName(exercise.name);
      setGroup(exercise.muscle_group);
      setLoadType(exercise.load_type ?? 'weighted');
      setReps(String(exercise.target_reps));
      setSets(String(exercise.sets));
      setDisplayWeight(String(toDisplay(exercise.weight)));
    } else if (prefill) {
      setName(prefill.name);
      setGroup(prefill.muscle_group);
      setLoadType('weighted');
      setReps('');
      setSets('');
      setDisplayWeight('0');
    } else {
      setName('');
      setGroup('upper');
      setLoadType('weighted');
      setReps('12');
      setSets('3');
      setDisplayWeight('0');
    }
  }, [exercise, prefill, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Pure bodyweight carries no external load.
    const weight = loadType === 'bodyweight' ? 0 : fromDisplay(Number(displayWeight) || 0);
    onSave({ name: name.trim(), muscle_group: group, target_reps: Number(reps) || 0, sets: Number(sets) || 0, weight, load_type: loadType });
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (exercise && onDelete) {
      onDelete(exercise.id);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="">
      <form onSubmit={handleSubmit} className="space-y-5">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Exercise name"
          className="w-full h-[55px] rounded-[20px] px-5 text-white text-[15px] placeholder:text-[#5c5a58] focus:outline-none focus:border-white/[0.16] transition-colors"
          style={{ background: '#0b0b0b', border: '1px solid #232323' }}
          autoFocus
        />

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Muscle group</p>
          <div
            className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {GROUPS.map(g => (
              <ToggleButton
                key={g}
                active={group === g}
                onClick={() => setGroup(g)}
                label={g}
                className="shrink-0 px-5"
              />
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Type</p>
          <div className="grid grid-cols-3 gap-2.5">
            {LOAD_TYPES.map(({ key, label }) => (
              <ToggleButton key={key} active={loadType === key} onClick={() => setLoadType(key)} label={label} />
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Target</p>
          <div className={`grid gap-2.5 ${loadType === 'bodyweight' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {[
              { label: `Reps`, value: reps, onChange: setReps, min: 1, step: 1 },
              { label: 'Sets', value: sets, onChange: setSets, min: 1, step: 1 },
              ...(loadType === 'bodyweight' ? [] : [
                { label: loadType === 'weighted_bw' ? `Added (${unit})` : `Weight (${unit})`, value: displayWeight, onChange: setDisplayWeight, min: 0, step: 0.5 },
              ]),
            ].map(({ label, value, onChange, min, step }) => (
              <div
                key={label}
                className="flex flex-col justify-between h-[80px] rounded-[20px]"
                style={{ background: '#0b0b0b', padding: '13px' }}
              >
                <p className="te-label">{label}</p>
                <input
                  type="number"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  onFocus={e => e.target.select()}
                  min={min}
                  step={step}
                  inputMode="decimal"
                  className="w-full bg-transparent text-white !text-[42px] font-bold te-mono focus:outline-none tabular-nums !leading-[32px] tracking-[-1px] text-left"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-1 space-y-2.5">
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full h-[55px] rounded-[20px] flex items-center justify-center gap-1.5 disabled:opacity-30 active:opacity-80 transition-opacity"
            style={WHITE_BUTTON}
          >
            <CheckIcon className="w-[15px] h-[15px] text-black stroke-[2.5]" />
            <span className="text-[15px] font-semibold text-black tracking-[-0.17px]">
              {exercise ? 'Save changes' : 'Add exercise'}
            </span>
          </button>

          {exercise && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className={`w-full py-3.5 rounded-[20px] text-[13px] font-semibold transition-all active:opacity-75 ${
                confirmDelete
                  ? 'bg-apple-red/15 text-apple-red border border-apple-red/25'
                  : 'text-apple-red/50'
              }`}
            >
              {confirmDelete ? 'Tap again to confirm' : 'Delete exercise'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
