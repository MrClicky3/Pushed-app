// Routines — self-contained section on the Profile page. The bento grid of
// routine cards (plus a "New routine" card) is the only thing that touches the
// page directly; everything else — previewing, editing, and the weekly
// schedule — happens in pop-ups launched from here. Nothing about routines
// lives in Settings anymore.
import { useState, useEffect, useMemo } from 'react';
import {
  PlusIcon, QueueListIcon, PencilSquareIcon, CalendarIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';
import WeekCalendar from './WeekCalendar';
import { addDays, dowMon, startOfDay, startOfWeekFor } from '../lib/calendarDays';
import type { Routine, ScheduleDay, Exercise } from '../types';
import type { WeightUnit, WeekStartDay } from '../hooks/useSettings';
import {
  categoryVar, CATEGORY_KEYS,
} from '../lib/categoryColors';

// Right-hand load label for a routine-preview exercise row: "30kg" | "BW" | "BW +10kg"
function loadLabel(ex: Exercise, unit: WeightUnit, toDisplay: (kg: number) => number): string {
  if (ex.load_type === 'bodyweight') return 'BW';
  if (ex.load_type === 'weighted_bw') {
    return ex.weight > 0 ? `BW +${toDisplay(ex.weight)}${unit}` : 'BW';
  }
  return `${toDisplay(ex.weight)}${unit}`;
}

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const MUSCLE_GROUPS = ['upper', 'lower'];
const GROUP_LABEL: Record<string, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
};

interface Props {
  routines: Routine[];
  schedule: ScheduleDay[];
  exercises: Exercise[];
  onAddRoutine: (name: string, exercise_ids: string[]) => Routine | Promise<Routine>;
  onUpdateRoutine: (id: string, name: string, exercise_ids: string[]) => void;
  onDeleteRoutine: (id: string) => void;
  onAssignDay: (day_of_week: number, routine_id: string | null) => void;
  /** Closes this page's flow, jumps to Exercises and opens the add form —
      the escape hatch from building a routine with no exercises to put in it. */
  onCreateExercise: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  /** Drives the schedule calendar's start-of-week, same as the Log page. */
  weekStartDay: WeekStartDay;
  /** Set from outside (e.g. the Logs "Create a routine" prompt) to open a
      fresh New-routine editor. Cleared via onPendingEditorConsumed once opened,
      so it never re-fires when this section remounts. */
  pendingEditorOpen?: boolean;
  onPendingEditorConsumed?: () => void;
}

