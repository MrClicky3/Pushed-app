import { useState, useEffect } from 'react';
import {
  ChevronRightIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import FullPageSheet from './FullPageSheet';
import Modal from './Modal';
import type { WorkoutLog } from '../types';
import type { Exercise } from '../types';
import type { WeightUnit, WeekStartDay } from '../hooks/useSettings';
import { ACCENTS, ACCENT_ORDER, type AccentKey } from '../lib/accent';
import type { ThemeMode } from '../lib/theme';
import {
  CATEGORY_LABELS, CATEGORY_PALETTE,
  type CategoryColors, type CategoryKey,
} from '../lib/categoryColors';
import ReportBugSheet from './ReportBugSheet';

// Only Upper and Lower are offered: they're the two halves the Add Exercise
// sheet actually assigns, so the rest of the palette keys have nothing to
// recolour. Five swatches keeps the row to one line at any width.
const SETTABLE_CATEGORIES: CategoryKey[] = ['upper', 'lower'];
const SETTINGS_SWATCH_KEYS = ['purple', 'orange', 'blue', 'green', 'white'];
const SETTINGS_SWATCHES = SETTINGS_SWATCH_KEYS
  .map(k => CATEGORY_PALETTE.find(s => s.key === k))
  .filter((s): s is NonNullable<typeof s> => Boolean(s));

interface Props {
  open: boolean;
  onClose: () => void;
  exercises: Exercise[];
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
  theme: ThemeMode;
  onSetTheme: (mode: ThemeMode) => void;
  categoryColors: CategoryColors;
  onSetCategoryColor: (key: CategoryKey, paletteKey: string) => void;
  bio: string | null;
  onUpdateBio: (bio: string) => Promise<string | null>;
  unit: WeightUnit;
  onSetUnit: (u: WeightUnit) => void;
  toDisplay: (kg: number) => number;
  fromDisplay: (val: number) => number;
  logs: WorkoutLog[];
}

// A clear, human section title — replaces the old tracked-out gray uppercase
// labels that headed each settings group.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[17px] font-bold te-t1 tracking-tight mb-3 px-0.5" style={{ letterSpacing: '-0.02em' }}>
      {children}
    </p>
  );
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
  const btn = 'flex items-center justify-center te-t3 active:bg-white/[0.06] transition-colors select-none';
  return (
    <div className="flex items-center shrink-0 rounded-te-sm overflow-hidden" style={{ border: '1px solid var(--te-border)', background: 'var(--te-well)' }}>
      <button type="button" onClick={onDec} className={btn} style={{ width: 38, height: 38, fontSize: 17 }}>−</button>
      <div className="w-px self-stretch" style={{ background: 'var(--te-border)' }} />
      <div className="flex items-center justify-center gap-0.5 px-1.5" style={{ minWidth: 56, height: 38 }}>
        <input
          value={editing ? draft! : text}
          onFocus={() => setDraft(text)}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null) onCommit(draft); setDraft(null); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          inputMode={inputMode}
          className="te-digit text-[15px] font-semibold te-t1 tracking-tight tabular-nums bg-transparent focus:outline-none text-center"
          style={{ width: `${Math.max(text.length, 2)}ch` }}
        />
        {suffix && <span className="te-digit text-[15px] font-semibold te-t1">{suffix}</span>}
      </div>
      <div className="w-px self-stretch" style={{ background: 'var(--te-border)' }} />
      <button type="button" onClick={onInc} className={btn} style={{ width: 38, height: 38, fontSize: 17 }}>+</button>
    </div>
  );
}

// ── Edit profile ─────────────────────────────────────────────────
// Name and bio in one sheet. Name lives on the auth user, bio on the profile
// row, so they save independently and each reports its own error.
const BIO_MAX = 160;

