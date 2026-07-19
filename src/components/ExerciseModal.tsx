import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { SECTION_LABEL, ToggleButton } from './SheetControls';
import SwipeStepper from './SwipeStepper';
import type { Exercise, LoadType } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

// Exercises are categorised by body half only. The granular muscle-group list
// (chest, biceps, quads, …) was dropped: it drove nothing but the category
// colour, and upper/lower is all the grouping the app actually uses.
const GROUPS: { key: string; label: string }[] = [
  { key: 'upper', label: 'Upper body' },
  { key: 'lower', label: 'Lower body' },
];

const LOAD_TYPES: { key: LoadType; label: string }[] = [
  { key: 'weighted', label: 'Weighted' },
  { key: 'bodyweight', label: 'Bodyweight' },
  { key: 'weighted_bw', label: 'Weighted BW' },
];

// Collapse any stored muscle_group (including legacy granular ones like
// 'quads' or 'chest') onto the two body halves, so editing an older exercise
// still lands on a valid toggle.
const LOWER_GROUPS = new Set(['lower', 'legs', 'lower back', 'quads', 'hamstrings', 'glutes', 'calves']);
function normalizeGroup(g: string): 'upper' | 'lower' {
  return LOWER_GROUPS.has(g) ? 'lower' : 'upper';
}

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
  const weightStep = unit === 'lbs' ? 1 : 0.5;

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    setConfirmDelete(false);
    if (exercise) {
      setName(exercise.name);
      setGroup(normalizeGroup(exercise.muscle_group));
      setLoadType(exercise.load_type ?? 'weighted');
      setReps(String(exercise.target_reps));
      setSets(String(exercise.sets));
      setDisplayWeight(String(toDisplay(exercise.weight)));
    } else if (prefill) {
      setName(prefill.name);
      setGroup(normalizeGroup(prefill.muscle_group));
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
          className="w-full h-[55px] rounded-te-md px-5 te-t1 text-[15px] placeholder:text-white/25 focus:outline-none focus:border-white/[0.13] transition-colors"
          style={{ background: 'var(--te-well)', border: '1px solid var(--te-border-strong)' }}
          autoFocus
        />

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Target</p>
          <div className={`grid gap-2.5 ${loadType === 'bodyweight' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <SwipeStepper label="Reps" value={reps} onChange={setReps} min={1} step={1} />
            <SwipeStepper label="Sets" value={sets} onChange={setSets} min={1} step={1} />
            {loadType !== 'bodyweight' && (
              <SwipeStepper
                label={loadType === 'weighted_bw' ? `Added (${unit})` : `Weight (${unit})`}
                value={displayWeight}
                onChange={setDisplayWeight}
                min={0}
                step={weightStep}
                fractional
              />
            )}
          </div>
        </div>

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Body</p>
          <div className="grid grid-cols-2 gap-2.5">
            {GROUPS.map(g => (
              <ToggleButton
                key={g.key}
                active={group === g.key}
                onClick={() => setGroup(g.key)}
                label={g.label}
                heightPx={36}
              />
            ))}
          </div>
        </div>

        {/* Colour is a property of the body half, not the individual exercise,
            so it belongs in Settings › Exercise colors rather than here — this
            sheet was offering a control that silently recoloured every other
            exercise sharing the category. */}

        <div className="space-y-2.5">
          <p style={SECTION_LABEL}>Type</p>
          <div className="grid grid-cols-3 gap-2.5">
            {LOAD_TYPES.map(({ key, label }) => (
              <ToggleButton key={key} active={loadType === key} onClick={() => setLoadType(key)} label={label} heightPx={36} />
            ))}
          </div>
        </div>

        <div className="pt-1 space-y-2.5">
          <button
            type="submit"
            disabled={!name.trim()}
            className="te-white-btn w-full h-[55px] rounded-te-md flex items-center justify-center gap-1.5 disabled:opacity-30"
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
              className={`w-full py-3.5 rounded-te-md text-[13px] font-semibold transition-all active:opacity-75 ${
                confirmDelete
                  // Grey at rest — deleting is a rare escape hatch, not something
                  // the sheet should advertise. Only the armed state goes red.
                  ? 'bg-[color-mix(in_srgb,var(--te-danger)_15%,transparent)] text-[color:var(--te-danger)] border border-[color-mix(in_srgb,var(--te-danger)_25%,transparent)]'
                  : 'te-t4'
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