export default function RoutinesSection({
  routines, schedule, exercises,
  onAddRoutine, onUpdateRoutine, onDeleteRoutine, onAssignDay,
  onCreateExercise, unit, toDisplay, weekStartDay,
  pendingEditorOpen = false, onPendingEditorConsumed,
}: Props) {
  const [previewRoutine, setPreviewRoutine] = useState<Routine | null>(null);
  // Routine editor popup. `null` = closed; `{ routine }` opens it
  // (routine=null → creating a new one).
  const [routineEditor, setRoutineEditor] = useState<{ routine: Routine | null } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Editor form state
  const [routineName, setRoutineName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // External request → open a fresh New-routine editor, then clear the flag so
  // it doesn't re-open on a later remount.
  useEffect(() => {
    if (pendingEditorOpen) {
      setRoutineEditor({ routine: null });
      onPendingEditorConsumed?.();
    }
  }, [pendingEditorOpen, onPendingEditorConsumed]);

  // Populate editor fields whenever it opens.
  useEffect(() => {
    if (!routineEditor) return;
    setConfirmDelete(false);
    if (routineEditor.routine) {
      setRoutineName(routineEditor.routine.name);
      setSelectedExerciseIds(routineEditor.routine.exercise_ids);
    } else {
      setRoutineName('');
      setSelectedExerciseIds([]);
    }
  }, [routineEditor]);

  function getRoutineForDay(day: number): Routine | null {
    const entry = schedule.find(s => s.day_of_week === day);
    if (!entry?.routine_id) return null;
    return routines.find(r => r.id === entry.routine_id) ?? null;
  }

  function toggleExercise(id: string) {
    setSelectedExerciseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function handleSaveRoutine() {
    if (!routineName.trim() || selectedExerciseIds.length === 0) return;
    if (!routineEditor) return;
    if (routineEditor.routine) {
      onUpdateRoutine(routineEditor.routine.id, routineName.trim(), selectedExerciseIds);
    } else {
      await onAddRoutine(routineName.trim(), selectedExerciseIds);
    }
    setRoutineEditor(null);
  }

  function handleDeleteRoutine() {
    if (!routineEditor?.routine) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDeleteRoutine(routineEditor.routine.id);
    setRoutineEditor(null);
  }

  // Group exercises by muscle group for the editor's picker.
  const groupedExercises: Record<string, Exercise[]> = {};
  for (const ex of exercises) {
    (groupedExercises[ex.muscle_group] ??= []).push(ex);
  }
  const allGroups = [
    ...MUSCLE_GROUPS.filter(g => groupedExercises[g]),
    ...Object.keys(groupedExercises).filter(g => !MUSCLE_GROUPS.includes(g)).sort(),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="text-[17px] font-bold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          Routines
        </p>
        {routines.length > 0 && (
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-1.5 text-[13px] font-semibold te-t1 tracking-tight active:opacity-60 transition-opacity"
          >
            <CalendarIcon className="w-4 h-4" /> Schedule
          </button>
        )}
      </div>

      {/* Bento grid — routine cards plus a persistent "New routine" card, so the
          empty state is just the "+" card, no prose. */}
      <div className="grid grid-cols-2 gap-3">
        {routines.map(r => (
          <button
            key={r.id}
            onClick={() => setPreviewRoutine(r)}
            className="te-panel-dark rounded-te-md aspect-[7/6] p-3.5 flex flex-col justify-between text-left active:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(244,241,236,0.08)' }}>
              <QueueListIcon className="w-4 h-4 te-t3" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold te-t1 tracking-tight truncate">{r.name}</p>
              <p className="te-label mt-0.5">
                {r.exercise_ids.length} exercise{r.exercise_ids.length !== 1 ? 's' : ''}
              </p>
            </div>
          </button>
        ))}
        <button
          onClick={() => setRoutineEditor({ routine: null })}
          className="te-panel rounded-te-md aspect-[7/6] flex flex-col items-center justify-center gap-1.5 active:bg-white/[0.04] transition-colors"
        >
          <PlusIcon className="w-5 h-5 te-t4" />
          <span className="te-label">New routine</span>
        </button>
      </div>

      {/* ── Routine preview — read-only, with an edit shortcut ─────────── */}
      <Modal open={!!previewRoutine} onClose={() => setPreviewRoutine(null)} title={previewRoutine?.name ?? ''}>
        {previewRoutine && (
          <div className="space-y-3">
            {previewRoutine.exercise_ids.length > 0 ? (
              <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">
                {previewRoutine.exercise_ids.map(id => {
                  const ex = exercises.find(e => e.id === id);
                  if (!ex) return null;
                  return (
                    <div key={id} className="w-full h-[58px] flex items-center gap-3 px-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold te-t1 truncate" style={{ letterSpacing: '-0.17px' }}>
                          {ex.name}
                        </p>
                        <p className="te-mono text-[10px] mt-[1px]" style={{ color: 'var(--te-text-4)' }}>
                          {ex.target_reps} x {ex.sets}
                        </p>
                      </div>
                      <span className="te-mono text-[17px] font-semibold te-t2 tabular-nums uppercase shrink-0 leading-none">
                        {loadLabel(ex, unit, toDisplay)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] te-t3 text-center py-4">No exercises in this routine yet.</p>
            )}
            <button
              onClick={() => { const r = previewRoutine; setPreviewRoutine(null); setRoutineEditor({ routine: r }); }}
              className="te-panel w-full flex items-center justify-center gap-2 px-4 py-3 rounded-te-md active:bg-white/[0.04] transition-colors"
            >
              <PencilSquareIcon className="w-4 h-4 te-t4" />
              <span className="te-label">Edit routine</span>
            </button>
          </div>
        )}
      </Modal>

      {/* ── Weekly schedule — the same week calendar as the Log page in a
             pop-up: pick a day, then assign it a routine, all in one sheet. ── */}
      <ScheduleSheet
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        routines={routines}
        weekStartDay={weekStartDay}
        getRoutineForDay={getRoutineForDay}
        onAssignDay={onAssignDay}
      />

      {/* ── Routine editor — create / edit in a pop-up ────────────────── */}
      <Modal
        open={routineEditor !== null}
        onClose={() => setRoutineEditor(null)}
        title={routineEditor?.routine ? 'Edit routine' : 'New routine'}
      >
        <div className="space-y-4">
          <input
            type="text"
            value={routineName}
            onChange={e => setRoutineName(e.target.value)}
            placeholder="Routine name"
            data-no-drag
            className="te-field w-full rounded-te-sm px-4 py-3 te-t1 text-[15px] placeholder:text-white/25 focus:outline-none"
          />

          {exercises.length > 0 ? (
            <div>
              <p className="text-[17px] font-bold te-t1 tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>Exercises</p>
              <div className="space-y-3">
                {allGroups.map(group => (
                  <div key={group}>
                    <div className="flex items-center gap-2 mb-2 px-0.5">
                      <span className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: categoryVar(group) }} />
                      <span
                        className="te-label"
                        style={{ color: CATEGORY_KEYS.includes(group as never) ? categoryVar(group) : undefined }}
                      >
                        {GROUP_LABEL[group] ?? group.charAt(0).toUpperCase() + group.slice(1)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {groupedExercises[group].map(ex => {
                        const on = selectedExerciseIds.includes(ex.id);
                        return (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() => toggleExercise(ex.id)}
                            className={`${on ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} px-3 py-1.5 rounded-te-sm text-[13px] font-semibold select-none`}
                            style={{ color: on ? 'var(--te-ink)' : 'var(--te-text-4)' }}
                          >
                            {ex.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-[13px] te-t3">Add exercises first to build a routine.</p>
              <button
                type="button"
                onClick={onCreateExercise}
                className="te-fab w-full mt-3 py-3.5 rounded-te-sm te-mono text-[13px] tracking-[0.08em] uppercase te-t1 active:opacity-80 transition-opacity"
              >
                Create an exercise
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveRoutine}
            disabled={!routineName.trim() || selectedExerciseIds.length === 0}
            className="te-fab w-full py-3.5 rounded-te-sm te-mono text-[13px] tracking-[0.08em] uppercase te-t1 disabled:opacity-30 active:opacity-80 transition-opacity"
          >
            {routineEditor?.routine ? 'Save changes' : 'Create routine'}
          </button>

          {routineEditor?.routine && (
            <button
              type="button"
              onClick={handleDeleteRoutine}
              className={`w-full py-3 rounded-te-sm text-[13px] font-semibold transition-all active:opacity-75 ${
                confirmDelete
                  ? 'bg-[color-mix(in_srgb,var(--te-danger)_15%,transparent)] text-[color:var(--te-danger)] border border-[color-mix(in_srgb,var(--te-danger)_25%,transparent)]'
                  : 'text-[color:var(--te-danger)]/50'
              }`}
            >
              {confirmDelete ? 'Tap again to confirm' : 'Delete routine'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Weekly schedule sheet ──────────────────────────────────────────
// The same swipeable week calendar as the Log page, used here purely as a day
// picker: tap a day, then assign it a routine. The schedule is day-of-week
// based, so any date in a given weekday column maps to the same assignment.
function ScheduleSheet({
  open, onClose, routines, weekStartDay, getRoutineForDay, onAssignDay,
}: {
  open: boolean;
  onClose: () => void;
  routines: Routine[];
  weekStartDay: WeekStartDay;
  getRoutineForDay: (day: number) => Routine | null;
  onAssignDay: (day_of_week: number, routine_id: string | null) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekFor(today, weekStartDay));

  // Land on the current week / today each time the sheet opens.
  useEffect(() => {
    if (open) {
      setSelectedDate(today);
      setWeekStart(startOfWeekFor(today, weekStartDay));
    }
  }, [open, today, weekStartDay]);

  const selectedDow = dowMon(selectedDate);
  const currentRoutineId = getRoutineForDay(selectedDow)?.id ?? null;

  return (
    <Modal open={open} onClose={onClose} title="Weekly schedule">
      <div className="space-y-4">
        {/* No completion arc here — the calendar is a pure day picker, so
            progress is flat and a bright initial just marks a scheduled day. */}
        <WeekCalendar
          weekStart={weekStart}
          selectedDate={selectedDate}
          today={today}
          onSelect={setSelectedDate}
          onShiftWeek={delta => setWeekStart(prev => addDays(prev, delta * 7))}
          progressFor={() => 0}
          hasScheduleFor={d => getRoutineForDay(dowMon(d)) != null}
        />

        {/* Assignment list for the selected day */}
        <div>
          <p className="te-label mb-2 px-0.5">{DAY_FULL[selectedDow]}</p>
          {routines.length === 0 ? (
            <p className="text-[13px] te-t3 text-center py-4">Create a routine first.</p>
          ) : (
            <div className="space-y-2.5">
              <button
                onClick={() => onAssignDay(selectedDow, null)}
                className="te-panel w-full flex items-center px-4 py-3.5 rounded-te-md gap-3 active:bg-white/[0.04] transition-colors text-left"
              >
                <span className="flex-1 text-[15px] font-semibold te-t1 tracking-tight">Rest / Off</span>
                {currentRoutineId === null && <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />}
              </button>

              {routines.map(r => {
                const isActive = currentRoutineId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => onAssignDay(selectedDow, r.id)}
                    className="te-panel w-full flex items-center px-4 py-3.5 rounded-te-md gap-3 active:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="flex-1 min-w-0 text-[15px] font-semibold te-t1 tracking-tight truncate">{r.name}</span>
                    {isActive && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--te-success)' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
