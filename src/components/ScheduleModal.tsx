import { useState, useEffect } from 'react';
import {
  ChevronRightIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  QueueListIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import FullPageSheet from './FullPageSheet';
import Modal from './Modal';
import type { Routine, ScheduleDay, WorkoutLog } from '../types';
import type { Exercise } from '../types';
import type { WeightUnit, WeekStartDay } from '../hooks/useSettings';
import { ACCENTS, ACCENT_ORDER, type AccentKey } from '../lib/accent';
import ReportBugSheet from './ReportBugSheet';

// Right-hand load label for a routine-preview exercise row: "30kg" | "BW" | "BW +10kg"
function loadLabel(ex: Exercise, unit: WeightUnit, toDisplay: (kg: number) => number): string {
  if (ex.load_type === 'bodyweight') return 'BW';
  if (ex.load_type === 'weighted_bw') {
    return ex.weight > 0 ? `BW +${toDisplay(ex.weight)}${unit}` : 'BW';
  }
  return `${toDisplay(ex.weight)}${unit}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Group headers with color mapping
const MUSCLE_GROUPS = ['upper', 'lower'];
const GROUP_LABEL: Record<string, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
};

type View =
  | { type: 'main' }
  | { type: 'plan' };

interface Props {
  open: boolean;
  onClose: () => void;
  // Jumps straight to the "New routine" editor when the sheet opens, instead
  // of the main settings list — used by the Logs page's no-routine prompt.
  initialView?: 'routine';
  routines: Routine[];
  schedule: ScheduleDay[];
  exercises: Exercise[];
  onAddRoutine: (name: string, exercise_ids: string[]) => Routine;
  onUpdateRoutine: (id: string, name: string, exercise_ids: string[]) => void;
  onDeleteRoutine: (id: string) => void;
  onAssignDay: (day_of_week: number, routine_id: string | null) => void;
  onSignOut: () => void;
  userName: string;
  onUpdateName: (name: string) => Promise<string | null>;
  timerDuration: number;
  onSetTimerDuration: (d: number) => void;
  barbellWeight: number;
  onSetBarbellWeight: (w: number) => void;
  showDuration: boolean;
  onSetShowDuration: (on: boolean) => void;
  weekStartDay: WeekStartDay;
  onSetWeekStartDay: (d: WeekStartDay) => void;
  soundEnabled: boolean;
  onSetSoundEnabled: (on: boolean) => void;
  hapticsEnabled: boolean;
  onSetHapticsEnabled: (on: boolean) => void;
  accent: AccentKey;
  onSetAccent: (key: AccentKey) => void;
  unit: WeightUnit;
  onSetUnit: (u: WeightUnit) => void;
  toDisplay: (kg: number) => number;
  fromDisplay: (val: number) => number;
  logs: WorkoutLog[];
}

// Segmented −/value/+ control whose middle value is also tap-to-edit: focus it
// and type a new value, commit on blur/Enter. `onCommit` receives the raw
// typed string to parse.
function StepperControl({
  text, suffix, inputMode = 'numeric', onDec, onInc, onCommit,
}: {
  text: string;
  suffix?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
  onDec: () => void;
  onInc: () => void;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const btn = 'flex items-center justify-center text-white/45 active:bg-white/[0.06] transition-colors select-none';
  return (
    <div className="flex items-center shrink-0 rounded-xl overflow-hidden" style={{ border: '1px solid var(--te-border)', background: '#0b0b0b' }}>
      <button type="button" onClick={onDec} className={btn} style={{ width: 38, height: 38, fontSize: 19 }}>−</button>
      <div className="w-px self-stretch" style={{ background: 'var(--te-border)' }} />
      <div className="flex items-center justify-center gap-0.5 px-1.5" style={{ minWidth: 56, height: 38 }}>
        <input
          value={editing ? draft! : text}
          onFocus={() => setDraft(text)}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null) onCommit(draft); setDraft(null); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          inputMode={inputMode}
          className="te-digit text-[14px] font-semibold text-white/85 tracking-tight tabular-nums bg-transparent focus:outline-none text-center"
          style={{ width: `${Math.max(text.length, 2)}ch` }}
        />
        {suffix && <span className="te-digit text-[14px] font-semibold text-white/85">{suffix}</span>}
      </div>
      <div className="w-px self-stretch" style={{ background: 'var(--te-border)' }} />
      <button type="button" onClick={onInc} className={btn} style={{ width: 38, height: 38, fontSize: 19 }}>+</button>
    </div>
  );
}

// ── Data export ──────────────────────────────────────────────────
function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildCsv(logs: WorkoutLog[], exercises: Exercise[]): string {
  const byId = new Map(exercises.map(e => [e.id, e]));
  const header = 'date,time,exercise,muscle_group,weight_kg,reps,set_type,comment';
  const rows = [...logs]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(l => {
      const ex = l.exercises ?? byId.get(l.exercise_id);
      const d = new Date(l.created_at);
      return [
        d.toISOString().slice(0, 10),
        d.toTimeString().slice(0, 5),
        csvEscape(ex?.name ?? 'Unknown'),
        ex?.muscle_group ?? '',
        String(l.weight),
        String(l.reps_done),
        l.set_type ?? 'working',
        csvEscape(l.comment ?? ''),
      ].join(',');
    });
  return [header, ...rows].join('\n');
}

async function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  // Prefer the share sheet on mobile (blob downloads are unreliable in iOS PWAs)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fmtTimer(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ScheduleModal({
  open,
  onClose,
  initialView,
  routines,
  schedule,
  exercises,
  onAddRoutine,
  onUpdateRoutine,
  onDeleteRoutine,
  onAssignDay,
  onSignOut,
  userName,
  onUpdateName,
  timerDuration,
  onSetTimerDuration,
  barbellWeight,
  onSetBarbellWeight,
  showDuration,
  onSetShowDuration,
  weekStartDay,
  onSetWeekStartDay,
  soundEnabled,
  onSetSoundEnabled,
  hapticsEnabled,
  onSetHapticsEnabled,
  accent,
  onSetAccent,
  unit,
  onSetUnit,
  toDisplay,
  fromDisplay,
  logs,
}: Props) {
  const [view, setView] = useState<View>({ type: 'main' });
  const [routineName, setRoutineName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [previewRoutine, setPreviewRoutine] = useState<Routine | null>(null);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  // Routine editor now lives in a popup layered over the Weekly plan view.
  // `null` = closed; `{ routine }` opens it (routine=null → creating a new one).
  const [routineEditor, setRoutineEditor] = useState<{ routine: Routine | null } | null>(null);
  // Day → routine assignment picker, also a popup over the plan (0=Mon…6=Sun).
  const [dayPicker, setDayPicker] = useState<number | null>(null);

  // Reset to main view when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setView({ type: 'main' });
        setConfirmDelete(false);
        setEditingName(false);
        setSignOutConfirm(false);
        setPreviewRoutine(null);
        setDataMenuOpen(false);
        setRoutineEditor(null);
        setDayPicker(null);
      }, 300);
    }
  }, [open]);

  // Jump straight to the routine editor (over the Weekly plan) when opened for
  // that purpose — the Logs page's no-routine prompt.
  useEffect(() => {
    if (open && initialView === 'routine') {
      setView({ type: 'plan' });
      setRoutineEditor({ routine: null });
    }
  }, [open, initialView]);

  // Populate editor fields whenever it opens.
  useEffect(() => {
    if (routineEditor) {
      setConfirmDelete(false);
      if (routineEditor.routine) {
        setRoutineName(routineEditor.routine.name);
        setSelectedExerciseIds(routineEditor.routine.exercise_ids);
      } else {
        setRoutineName('');
        setSelectedExerciseIds([]);
      }
    }
  }, [routineEditor]);

  const todayDow = (new Date().getDay() + 6) % 7; // 0=Mon ... 6=Sun

  function getScheduleForDay(day: number): ScheduleDay | undefined {
    return schedule.find(s => s.day_of_week === day);
  }

  function getRoutineForDay(day: number): Routine | null {
    const entry = getScheduleForDay(day);
    if (!entry?.routine_id) return null;
    return routines.find(r => r.id === entry.routine_id) ?? null;
  }

  function toggleExercise(id: string) {
    setSelectedExerciseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSaveRoutine() {
    // A routine needs a name and at least one exercise to be saveable.
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
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDeleteRoutine(routineEditor.routine.id);
    setRoutineEditor(null);
  }

  // Group exercises by muscle group
  const groupedExercises: Record<string, Exercise[]> = {};
  for (const ex of exercises) {
    const g = ex.muscle_group;
    if (!groupedExercises[g]) groupedExercises[g] = [];
    groupedExercises[g].push(ex);
  }
  const allGroups = [
    ...MUSCLE_GROUPS.filter(g => groupedExercises[g]),
    ...Object.keys(groupedExercises).filter(g => !MUSCLE_GROUPS.includes(g)).sort(),
  ];

  // ── Main view ──────────────────────────────────────────────────
  if (view.type === 'main') {
    return (
      <FullPageSheet open={open} onClose={onClose} title="Settings" padded>
        <div className="space-y-6">

          {/* Report a bug — prominent CTA for beta feedback */}
          <button
            onClick={() => setReportOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl active:opacity-90 transition-opacity text-left"
            style={{
              background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
              boxShadow: '0 6px 20px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.18)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2l1.5 2.5M16 2l-1.5 2.5" />
                <rect x="7" y="6" width="10" height="12" rx="5" />
                <path d="M12 6v12M3 10h4M17 10h4M3 15h4M17 15h4M4 6l3 2M20 6l-3 2M4 19l3-2M20 19l-3-2" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-white tracking-tight">Report a bug</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Found something off? Tell me — it really helps.
              </p>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-white/70 shrink-0" />
          </button>

          {/* Weekly plan & routines — lives on its own page */}
          <div>
            <p className="te-label mb-2 px-0.5">Training</p>
            <button
              onClick={() => setView({ type: 'plan' })}
              className="te-panel w-full flex items-center px-4 py-4 gap-3 rounded-2xl active:bg-white/[0.04] transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#f4f1ec] tracking-tight">Weekly plan &amp; routines</p>
                <p className="te-label mt-0.5">Schedule days and build routines</p>
              </div>
              <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
            </button>
          </div>

          {/* Preferences */}
          <div>
            <p className="te-label mb-2 px-0.5">Preferences</p>

            {/* Time settings — rest timer, barbell weight, and the calendar's
                start-of-week day. Just spaced apart from the toggles below,
                no separate heading. */}
            <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">

              {/* Rest timer duration */}
              <div className="flex items-center justify-between px-4 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Rest timer</p>
                  <p className="te-label mt-0.5">Auto-starts after each set</p>
                </div>
                <StepperControl
                  text={fmtTimer(timerDuration)}
                  inputMode="text"
                  onDec={() => onSetTimerDuration(timerDuration - 10)}
                  onInc={() => onSetTimerDuration(timerDuration + 10)}
                  onCommit={raw => {
                    const s = raw.trim();
                    let secs: number;
                    if (s.includes(':')) {
                      const [m, sec] = s.split(':');
                      secs = (parseInt(m || '0', 10) || 0) * 60 + (parseInt(sec || '0', 10) || 0);
                    } else {
                      secs = parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
                    }
                    if (secs > 0) onSetTimerDuration(secs);
                  }}
                />
              </div>

              {/* Barbell weight (for plate calculator) */}
              <div className="flex items-center justify-between px-4 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Barbell weight</p>
                  <p className="te-label mt-0.5">Used by the plate calculator</p>
                </div>
                <StepperControl
                  text={String(toDisplay(barbellWeight))}
                  suffix={unit}
                  inputMode="decimal"
                  onDec={() => onSetBarbellWeight(barbellWeight - 2.5)}
                  onInc={() => onSetBarbellWeight(barbellWeight + 2.5)}
                  onCommit={raw => {
                    const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
                    if (!isNaN(v)) onSetBarbellWeight(fromDisplay(v));
                  }}
                />
              </div>

              {/* Start week on — compact 3-way selector */}
              <div className="flex items-center justify-between px-4 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Start week on</p>
                  <p className="te-label mt-0.5">Log page calendar</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {([['saturday', 'Sat'], ['sunday', 'Sun'], ['monday', 'Mon']] as const).map(([d, label]) => {
                    const active = weekStartDay === d;
                    return (
                      <button
                        key={d}
                        onClick={() => onSetWeekStartDay(d)}
                        className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} rounded-lg select-none te-mono text-[12px] font-semibold`}
                        style={{ width: 42, height: 34, color: active ? '#0a0908' : 'rgba(255,255,255,0.4)' }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Toggles — weight unit alongside the other on/off preferences */}
            <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05] mt-3">

              {/* Weight unit — red toggle switch, same pattern as the other on/off rows */}
              <button
                onClick={() => onSetUnit(unit === 'kg' ? 'lbs' : 'kg')}
                className="w-full flex items-center justify-between px-4 py-3.5 gap-3 active:bg-white/[0.03] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Weight unit</p>
                  <p className="te-label mt-0.5">Used across the app</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="te-mono text-[12px] font-semibold uppercase" style={{ color: 'rgba(244,241,236,0.4)' }}>{unit}</span>
                  <div className="te-unit-track">
                    <div className={`te-unit-lever ${unit === 'lbs' ? 'te-unit-lever-right' : ''}`} />
                  </div>
                </div>
              </button>

              {/* Show workout duration */}
              <button
                onClick={() => onSetShowDuration(!showDuration)}
                className="w-full flex items-center justify-between px-4 py-3.5 gap-3 active:bg-white/[0.03] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Workout duration</p>
                  <p className="te-label mt-0.5">Show session time on the log page</p>
                </div>
                <div className="te-unit-track shrink-0">
                  <div className={`te-unit-lever ${showDuration ? 'te-unit-lever-right' : ''}`} />
                </div>
              </button>

              {/* Sounds */}
              <button
                onClick={() => onSetSoundEnabled(!soundEnabled)}
                className="w-full flex items-center justify-between px-4 py-3.5 gap-3 active:bg-white/[0.03] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Sounds</p>
                  <p className="te-label mt-0.5">Muted tones on logging and completion</p>
                </div>
                <div className="te-unit-track shrink-0">
                  <div className={`te-unit-lever ${soundEnabled ? 'te-unit-lever-right' : ''}`} />
                </div>
              </button>

              {/* Haptics */}
              <button
                onClick={() => onSetHapticsEnabled(!hapticsEnabled)}
                className="w-full flex items-center justify-between px-4 py-3.5 gap-3 active:bg-white/[0.03] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Haptics</p>
                  <p className="te-label mt-0.5">Vibrations on logging and completion</p>
                </div>
                <div className="te-unit-track shrink-0">
                  <div className={`te-unit-lever ${hapticsEnabled ? 'te-unit-lever-right' : ''}`} />
                </div>
              </button>

            </div>

            {/* Accent color — its own panel, spaced apart from the toggles */}
            <div className="te-panel rounded-2xl px-4 py-3.5 mt-3">
              <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Accent color</p>
              <p className="te-label mt-0.5">Toggles and body models</p>
              <div className="flex items-center gap-3 mt-3">
                {ACCENT_ORDER.map(key => {
                  const a = ACCENTS[key];
                  const selected = accent === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSetAccent(key)}
                      aria-label={a.label}
                      className="rounded-full shrink-0 transition-transform active:scale-90"
                      style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: a.color,
                        boxShadow: selected
                          ? `0 0 0 2px #0a0908, 0 0 0 4px ${a.color}`
                          : 'inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.3)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Profile section */}
          <div>
            <p className="te-label mb-2 px-0.5">Profile</p>
            <div className="te-panel rounded-2xl overflow-hidden">
              {editingName ? (
                <div className="px-4 py-3 flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onUpdateName(nameInput); setEditingName(false); }
                      if (e.key === 'Escape') setEditingName(false);
                    }}
                    placeholder="Your name"
                    autoFocus
                    className="te-field flex-1 rounded-xl px-4 py-2.5 text-white text-[14px] placeholder:text-white/20 focus:outline-none"
                  />
                  <button
                    onClick={() => { onUpdateName(nameInput); setEditingName(false); }}
                    className="te-toggle-off px-4 rounded-xl te-label active:opacity-75 transition-opacity"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setNameInput(userName); setEditingName(true); }}
                  className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors"
                >
                  <div>
                    <p className="te-label mb-0.5">Name</p>
                    <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">
                      {userName || <span className="text-white/30">Not set</span>}
                    </p>
                  </div>
                  <span className="te-label">Edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Data — opens a small popup with the export options */}
          <div>
            <p className="te-label mb-2 px-0.5">Data</p>
            <button
              onClick={() => setDataMenuOpen(true)}
              className="te-panel w-full flex items-center justify-between px-4 py-3.5 rounded-2xl active:bg-white/[0.04] transition-colors text-left"
            >
              <div>
                <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Export</p>
                <p className="te-label mt-0.5">CSV or JSON</p>
              </div>
              <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
            </button>
          </div>

          {/* Account section */}
          <div>
            <p className="te-label mb-2 px-0.5">Account</p>
            <button
              onClick={() => {
                if (!signOutConfirm) { setSignOutConfirm(true); return; }
                onSignOut();
              }}
              onBlur={() => setSignOutConfirm(false)}
              className={`te-panel w-full py-4 rounded-2xl text-[14px] font-semibold tracking-tight transition-all active:opacity-75 ${
                signOutConfirm
                  ? 'text-apple-red'
                  : 'text-white/30'
              }`}
              style={signOutConfirm ? { borderColor: 'rgba(255,69,58,0.25)', background: 'rgba(255,69,58,0.06)' } : undefined}
            >
              {signOutConfirm ? 'Tap again to confirm' : 'Log out'}
            </button>
          </div>

        </div>
        <ReportBugSheet open={reportOpen} onClose={() => setReportOpen(false)} context="Settings" />

        {/* Data export — small popup with both formats */}
        <Modal open={dataMenuOpen} onClose={() => setDataMenuOpen(false)} title="Export data">
          <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
            <button
              onClick={() => downloadFile(buildCsv(logs, exercises), 'overload-export.csv', 'text/csv')}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
            >
              <div>
                <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Export as CSV</p>
                <p className="te-label mt-0.5">{logs.length} log{logs.length !== 1 ? 's' : ''} · spreadsheet-friendly</p>
              </div>
              <ArrowDownTrayIcon className="w-4 h-4 shrink-0" style={{ color: 'rgba(244,241,236,0.3)' }} />
            </button>
            <button
              onClick={() => downloadFile(
                JSON.stringify({ exported_at: new Date().toISOString(), exercises, logs }, null, 2),
                'overload-export.json', 'application/json',
              )}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
            >
              <div>
                <p className="text-[14px] font-medium text-[#f4f1ec] tracking-tight">Export as JSON</p>
                <p className="te-label mt-0.5">Full backup of exercises &amp; logs</p>
              </div>
              <ArrowDownTrayIcon className="w-4 h-4 shrink-0" style={{ color: 'rgba(244,241,236,0.3)' }} />
            </button>
          </div>
        </Modal>
      </FullPageSheet>
    );
  }

  // ── Weekly plan & routines page ────────────────────────────────
  if (view.type === 'plan') {
    return (
      <FullPageSheet open={open} onClose={onClose} title="Weekly plan" onBack={() => setView({ type: 'main' })} padded>
        <div className="space-y-6">

          {/* Weekly plan section */}
          <div>
            <p className="te-label mb-2 px-0.5">Weekly Plan</p>
            <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
              {DAY_NAMES.map((dayName, i) => {
                const routine = getRoutineForDay(i);
                const isToday = i === todayDow;
                return (
                  <button
                    key={i}
                    onClick={() => setDayPicker(i)}
                    className="w-full flex items-center px-4 py-4 gap-3 active:bg-white/[0.04] transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 w-10 shrink-0">
                      {isToday && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f4f1ec' }} />
                      )}
                      <span className="te-label" style={isToday ? { color: '#f4f1ec' } : undefined}>
                        {dayName}
                      </span>
                    </div>
                    <span className={`flex-1 text-[14px] font-medium tracking-tight ${routine ? 'text-[#f4f1ec]' : 'text-white/25'}`}>
                      {routine ? routine.name : 'Rest'}
                    </span>
                    <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Routines section — square bento cards, tap to preview */}
          <div>
            <p className="te-label mb-2 px-0.5">Routines</p>
            <div className="grid grid-cols-2 gap-3">
              {routines.map(r => (
                <button
                  key={r.id}
                  onClick={() => setPreviewRoutine(r)}
                  className="te-panel-dark rounded-[20px] aspect-[7/6] p-3.5 flex flex-col justify-between text-left active:opacity-80 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(244,241,236,0.08)' }}>
                    <QueueListIcon className="w-4 h-4 text-white/50" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#f4f1ec] tracking-tight truncate">{r.name}</p>
                    <p className="te-label mt-0.5">{r.exercise_ids.length} exercise{r.exercise_ids.length !== 1 ? 's' : ''}</p>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setRoutineEditor({ routine: null })}
                className="te-panel rounded-[20px] aspect-[7/6] flex flex-col items-center justify-center gap-1.5 active:bg-white/[0.04] transition-colors"
              >
                <PlusIcon className="w-5 h-5 text-white/40" />
                <span className="te-label">New routine</span>
              </button>
            </div>
          </div>

        </div>

        {/* Routine preview — read-only list of what's planned, with an edit shortcut */}
        <Modal open={!!previewRoutine} onClose={() => setPreviewRoutine(null)} title={previewRoutine?.name ?? ''}>
          {previewRoutine && (
            <div className="space-y-3">
              {previewRoutine.exercise_ids.length > 0 ? (
                <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
                  {previewRoutine.exercise_ids.map(id => {
                    const ex = exercises.find(e => e.id === id);
                    if (!ex) return null;
                    return (
                      <div key={id} className="w-full h-[58px] flex items-center gap-3 px-4 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-white truncate" style={{ letterSpacing: '-0.17px' }}>
                            {ex.name}
                          </p>
                          <p className="te-mono text-[11px] mt-[1px]" style={{ color: 'rgba(244,241,236,0.35)' }}>
                            {ex.target_reps} x {ex.sets}
                          </p>
                        </div>
                        <span className="te-mono text-[16px] font-semibold text-white/80 tabular-nums uppercase shrink-0 leading-none">
                          {loadLabel(ex, unit, toDisplay)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="te-label text-center py-4">No exercises in this routine yet.</p>
              )}
              <button
                onClick={() => { const r = previewRoutine; setPreviewRoutine(null); setRoutineEditor({ routine: r }); }}
                className="te-panel w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl active:bg-white/[0.04] transition-colors"
              >
                <PencilSquareIcon className="w-4 h-4 text-white/40" />
                <span className="te-label">Edit routine</span>
              </button>
            </div>
          )}
        </Modal>

        {/* Day → routine assignment — small popup over the plan */}
        <Modal
          open={dayPicker !== null}
          onClose={() => setDayPicker(null)}
          title={dayPicker !== null ? DAY_NAMES[dayPicker] : ''}
        >
          {dayPicker !== null && (() => {
            const currentRoutineId = getScheduleForDay(dayPicker)?.routine_id ?? null;
            return (
              <div className="space-y-2.5">
                {/* Rest option */}
                <button
                  onClick={() => { onAssignDay(dayPicker, null); setDayPicker(null); }}
                  className="te-panel w-full flex items-center px-4 py-3.5 rounded-2xl gap-3 active:bg-white/[0.04] transition-colors text-left"
                >
                  <span className="flex-1 text-[14px] font-semibold text-[#f4f1ec] tracking-tight">Rest / Off</span>
                  {currentRoutineId === null && (
                    <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />
                  )}
                </button>

                {/* Routine options */}
                {routines.map(r => {
                  const isActive = currentRoutineId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => { onAssignDay(dayPicker, r.id); setDayPicker(null); }}
                      className="te-panel w-full flex items-center px-4 py-3.5 rounded-2xl gap-3 active:bg-white/[0.04] transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#f4f1ec] tracking-tight truncate">{r.name}</p>
                        <p className="te-label mt-0.5">{r.exercise_ids.length} exercise{r.exercise_ids.length !== 1 ? 's' : ''}</p>
                      </div>
                      {isActive && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#34c759' }} />
                      )}
                    </button>
                  );
                })}

                {routines.length === 0 && (
                  <p className="te-label text-center py-4">No routines yet. Create one first.</p>
                )}
              </div>
            );
          })()}
        </Modal>

        {/* Routine editor — create / edit in a popup layered over the plan */}
        <Modal
          open={routineEditor !== null}
          onClose={() => setRoutineEditor(null)}
          title={routineEditor?.routine ? 'Edit routine' : 'New routine'}
        >
          <div className="space-y-4">
            {/* Name input */}
            <input
              type="text"
              value={routineName}
              onChange={e => setRoutineName(e.target.value)}
              placeholder="Routine name"
              data-no-drag
              className="te-field w-full rounded-xl px-4 py-3 text-white text-[15px] placeholder:text-white/25 focus:outline-none"
            />

            {/* Exercises */}
            {exercises.length > 0 ? (
              <div>
                <p className="te-label mb-2 px-0.5">Exercises</p>
                <div className="space-y-3">
                  {allGroups.map(group => (
                    <div key={group}>
                      <div className="flex items-center gap-2 mb-2 px-0.5">
                        <span
                          className="w-[5px] h-[5px] rounded-full shrink-0"
                          style={{
                            background:
                              group === 'upper' ? 'var(--te-upper)'
                              : group === 'lower' ? 'var(--te-lower)'
                              : 'rgba(244,241,236,0.3)',
                          }}
                        />
                        <span
                          className="te-label"
                          style={{
                            color:
                              group === 'upper' ? 'var(--te-upper)'
                              : group === 'lower' ? 'var(--te-lower)'
                              : undefined,
                          }}
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
                              className={`${on ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} px-3 py-1.5 rounded-xl text-[13px] font-semibold select-none`}
                              style={{ color: on ? '#0a0908' : 'rgba(255,255,255,0.45)' }}
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
              <p className="te-label text-center py-2">Add exercises first to build a routine.</p>
            )}

            {/* Save button — needs a name and at least one exercise */}
            <button
              type="button"
              onClick={handleSaveRoutine}
              disabled={!routineName.trim() || selectedExerciseIds.length === 0}
              className="te-fab w-full py-3.5 rounded-xl te-mono text-[12px] tracking-[0.08em] uppercase text-white/90 disabled:opacity-30 active:opacity-80 transition-opacity"
            >
              {routineEditor?.routine ? 'Save changes' : 'Create routine'}
            </button>

            {/* Delete button (editing only) */}
            {routineEditor?.routine && (
              <button
                type="button"
                onClick={handleDeleteRoutine}
                className={`w-full py-3 rounded-xl text-[13px] font-semibold transition-all active:opacity-75 ${
                  confirmDelete
                    ? 'bg-apple-red/15 text-apple-red border border-apple-red/25'
                    : 'text-apple-red/50'
                }`}
              >
                {confirmDelete ? 'Tap again to confirm' : 'Delete routine'}
              </button>
            )}
          </div>
        </Modal>
      </FullPageSheet>
    );
  }

  return null;
}