function EditProfileSheet({
  open, onClose, userName, bio, onUpdateName, onUpdateBio,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  bio: string | null;
  onUpdateName: (name: string) => Promise<string | null>;
  onUpdateBio: (bio: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(userName);
  const [bioDraft, setBioDraft] = useState(bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(userName);
    setBioDraft(bio ?? '');
    setError(null);
  }, [open, userName, bio]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const trimmed = name.trim();
    if (trimmed !== userName) {
      const err = await onUpdateName(trimmed);
      if (err) { setError(err); setSaving(false); return; }
    }
    if (bioDraft !== (bio ?? '')) {
      const err = await onUpdateBio(bioDraft);
      if (err) { setError(err); setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit profile">
      <div className="space-y-4">
        <div>
          <p className="te-label mb-2 px-0.5">Name</p>
          <input
            data-no-drag
            value={name}
            onChange={e => setName(e.target.value.slice(0, 40))}
            placeholder="Your name"
            className="w-full rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none"
            style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
          />
        </div>

        <div>
          <p className="te-label mb-2 px-0.5">Bio</p>
          <textarea
            data-no-drag
            value={bioDraft}
            onChange={e => setBioDraft(e.target.value.slice(0, BIO_MAX))}
            placeholder="Tell friends a bit about yourself…"
            rows={4}
            className="w-full rounded-te-md px-3.5 py-3 text-[15px] te-t1 placeholder-white/25 tracking-tight outline-none resize-none"
            style={{ background: 'var(--te-well)', border: '1px solid var(--te-border)' }}
          />
          <p className="te-label mt-1.5 px-0.5" style={{ color: 'var(--te-text-4)' }}>
            {bioDraft.length}/{BIO_MAX}
          </p>
        </div>

        {error && <p className="text-[13px] px-0.5" style={{ color: 'var(--te-danger)' }}>{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="te-white-btn w-full rounded-te-md font-semibold text-[15px] disabled:opacity-50"
          style={{ height: 48 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
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
  exercises,
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
  theme,
  onSetTheme,
  categoryColors,
  onSetCategoryColor,
  bio,
  onUpdateBio,
  unit,
  onSetUnit,
  toDisplay,
  fromDisplay,
  logs,
}: Props) {
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);

  // Reset transient state when the sheet closes.
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setEditProfileOpen(false);
        setSignOutConfirm(false);
        setDataMenuOpen(false);
      }, 300);
    }
  }, [open]);

  return (
    <FullPageSheet open={open} onClose={onClose} title="Settings" padded>
      <div className="space-y-6">

        {/* Report a bug — still the first thing in Settings during the beta,
            but carried by position and the accent-tinted icon rather than by
            a saturated blue slab. It matches every other settings row now,
            so the page reads as one list instead of a banner plus a list. */}
        <button
          onClick={() => setReportOpen(true)}
          className="te-panel w-full flex items-center gap-3 px-4 py-4 rounded-te-md active:bg-white/[0.04] transition-colors text-left"
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, background: 'var(--te-surface-3)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--te-text-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l1.5 2.5M16 2l-1.5 2.5" />
              <rect x="7" y="6" width="10" height="12" rx="5" />
              <path d="M12 6v12M3 10h4M17 10h4M3 15h4M17 15h4M4 6l3 2M20 6l-3 2M4 19l3-2M20 19l-3-2" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold te-t1 tracking-tight">Report a bug</p>
            <p className="text-[13px] mt-0.5 te-t3 leading-snug">
              Tell me what went wrong — it helps.
            </p>
          </div>
          <ChevronRightIcon className="w-4 h-4 te-t4 shrink-0" />
        </button>

        {/* Preferences */}
        <div>
          <SectionTitle>Preferences</SectionTitle>

          {/* Time settings — rest timer, barbell weight, and the calendar's
              start-of-week day. */}
          <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">

            {/* Rest timer duration */}
            <div className="flex items-center justify-between px-4 py-3.5 gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium te-t1 tracking-tight">Rest timer</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Auto-starts after each set</p>
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
                <p className="text-[15px] font-medium te-t1 tracking-tight">Barbell weight</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Used by the plate calculator</p>
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
                <p className="text-[15px] font-medium te-t1 tracking-tight">Start week on</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Log page calendar</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {([['saturday', 'Sat'], ['sunday', 'Sun'], ['monday', 'Mon']] as const).map(([d, label]) => {
                  const active = weekStartDay === d;
                  return (
                    <button
                      key={d}
                      onClick={() => onSetWeekStartDay(d)}
                      className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} rounded-te-sm select-none te-mono text-[13px] font-semibold`}
                      style={{ width: 42, height: 34, color: active ? 'var(--te-ink)' : 'var(--te-text-4)' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Toggles — weight unit alongside the other on/off preferences */}
          <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05] mt-3">

            {/* Weight unit — red toggle switch, same pattern as the other on/off rows */}
            <button
              onClick={() => onSetUnit(unit === 'kg' ? 'lbs' : 'kg')}
              className="w-full flex items-center justify-between px-4 py-3.5 gap-3 active:bg-white/[0.03] transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium te-t1 tracking-tight">Weight unit</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Used across the app</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="te-mono text-[13px] font-semibold uppercase" style={{ color: 'var(--te-text-4)' }}>{unit}</span>
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
                <p className="text-[15px] font-medium te-t1 tracking-tight">Workout duration</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Show session time on the log page</p>
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
                <p className="text-[15px] font-medium te-t1 tracking-tight">Sounds</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Muted tones on logging and completion</p>
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
                <p className="text-[15px] font-medium te-t1 tracking-tight">Haptics</p>
                <p className="text-[13px] te-t3 mt-0.5 leading-snug">Vibrations on logging and completion</p>
              </div>
              <div className="te-unit-track shrink-0">
                <div className={`te-unit-lever ${hapticsEnabled ? 'te-unit-lever-right' : ''}`} />
              </div>
            </button>

          </div>

          {/* Colours — the app accent and the per-category dots together, so
              every colour the app uses is set in one place. The Add Exercise
              sheet still offers a category's colour inline for convenience;
              both write the same setting. */}
          <div className="te-panel rounded-te-md overflow-hidden mt-3 divide-y divide-[color:var(--te-border)]">
            <div className="px-4 py-3.5">
              <p className="text-[15px] font-medium te-t1 tracking-tight">Appearance</p>
              <p className="text-[13px] te-t3 mt-0.5 leading-snug">Light or dark, or follow your device</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {(['dark', 'light', 'system'] as const).map(mode => {
                  const selected = theme === mode;
                  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'System';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSetTheme(mode)}
                      className={`${selected ? 'te-toggle-on' : 'te-toggle-off'} rounded-te-sm py-2.5 text-[13px] font-semibold tracking-tight`}
                      style={{ color: selected ? 'var(--te-accent-contrast)' : 'var(--te-text-2)' }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <p className="text-[15px] font-medium te-t1 tracking-tight">Accent color</p>
              <p className="text-[13px] te-t3 mt-0.5 leading-snug">Toggles and body models</p>
              <div className="flex items-center gap-2.5 mt-3">
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
                        width: 22, height: 22, borderRadius: '50%',
                        background: a.color,
                        boxShadow: selected
                          ? `0 0 0 2px var(--te-ink), 0 0 0 3.5px ${a.color}`
                          : 'inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.3)',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <p className="text-[15px] font-medium te-t1 tracking-tight">Exercise colors</p>
              <p className="text-[13px] te-t3 mt-0.5 leading-snug">The dot beside each category, and its charts</p>
              <div className="mt-3 space-y-2.5">
                {SETTABLE_CATEGORIES.map(cat => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="te-label shrink-0" style={{ width: 44, color: 'var(--te-text-3)' }}>
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {SETTINGS_SWATCHES.map(sw => {
                        const selected = categoryColors[cat] === sw.key;
                        return (
                          <button
                            key={sw.key}
                            type="button"
                            onClick={() => onSetCategoryColor(cat, sw.key)}
                            aria-label={`${CATEGORY_LABELS[cat]}: ${sw.label}`}
                            className="rounded-full shrink-0 transition-transform active:scale-90"
                            style={{
                              width: 18, height: 18, borderRadius: '50%',
                              background: sw.color,
                              boxShadow: selected
                                ? `0 0 0 2px var(--te-ink), 0 0 0 3px ${sw.color}`
                                : 'inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.3)',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Profile section */}
        <div>
          <SectionTitle>Profile</SectionTitle>
          <button
            onClick={() => setEditProfileOpen(true)}
            className="te-panel w-full flex items-center justify-between px-4 py-3.5 rounded-te-md active:bg-white/[0.04] transition-colors text-left gap-3"
          >
            <p className="text-[15px] font-medium te-t1 tracking-tight min-w-0 truncate">Edit profile</p>
            <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
          </button>
        </div>

        {/* Data — opens a small popup with the export options */}
        <div>
          <SectionTitle>Data</SectionTitle>
          <button
            onClick={() => setDataMenuOpen(true)}
            className="te-panel w-full flex items-center justify-between px-4 py-3.5 rounded-te-md active:bg-white/[0.04] transition-colors text-left"
          >
            <p className="text-[15px] font-medium te-t1 tracking-tight">Export</p>
            <ChevronRightIcon className="w-3.5 h-3.5 te-t4 shrink-0" />
          </button>
        </div>

        {/* Account section */}
        <div>
          <SectionTitle>Account</SectionTitle>
          <button
            onClick={() => {
              if (!signOutConfirm) { setSignOutConfirm(true); return; }
              onSignOut();
            }}
            onBlur={() => setSignOutConfirm(false)}
            className={`te-panel w-full py-4 rounded-te-md text-[15px] font-semibold tracking-tight transition-all active:opacity-75 ${
              signOutConfirm
                ? 'text-[color:var(--te-danger)]'
                : 'te-t4'
            }`}
            style={signOutConfirm ? { borderColor: 'rgba(255,69,58,0.25)', background: 'rgba(255,69,58,0.06)' } : undefined}
          >
            {signOutConfirm ? 'Tap again to confirm' : 'Log out'}
          </button>
        </div>

      </div>
      <ReportBugSheet open={reportOpen} onClose={() => setReportOpen(false)} context="Settings" />

      <EditProfileSheet
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        userName={userName}
        bio={bio}
        onUpdateName={onUpdateName}
        onUpdateBio={onUpdateBio}
      />

      {/* Data export — small popup with both formats */}
      <Modal open={dataMenuOpen} onClose={() => setDataMenuOpen(false)} title="Export data">
        <div className="te-panel rounded-te-md overflow-hidden divide-y divide-white/[0.05]">
          <button
            onClick={() => downloadFile(buildCsv(logs, exercises), 'overload-export.csv', 'text/csv')}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
          >
            <div>
              <p className="text-[15px] font-medium te-t1 tracking-tight">Export as CSV</p>
              <p className="text-[13px] te-t3 mt-0.5 leading-snug">{logs.length} log{logs.length !== 1 ? 's' : ''} · spreadsheet-friendly</p>
            </div>
            <ArrowDownTrayIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--te-text-4)' }} />
          </button>
          <button
            onClick={() => downloadFile(
              JSON.stringify({ exported_at: new Date().toISOString(), exercises, logs }, null, 2),
              'overload-export.json', 'application/json',
            )}
            className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.04] transition-colors text-left"
          >
            <div>
              <p className="text-[15px] font-medium te-t1 tracking-tight">Export as JSON</p>
              <p className="text-[13px] te-t3 mt-0.5 leading-snug">Full backup of exercises &amp; logs</p>
            </div>
            <ArrowDownTrayIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--te-text-4)' }} />
          </button>
        </div>
      </Modal>
    </FullPageSheet>
  );
}
