import { useState, useEffect, useRef, useMemo } from 'react';
import {
  BoltIcon,
  QueueListIcon,
  RectangleStackIcon,
  ChartBarSquareIcon,
  ChartBarIcon,
  TrophyIcon,
  ViewfinderCircleIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

import { useWorkoutData } from './hooks/useWorkoutData';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import { useSchedule } from './hooks/useSchedule';
import { useProfile } from './hooks/useProfile';
import { useFriends } from './hooks/useFriends';
import { useCompetitions } from './hooks/useCompetitions';
import { useFistBumps } from './hooks/useFistBumps';
import ExercisesView from './views/ExercisesView';
import LogsView from './views/LogsView';
import AnalyticsView from './views/AnalyticsView';
import ProfileView from './views/ProfileView';
import AuthView from './views/AuthView';
import ExerciseModal from './components/ExerciseModal';
import LogModal from './components/LogModal';
import ScheduleModal from './components/ScheduleModal';
import Avatar from './components/Avatar';
import EdgeSwipePeek from './components/EdgeSwipePeek';
import UsernameSetupModal from './components/UsernameSetupModal';
import ExerciseLibraryModal from './components/ExerciseLibraryModal';
import { calcStreak, calcConsistency } from './lib/streak';
import { loadWorkoutDoneAt, skipDayKey } from './lib/skips';
import { feedback } from './lib/feedback';
import type { LibraryExercise } from './data/exerciseLibrary';
import type { Exercise, WorkoutLog, SetType } from './types';

// Deep-link: capture an /invite/{code} path on load, stash it, and clean the
// URL. Applied after the user is authenticated + has a profile (see MainApp).
const PENDING_INVITE_KEY = 'pending_invite';
if (typeof window !== 'undefined') {
  const m = window.location.pathname.match(/^\/invite\/([A-Za-z0-9]+)/);
  if (m) {
    try { localStorage.setItem(PENDING_INVITE_KEY, m[1].toUpperCase()); } catch { /* ignore */ }
    window.history.replaceState(null, '', '/');
  }
}

type Tab = 'exercises' | 'log' | 'analytics' | 'profile';

// First-run swipe-to-log hint: shown until the swipe-add gesture has actually
// been used twice. Counted in localStorage so it never comes back.
const SWIPE_USES_KEY = 'swipe_add_uses';
function loadSwipeUses(): number {
  try { return parseInt(localStorage.getItem(SWIPE_USES_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

function fmtTimer(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// Sessions are inferred from the first log of the day, so a morning set plus
// an evening set would read as a 12-hour "workout" — past this cap the header
// stops pretending to know the duration.
const SESSION_CAP_MINS = 4 * 60;

function formatSessionAge(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Started just now';
  if (mins < 60) return `Started ${mins}min ago`;
  if (mins >= SESSION_CAP_MINS) return 'Worked out today';
  return `Started ${Math.floor(mins / 60)}h ${mins % 60}min ago`;
}

// Frozen total once the workout is finished — the counter stops here.
function formatSessionTotal(startStr: string, endMs: number): string {
  const mins = Math.max(0, Math.floor((endMs - new Date(startStr).getTime()) / 60000));
  if (mins < 1) return 'Worked out for: <1min';
  if (mins < 60) return `Worked out for: ${mins}min`;
  if (mins >= SESSION_CAP_MINS) return 'Worked out today';
  return `Worked out for: ${Math.floor(mins / 60)}h ${mins % 60}min`;
}

// Session indicator that replaces the greeting at the top. Shows how long ago
// today's workout started; when no session is active it pans out the bottom
// and collapses away (and back in when one starts).
function SessionIndicator({ sessionStart, doneAt }: { sessionStart: string | null; doneAt: number | null }) {
  const active = !!sessionStart;
  const finished = active && doneAt !== null;
  const [, setTick] = useState(0);
  const lastText = useRef('');

  useEffect(() => {
    // Once the workout is finished the total is fixed — stop ticking.
    if (!active || finished) return;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [active, finished]);

  if (sessionStart) {
    lastText.current = doneAt !== null
      ? formatSessionTotal(sessionStart, doneAt)
      : formatSessionAge(sessionStart);
  }

  return (
    <div
      style={{
        overflow: 'hidden',
        maxHeight: active ? 22 : 0,
        opacity: active ? 1 : 0,
        transform: active ? 'translateY(0)' : 'translateY(8px)',
        transition:
          'max-height 0.36s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease, transform 0.36s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span className="te-label" style={{ color: 'var(--te-text-3)', whiteSpace: 'nowrap' }}>
        {lastText.current}
      </span>
    </div>
  );
}

// "Leave your computer at home" watermark for wide screens
function WideScreenNote() {
  const text = 'LEAVE YOUR COMPUTER AT HOME';
  const style: React.CSSProperties = {
    color: 'rgba(244,241,236,0.035)',
    fontSize: 13,
    fontFamily: "'Geist Mono', monospace",
    fontWeight: 700,
    letterSpacing: '0.18em',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    pointerEvents: 'none',
  };
  return (
    <>
      <div className="hidden sm:flex fixed left-0 top-0 bottom-0 items-center justify-center z-[2] pointer-events-none"
        style={{ width: 'max(0px, calc((100vw - 512px) / 2 - 8px))' }}>
        <p style={{ ...style, transform: 'rotate(-90deg)' }}>{text}</p>
      </div>
      <div className="hidden sm:flex fixed right-0 top-0 bottom-0 items-center justify-center z-[2] pointer-events-none"
        style={{ width: 'max(0px, calc((100vw - 512px) / 2 - 8px))' }}>
        <p style={{ ...style, transform: 'rotate(90deg)' }}>{text}</p>
      </div>
    </>
  );
}

function IncreaseWeightOverlay({
  exerciseName,
  currentWeight,
  onDismiss,
  onBump,
}: {
  exerciseName: string;
  currentWeight: string;
  onDismiss: () => void;
  onBump: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-fade-in">
      <div className="w-full max-w-lg mx-auto pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pb-8 animate-slide-up">
        <div className="te-panel rounded-te-lg overflow-hidden">
          <div className="flex flex-col items-center pt-10 pb-8 px-8 text-center gap-5">
            <div className="w-14 h-14 rounded-full bg-[color-mix(in_srgb,var(--te-accent)_15%,transparent)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--te-accent)_20%,transparent)]">
              <ChartBarIcon className="w-6 h-6 text-[color:var(--te-accent)]" />
            </div>
            <div>
              <p className="text-[20px] font-bold te-t1 leading-tight tracking-tight mb-2">
                Time to go heavier!
              </p>
              <p className="text-[15px] te-t2 leading-relaxed max-w-[260px] mx-auto">
                You've hit your target for{' '}
                <span className="te-t1 font-medium">{exerciseName}</span>
                {' '}at{' '}
                <span className="te-t1 font-medium">{currentWeight}</span>.
              </p>
            </div>
          </div>

          <div className="h-px" style={{ background: 'var(--te-border)' }} />
          <button
            onClick={onBump}
            className="w-full py-[18px] text-[17px] font-semibold text-[color:var(--te-success)] active:bg-white/[0.06] transition-colors tracking-tight"
          >
            Update weight
          </button>
          <div className="h-px" style={{ background: 'var(--te-border)' }} />
          <button
            onClick={onDismiss}
            className="w-full py-[18px] text-[17px] te-t4 active:bg-white/[0.06] transition-colors"
          >
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}

function PRToast({ exerciseName, detail, onDone }: { exerciseName: string; detail: string; onDone: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDone, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDone]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: 'max(56px, env(safe-area-inset-top, 0px) + 16px)' }}
    >
      <div className="pointer-events-auto animate-slide-down">
        <div
          className="te-panel flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-te-md"
          style={{ borderColor: 'rgba(48,209,88,0.2)', boxShadow: '0 4px 24px rgba(48,209,88,0.1), 0 4px 16px rgba(0,0,0,0.5)' }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(48,209,88,0.14)' }}>
            <TrophyIcon className="w-4 h-4" style={{ color: 'var(--te-success)' }} />
          </div>
          <div className="leading-tight">
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--te-success)' }}>New PR!</span>
            <span className="text-[15px] te-t1 ml-1.5 tracking-tight font-medium">{detail}</span>
            <span className="text-[15px] te-t4 ml-1.5 tracking-tight">{exerciseName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExtraRepsToast({ exerciseName, extra, onDone }: { exerciseName: string; extra: number; onDone: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDone, 3200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onDone]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: 'max(56px, env(safe-area-inset-top, 0px) + 16px)' }}
    >
      <div className="pointer-events-auto animate-slide-down">
        <div className="te-panel flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-te-md">
          <div className="w-7 h-7 rounded-full bg-[color-mix(in_srgb,var(--te-accent)_15%,transparent)] flex items-center justify-center shrink-0">
            <BoltIcon className="w-4 h-4 text-[color:var(--te-accent)]" />
          </div>
          <div className="leading-tight">
            <span className="text-[15px] font-semibold te-t1 tracking-tight">+{extra} extra rep{extra > 1 ? 's' : ''}</span>
            <span className="text-[15px] te-t4 ml-1.5 tracking-tight">{exerciseName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FocusModeSwitch({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 select-none rounded-full transition-colors"
      style={{ padding: '5px 9px 5px 5px', background: 'transparent' }}
      aria-label="Focus mode"
    >
      <div className="te-unit-track">
        <div className={`te-unit-lever ${active ? 'te-unit-lever-right' : ''}`} />
      </div>
      <ViewfinderCircleIcon className="w-3.5 h-3.5 transition-opacity" style={{ color: 'var(--te-text-1)', opacity: active ? 1 : 0.25 }} />
    </button>
  );
}

const GREETINGS = ['Hey', 'Hello', 'Good to see you', "What's up", "Let's go", 'Welcome back'];

function MainApp({ userId, onSignOut, userName, onUpdateName }: {
  userId: string;
  onSignOut: () => void;
  userName: string;
  onUpdateName: (name: string) => Promise<string | null>;
}) {
  const {
    exercises,
    logs,
    loading,
    addExercise,
    updateExercise,
    deleteExercise,
    addLog,
    updateLog,
    deleteLog,
  } = useWorkoutData(userId);

  const {
    unit, setUnit, toDisplay, fromDisplay,
    timerDuration, setTimerDuration,
    barbellWeight, setBarbellWeight,
    showDuration, setShowDuration,
    soundEnabled, setSoundEnabled,
    hapticsEnabled, setHapticsEnabled,
    accent, setAccent,
    categoryColors, setCategoryColor,
    weekStartDay, setWeekStartDay,
  } = useSettings();
  const { routines, schedule, addRoutine, updateRoutine, deleteRoutine, assignDay } = useSchedule(userId);
  const profileApi = useProfile(userId, userName);
  const friends = useFriends(userId);
  const { needsUsername, profile: profileRow, pushStats, createProfile, inviteUrl, setAvatar, uploadAvatarFile, updateBio } = profileApi;

  // Weekdays (Mon=0…Sun=6) the user has a non-empty routine scheduled — still
  // passed to the competition RPCs for signature stability (the retired
  // consistency track froze it server-side; volume/streak ignore it).
  const scheduledDays = useMemo(
    () => schedule
      .filter(s => {
        const r = s.routine_id ? routines.find(x => x.id === s.routine_id) : null;
        return r && r.exercise_ids.length > 0;
      })
      .map(s => s.day_of_week),
    [schedule, routines],
  );
  const competitions = useCompetitions(scheduledDays);
  const fistBumps = useFistBumps(userId);

  const [tab, setTab] = useState<Tab>('log');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Push client-computed streak/consistency into user_stats whenever the
  // underlying data changes (routines/schedule are client-only, so the client
  // is the source of truth). Skipped until a profile exists.
  const lastStatsRef = useRef<string>('');
  useEffect(() => {
    if (loading || needsUsername || !profileRow) return;
    const s = calcStreak(logs, schedule, routines, exercises);
    const consistency = calcConsistency(logs, schedule, routines, exercises);
    const payload = { current: s.current, longest: s.longest, total: s.totalDays, consistency };
    const key = JSON.stringify(payload);
    if (key === lastStatsRef.current) return;
    lastStatsRef.current = key;
    pushStats(payload);
  }, [logs, schedule, routines, exercises, loading, needsUsername, profileRow, pushStats]);

  const [focusMode, setFocusMode] = useState(false);

  // Redeem a pending invite link once, after auth + profile are ready.
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const inviteRanRef = useRef(false);
  useEffect(() => {
    if (inviteRanRef.current || needsUsername || !profileRow) return;
    let code: string | null = null;
    try { code = localStorage.getItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    if (!code) return;
    inviteRanRef.current = true;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    friends.acceptInvite(code).then(res => {
      if (res.ok) setInviteToast(res.reason === 'already_friends' ? 'Already friends' : 'Friend added!');
      else setInviteToast(res.reason === 'self' ? "That's your own invite link" : 'Invite link is invalid');
      setTimeout(() => setInviteToast(null), 2800);
    });
  }, [needsUsername, profileRow, friends]);

  function switchTab(key: Tab) {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    setTab(key);
  }

  // Turning focus mode on from any non-log page jumps straight to the log —
  // focus mode is a logging aid, and the nav is hidden while it's active.
  function toggleFocus() {
    const next = !focusMode;
    feedback.focus(next);
    setFocusMode(next);
    if (next && tab !== 'log') {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      setTab('log');
    }
  }
  const [exerciseModal, setExerciseModal] = useState<{ open: boolean; exercise: Exercise | null }>({
    open: false,
    exercise: null,
  });
  const [logModal, setLogModal] = useState<{ open: boolean; exercise: Exercise | null; editLog: WorkoutLog | null }>({
    open: false,
    exercise: null,
    editLog: null,
  });
  const [weightPrompt, setWeightPrompt] = useState<{ exercise: Exercise; weightDisplay: string } | null>(null);
  const [extraRepsToast, setExtraRepsToast] = useState<{ exerciseName: string; extra: number } | null>(null);
  const [prToast, setPrToast] = useState<{ exerciseName: string; detail: string } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Set when the schedule sheet should jump straight to routine creation
  // (the Logs page's no-routine prompt), instead of the main settings list.
  const [scheduleInitialView, setScheduleInitialView] = useState<'routine' | undefined>(undefined);

  const profileName = profileRow?.display_name || profileRow?.username || userName || 'You';

  // Earliest log created today → the current session's start (null when there
  // is no workout logged today).
  const sessionStart = useMemo(() => {
    const now = new Date();
    const k = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    let earliest: string | null = null;
    for (const l of logs) {
      const d = new Date(l.created_at);
      if (`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` !== k) continue;
      if (earliest === null || new Date(l.created_at).getTime() < new Date(earliest).getTime()) {
        earliest = l.created_at;
      }
    }
    return earliest;
  }, [logs]);

  // Set when today's workout is completed, which freezes the header counter.
  // Seeded from storage so it survives a reload / tab switch.
  const [workoutDoneAt, setWorkoutDoneAt] = useState<number | null>(() => loadWorkoutDoneAt(skipDayKey()));

  // Rest timer
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerFloating, setTimerFloating] = useState(false);
  const [timerFloatKey, setTimerFloatKey] = useState(0);
  const timerDone = timerRemaining === 0;

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev === null || prev <= 0) return 0;
        const next = prev - 1;
        if (next === 0) {
          clearInterval(id);
          setTimerRunning(false);
          if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  function dismissFloatingTimer() {
    setTimerFloating(false);
    setTimerRemaining(null);
    setTimerRunning(false);
  }

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exercisePrefill, setExercisePrefill] = useState<{ name: string; muscle_group: string } | undefined>();

  function handleLibrarySelect(ex: LibraryExercise) {
    setLibraryOpen(false);
    setExercisePrefill({ name: ex.name, muscle_group: ex.muscleGroup });
    setExerciseModal({ open: true, exercise: null });
  }

  // Swipe-up-to-add: dragging up on the nav dock lifts a faint "+" stack and
  // fills a radial progress ring around it; releasing past the threshold fires
  // the contextual add. Live-tracked so the ring follows the finger.
  const SWIPE_THRESHOLD = 88;
  const [swipeDrag, setSwipeDrag] = useState(0); // upward px this gesture (0 = idle)
  const [swiping, setSwiping] = useState(false); // mid-gesture → no transition
  const swipeStartY = useRef(0);
  const swipeFullRef = useRef(false);  // ring is full → release commits
  const swipeShownRef = useRef(false); // affordance has appeared this gesture
  const swipeArmedRef = useRef(true);  // false → gesture began too low to count
  const dockContentRef = useRef<HTMLDivElement>(null); // nav bar content bounds

  // Swipe hint + future-date guard state
  const [swipeUses, setSwipeUses] = useState<number>(loadSwipeUses);
  const [logDateInFuture, setLogDateInFuture] = useState(false);
  const [addError, setAddError] = useState<{ key: number; text: string } | null>(null);
  const addErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashAddError(text: string) {
    if (addErrorTimer.current) clearTimeout(addErrorTimer.current);
    setAddError({ key: Date.now(), text });
    addErrorTimer.current = setTimeout(() => setAddError(null), 1700);
  }

  function triggerAdd(viaGesture = false) {
    if (tab === 'log' && logDateInFuture) {
      feedback.skip();
      flashAddError("Can't log in future dates");
      return;
    }
    if (viaGesture && swipeUses < 2) {
      const next = swipeUses + 1;
      setSwipeUses(next);
      try { localStorage.setItem(SWIPE_USES_KEY, String(next)); } catch { /* ignore */ }
    }
    if (tab === 'exercises') { setExercisePrefill(undefined); setExerciseModal({ open: true, exercise: null }); }
    else {
      if (tab !== 'log') switchTab('log');
      setLogModal({ open: true, exercise: null, editLog: null });
    }
  }
  function onDockTouchStart(e: React.TouchEvent) {
    // Only arm the swipe if it begins at/above the nav bar's mid-line. Touches
    // starting in the lower half (near the home indicator) are ignored so the
    // gesture doesn't fight the system home-swipe or mis-fire.
    const rect = dockContentRef.current?.getBoundingClientRect();
    const y = e.touches[0].clientY;
    swipeArmedRef.current = !rect || y <= rect.top + rect.height / 2;
    if (!swipeArmedRef.current) return;
    swipeStartY.current = y;
    swipeFullRef.current = false;
    swipeShownRef.current = false;
    setSwiping(true);
  }
  function onDockTouchMove(e: React.TouchEvent) {
    if (!swipeArmedRef.current) return;
    const dy = swipeStartY.current - e.touches[0].clientY;
    const d = Math.max(0, Math.min(dy, SWIPE_THRESHOLD + 22));
    if (d > 4 && !swipeShownRef.current) { swipeShownRef.current = true; feedback.reveal(); }
    if (d <= 4) swipeShownRef.current = false;
    const full = d >= SWIPE_THRESHOLD;
    if (full && !swipeFullRef.current) { swipeFullRef.current = true; feedback.reveal(); }
    if (!full) swipeFullRef.current = false;
    setSwipeDrag(d);
  }
  function onDockTouchEnd() {
    if (!swipeArmedRef.current) return;
    const committed = swipeFullRef.current;
    setSwiping(false);
    setSwipeDrag(0);
    swipeFullRef.current = false;
    swipeShownRef.current = false;
    if (committed) triggerAdd(true);
  }
  // If the gesture is interrupted (system overscroll / scroll takeover) the
  // browser fires touchcancel instead of touchend — reset so the affordance
  // never lingers visible.
  function onDockTouchCancel() {
    setSwiping(false);
    setSwipeDrag(0);
    swipeFullRef.current = false;
    swipeShownRef.current = false;
  }
  const dismissExtra = useRef(() => setExtraRepsToast(null));
  const dismissPr = useRef(() => setPrToast(null));
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);

  function handleSaveExercise(data: Omit<Exercise, 'id' | 'device_id' | 'created_at'>) {
    if (exerciseModal.exercise) {
      updateExercise(exerciseModal.exercise.id, data);
    } else {
      addExercise(data);
    }
  }

  async function handleAddLog(data: { exercise_id: string; reps_done: number; weight: number; sets: number; comment: string; set_type?: SetType }) {
    // PR check against logs as they were before this set
    const isWarmup = data.set_type === 'warmup';
    let scoredPR = false;
    if (!isWarmup) {
      const prev = logs.filter(l => l.exercise_id === data.exercise_id && l.set_type !== 'warmup');
      const exercise = exercises.find(e => e.id === data.exercise_id);
      if (prev.length > 0 && exercise) {
        const prevMaxWeight = Math.max(...prev.map(l => l.weight));
        if (data.weight > prevMaxWeight) {
          setPrToast({ exerciseName: exercise.name, detail: `${toDisplay(data.weight)}${unit}` });
          scoredPR = true;
        } else if (data.weight === prevMaxWeight) {
          const bestRepsAtWeight = Math.max(...prev.filter(l => l.weight === data.weight).map(l => l.reps_done));
          if (data.reps_done > bestRepsAtWeight) {
            setPrToast({ exerciseName: exercise.name, detail: `${data.reps_done} reps @ ${toDisplay(data.weight)}${unit}` });
            scoredPR = true;
          }
        }
      }
    }

    await addLog(data);
    // Auto-start rest timer
    setTimerRemaining(timerDuration);
    setTimerRunning(true);
    setTimerFloating(true);
    setTimerFloatKey(k => k + 1);

    const exercise = exercises.find(e => e.id === data.exercise_id);

    // Extra-reps toast (beyond target) — warmups and PRs excepted
    if (!isWarmup && exercise && exercise.target_reps > 0 && !scoredPR && data.reps_done > exercise.target_reps) {
      setExtraRepsToast({ exerciseName: exercise.name, extra: data.reps_done - exercise.target_reps });
    }

    // ── Completion detection (this set is always logged "now" → today) ──
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    // Working (non-warmup) sets already logged today for an exercise, before this set
    const workingBefore = (exId: string) => logs.filter(
      l => l.exercise_id === exId && l.set_type !== 'warmup' && new Date(l.created_at).getTime() >= startOfToday
    ).length;
    const addsOne = (exId: string) => (exId === data.exercise_id && !isWarmup ? 1 : 0);

    // Did this set just finish this exercise's sets?
    const beforeThis = workingBefore(data.exercise_id);
    const exerciseJustDone = !isWarmup && !!exercise && exercise.sets > 0
      && beforeThis < exercise.sets && beforeThis + 1 >= exercise.sets;

    // Did this set just reach the "all target sets at this weight" threshold?
    let weightPromptJustShown = false;
    if (exercise && exercise.target_reps > 0 && exercise.sets > 0 && !isWarmup && data.reps_done >= exercise.target_reps) {
      const successBefore = logs.filter(
        l => l.exercise_id === data.exercise_id && l.set_type !== 'warmup' &&
          l.weight === data.weight && l.reps_done >= exercise.target_reps &&
          new Date(l.created_at).getTime() >= startOfToday
      ).length;
      weightPromptJustShown = successBefore < exercise.sets && successBefore + 1 >= exercise.sets;
    }
    if (weightPromptJustShown && exercise) {
      setWeightPrompt({ exercise, weightDisplay: `${toDisplay(data.weight)}${unit}` });
    }

    // Did this set finish the whole routine scheduled for today? (routine only)
    let workoutJustDone = false;
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const schedEntry = schedule.find(s => s.day_of_week === dow);
    const todayRoutine = schedEntry?.routine_id
      ? (routines.find(r => r.id === schedEntry.routine_id) ?? schedEntry.routines ?? null)
      : null;
    if (todayRoutine) {
      const routineDone = (add: (exId: string) => number) => todayRoutine.exercise_ids.every(exId => {
        const ex = exercises.find(e => e.id === exId);
        if (!ex || ex.sets <= 0) return true; // exercises without a set target don't gate completion
        return workingBefore(exId) + add(exId) >= ex.sets;
      });
      workoutJustDone = routineDone(addsOne) && !routineDone(() => 0);
    }

    // One sound per set — the most significant milestone wins
    if (workoutJustDone) feedback.workoutDone();
    else if (weightPromptJustShown) feedback.weightPrompt();
    else if (exerciseJustDone) feedback.exerciseDone();
    else feedback.log();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-te-bg flex flex-col items-center justify-center gap-5">
        <img src="/apple-touch-icon.png" alt="" className="w-16 h-16 animate-logo-load" style={{ borderRadius: 'var(--te-radius-md)' }} />
        <p className="text-[17px] font-semibold te-t1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          {greeting}{userName ? `, ${userName}` : ''}!
        </p>
      </div>
    );
  }

  // The Profile tab's "icon" is the user's own avatar rather than a glyph —
  // it's the one tab that represents a person, and it doubles as the identity
  // affordance the header's corner button used to provide.
  const mainTabs: { key: Tab; label: string; icon: React.FC<{ className?: string; style?: React.CSSProperties }> }[] = [
    { key: 'exercises', label: 'Exercises', icon: RectangleStackIcon },
    { key: 'log', label: 'Log', icon: QueueListIcon },
    { key: 'analytics', label: 'Progress', icon: ChartBarSquareIcon },
  ];

  const tabTitles: Record<Tab, string> = {
    log: 'Workout Log',
    exercises: 'Exercises',
    analytics: 'Progress',
    profile: 'Profile',
  };

  // Notification dot on the Profile tab: pending competition invites or
  // incoming friend requests waiting on you.
  const competeAttention = competitions.pendingInvites.length + friends.incoming.length > 0;

  return (
    <div className="bg-te-bg h-full overflow-hidden flex flex-col relative">
      <WideScreenNote />
      {tab !== 'profile' && (
        <EdgeSwipePeek name={profileName} avatarUrl={profileRow?.avatar_url} onComplete={() => switchTab('profile')} />
      )}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as never}
      >
      <div
        className="max-w-lg mx-auto pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]"
        style={{
          paddingTop: 'max(28px, env(safe-area-inset-top, 0px) + 8px)',
          // The extra vh past the nav-bar clearance gives the last card room to
          // scroll all the way up into the iPod-style scroll-depth effect's
          // (Log/Exercises pages) full-opacity zone, rather than being stuck
          // half-faded once it hits the end of the scrollable content.
          paddingBottom: focusMode ? 'calc(40px + 10vh + env(safe-area-inset-bottom, 0px))' : 'calc(80px + 17vh + env(safe-area-inset-bottom, 0px))',
          transition: 'padding-bottom 0.36s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div
          className="grid"
          style={{ gridTemplateRows: focusMode ? '0fr' : '1fr', transition: 'grid-template-rows 0.36s cubic-bezier(0.22,1,0.36,1)' }}
        >
          <div style={{ overflow: 'hidden', opacity: focusMode ? 0 : 1, transition: `opacity ${focusMode ? '0.15s ease' : '0.3s ease 0.08s'}` }}>
            {/* Session indicator only — the profile avatar moved to the nav
                bar, where it's the Profile tab's icon. */}
            <div className="flex items-center mb-1" style={{ paddingTop: 9, paddingBottom: 3 }}>
              <SessionIndicator sessionStart={showDuration ? sessionStart : null} doneAt={workoutDoneAt} />
            </div>
          </div>
        </div>
        <div
          className="flex items-end justify-between"
          style={{ marginBottom: tab === 'log' ? 12 : 24 }}
        >
          <h1 className="text-[32px] font-bold te-t1 leading-none" style={{ letterSpacing: '-0.04em' }}>
            {tabTitles[tab]}
          </h1>
          {/* Nudge down so the switch track sits on the title's baseline,
              compensating for the switch's own bottom padding. */}
          <div style={{ transform: 'translateY(5px)' }}>
            <FocusModeSwitch active={focusMode} onToggle={toggleFocus} />
          </div>
        </div>

        {tab === 'exercises' ? (
          <ExercisesView
            exercises={exercises}
            logs={logs}
            onEdit={ex => setExerciseModal({ open: true, exercise: ex })}
            onDelete={deleteExercise}
            onOpenLibrary={() => setLibraryOpen(true)}
            unit={unit}
            toDisplay={toDisplay}
          />
        ) : tab === 'log' ? (
          <LogsView
            onWorkoutComplete={setWorkoutDoneAt}
            onFutureSelectedChange={setLogDateInFuture}
            competitions={competitions}
            fistBumps={fistBumps}
            logs={logs}
            exercises={exercises}
            onAdd={() => setLogModal({ open: true, exercise: null, editLog: null })}
            onAddForExercise={ex => setLogModal({ open: true, exercise: ex, editLog: null })}
            onEdit={log => setLogModal({ open: true, exercise: null, editLog: log })}
            onDelete={deleteLog}
            unit={unit}
            toDisplay={toDisplay}
            routines={routines}
            schedule={schedule}
            focusMode={focusMode}
            weekStartDay={weekStartDay}
            onCreateRoutine={() => { setScheduleInitialView('routine'); setScheduleOpen(true); }}
          />
        ) : tab === 'analytics' ? (
          <AnalyticsView
            logs={logs}
            exercises={exercises}
            unit={unit}
            toDisplay={toDisplay}
            routines={routines}
            schedule={schedule}
            competitions={competitions}
            onOpenCompetitions={() => switchTab('profile')}
          />
        ) : (
          <ProfileView
            profile={profileRow}
            friends={friends}
            competitions={competitions}
            fistBumps={fistBumps}
            unit={unit}
            toDisplay={toDisplay}
            inviteUrl={inviteUrl}
            onOpenSettings={() => setScheduleOpen(true)}
            setAvatar={setAvatar}
            uploadAvatarFile={uploadAvatarFile}
            updateBio={updateBio}
          />
        )}

      </div>
      </div>

      {/* Nav bar — intentionally minimal: a flat tab bar plus the swipe-up
          add gesture. The elaborate chrome (drag handle, expandable rest
          timer, gradient backdrop) is deliberately dropped; the iOS build
          will use a native liquid-glass nav in its place. */}
      {/* Black gradient revealed while swiping — rises from the very bottom of
          the page (not just the nav bar) to darken the backdrop behind the "+"
          affordance for a satisfying reveal. Fixed to the viewport bottom. */}
      <div
        aria-hidden
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          height: '42vh', zIndex: 39, pointerEvents: 'none',
          background: 'linear-gradient(to top, #010101 0%, rgba(1,1,1,0.92) 20%, rgba(1,1,1,0.5) 50%, transparent 100%)',
          opacity: swipeDrag > 2 ? Math.min(1, swipeDrag / (SWIPE_THRESHOLD * 0.85)) : 0,
          transform: `scaleY(${swiping ? 0.55 + Math.min(swipeDrag / SWIPE_THRESHOLD, 1) * 0.45 : 0.55})`,
          transformOrigin: 'bottom center',
          transition: swiping ? 'none' : 'opacity 0.34s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          background: 'linear-gradient(to bottom, rgba(1,1,1,0) 0%, rgba(1,1,1,0.92) 32%, #010101 58%)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onTouchStart={onDockTouchStart}
        onTouchMove={onDockTouchMove}
        onTouchEnd={onDockTouchEnd}
        onTouchCancel={onDockTouchCancel}
      >
        {/* Relative wrapper anchors the swipe-up affordance above the bar. */}
        <div ref={dockContentRef} style={{ position: 'relative' }}>
          {/* Swipe-up-to-add affordance — a faint gray "+" whose radial ring
              fills as you drag up; release past full to fire the add. Only
              visible mid-swipe. */}
          {(() => {
            const p = Math.min(swipeDrag / SWIPE_THRESHOLD, 1);
            const full = p >= 1;
            const R = 13;
            const C = 2 * Math.PI * R;
            const gray = full ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.38)';
            return (
              <div
                aria-hidden
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: '100%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  paddingBottom: 10, pointerEvents: 'none',
                  opacity: swipeDrag > 2 ? Math.min(1, swipeDrag / 16) : 0,
                  transform: `translateY(${swiping ? -swipeDrag * 0.5 : 0}px) scale(${0.92 + p * 0.08})`,
                  transformOrigin: 'bottom center',
                  transition: swiping ? 'none' : 'opacity 0.3s ease, transform 0.36s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <div style={{ position: 'relative', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 32 32" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                    <circle cx="16" cy="16" r={R} fill="none" stroke="var(--te-border-strong)" strokeWidth="2" />
                    <circle
                      cx="16" cy="16" r={R} fill="none"
                      stroke={gray} strokeWidth="2" strokeLinecap="round"
                      strokeDasharray={C} strokeDashoffset={C * (1 - p)}
                      style={{ transition: 'stroke 0.15s ease' }}
                    />
                  </svg>
                  <PlusIcon
                    className="w-[13px] h-[13px] stroke-[2.5]"
                    style={{ position: 'relative', color: gray, transition: 'color 0.15s ease' }}
                  />
                </div>
                <span style={{
                  fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  color: gray, transition: 'color 0.15s ease',
                }}>
                  {full ? '   ' : (tab === 'exercises' ? 'Add exercise' : 'Add a log')}
                </span>
              </div>
            );
          })()}

          {/* First-run hint — a minimal "^ swipe to log" above the grabber,
              gone for good once the gesture has been used twice. Hidden
              mid-swipe so it never overlaps the real affordance. */}
          {tab === 'log' && swipeUses < 2 && !focusMode && (
            <div
              aria-hidden
              className="flex flex-col items-center"
              style={{
                position: 'absolute', left: 0, right: 0, bottom: '100%',
                paddingBottom: 4, pointerEvents: 'none', gap: 1,
                opacity: swipeDrag > 2 ? 0 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {/* iOS-style chevron: rounded caps and joins, drawn rather than
                  typed, so it reads as an affordance instead of a caret. */}
              <svg
                className="animate-bounce"
                width="15" height="9" viewBox="0 0 15 9" fill="none"
                style={{ display: 'block', marginBottom: 4 }}
              >
                <path
                  d="M1.6 7.4L7.5 1.6l5.9 5.8"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{
                fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
              }}>
                swipe to log
              </span>
            </div>
          )}

          {/* Tabs — hidden in focus mode */}
          {/* Swipe-up line — the grabber you drag up on to add. */}
          <div className="flex justify-center" style={{ paddingTop: 6, paddingBottom: 2 }}>
            <div style={{ width: 68, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.16)' }} />
          </div>

          {/* Tabs — plain flat bar (no skeuomorphic panel), hidden in focus mode. */}
          <div
            className="grid"
            style={{ gridTemplateRows: focusMode ? '0fr' : '1fr', transition: 'grid-template-rows 0.36s cubic-bezier(0.22,1,0.36,1)' }}
          >
            <div style={{ overflow: 'hidden', opacity: focusMode ? 0 : 1, transition: `opacity ${focusMode ? '0.15s ease' : '0.3s ease 0.08s'}` }}>
              <div className="flex justify-center items-center gap-2.5 pt-1 pb-0.5">
                <div
                  className="grid grid-cols-3 items-center rounded-full"
                  style={{ background: 'var(--te-border)', border: '1px solid var(--te-border)', padding: '5px 6px' }}
                >
                  {mainTabs.map(({ key, label, icon: Icon }) => {
                    const isActive = tab === key;
                    const color = isActive ? '#fff' : 'rgba(255,255,255,0.4)';
                    return (
                      <button
                        key={key}
                        onClick={() => switchTab(key)}
                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full active:opacity-60 transition-opacity select-none"
                      >
                        <Icon className="w-[24px] h-[24px]" style={{ color }} />
                        <span className="text-[10px] font-medium tracking-tight" style={{ color }}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
  onClick={() => switchTab('profile')}
  aria-label="Profile"
  className="relative flex items-center justify-center active:opacity-60 transition-opacity select-none shrink-0"
  style={{
    width: 62,
    height: 62,
    marginTop: -1, // adjust if needed
    marginBottom: -1,
    background: 'transparent',
    border: 'none',
    padding: 0,
  }}
>
  <Avatar
    name={profileName}
    avatarUrl={profileRow?.avatar_url}
    size={62}
    ring={false}
  />

  {competeAttention && tab !== 'profile' && (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 3,
        right: 3,
        width: 7,
        height: 7,
        borderRadius: 9999,
        background: 'var(--te-accent)',
        boxShadow: '0 0 0 2px var(--te-bg)',
      }}
    />
  )}
</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ExerciseModal
        open={exerciseModal.open}
        onClose={() => { setExerciseModal({ open: false, exercise: null }); setExercisePrefill(undefined); }}
        onSave={handleSaveExercise}
        onDelete={deleteExercise}
        exercise={exerciseModal.exercise}
        prefill={exercisePrefill}
        unit={unit}
        toDisplay={toDisplay}
        fromDisplay={fromDisplay}
      />

      <ExerciseLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibrarySelect}
        existingNames={new Set(exercises.map(e => e.name.toLowerCase()))}
      />
      <LogModal
        open={logModal.open}
        onClose={() => setLogModal({ open: false, exercise: null, editLog: null })}
        onSave={handleAddLog}
        onUpdate={updateLog}
        onDelete={deleteLog}
        exercise={logModal.exercise}
        editLog={logModal.editLog}
        exercises={exercises}
        unit={unit}
        toDisplay={toDisplay}
        fromDisplay={fromDisplay}
        barbellWeight={barbellWeight}
      />

      {/* Floating rest timer — appears above nav bar when auto-started */}
      {timerFloating && (
        <div
          style={{
            position: 'fixed',
            bottom: `calc(76px + env(safe-area-inset-bottom, 0px))`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
          }}
        >
          <button
            key={timerFloatKey}
            onClick={dismissFloatingTimer}
            className="animate-float-pill-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: timerDone ? '#163320' : '#1e1e20',
              border: `1.5px solid ${timerDone ? 'rgba(48,209,88,0.3)' : 'var(--te-border-strong)'}`,
              borderRadius: 9999,
              padding: '10px 20px',
              boxShadow: timerDone
                ? '0 4px 24px rgba(48,209,88,0.18), 0 2px 8px rgba(0,0,0,0.5)'
                : '0 4px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <div className={`te-led ${
              timerDone ? 'te-led-on' :
              (timerRunning && timerRemaining !== null && timerRemaining <= 10) ? 'te-led-warn' :
              'te-led-on'
            }`} />
            <span className={`te-digit text-[20px] font-semibold tracking-tight ${
              timerDone ? 'text-[color:var(--te-success)]' :
              (timerRunning && timerRemaining !== null && timerRemaining <= 10) ? 'text-[color:var(--te-caution)]' :
              'te-t1'
            }`}>
              {fmtTimer(timerRemaining ?? timerDuration)}
            </span>
            {timerDone && (
              <span style={{ fontSize: 13, color: 'rgba(48,209,88,0.65)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                Tap to close
              </span>
            )}
          </button>
        </div>
      )}

      {/* Fading text-only error for refused adds (e.g. logging a future day) */}
      {addError && (
        <div
          key={addError.key}
          className="fixed left-0 right-0 z-[46] flex justify-center pointer-events-none"
          style={{ bottom: 'calc(118px + env(safe-area-inset-bottom, 0px))' }}
        >
          <span
            className="animate-fade-out-late"
            style={{
              fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--te-danger)', textShadow: '0 2px 12px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap',
            }}
          >
            {addError.text}
          </span>
        </div>
      )}

      {prToast && (
        <PRToast
          exerciseName={prToast.exerciseName}
          detail={prToast.detail}
          onDone={dismissPr.current}
        />
      )}

      {extraRepsToast && (
        <ExtraRepsToast
          exerciseName={extraRepsToast.exerciseName}
          extra={extraRepsToast.extra}
          onDone={dismissExtra.current}
        />
      )}

      {weightPrompt && (
        <IncreaseWeightOverlay
          exerciseName={weightPrompt.exercise.name}
          currentWeight={weightPrompt.weightDisplay}
          onDismiss={() => setWeightPrompt(null)}
          onBump={() => {
            setWeightPrompt(null);
            setExerciseModal({ open: true, exercise: weightPrompt.exercise });
          }}
        />
      )}

      {needsUsername && <UsernameSetupModal onCreate={createProfile} />}

      {inviteToast && (
        <div
          className="fixed top-0 left-0 right-0 z-[55] flex justify-center pointer-events-none"
          style={{ paddingTop: 'max(56px, env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <div className="pointer-events-auto animate-slide-down te-panel px-5 py-3.5 rounded-te-md">
            <span className="text-[15px] font-semibold tracking-tight te-t1">{inviteToast}</span>
          </div>
        </div>
      )}

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setScheduleInitialView(undefined); }}
        initialView={scheduleInitialView}
        routines={routines}
        schedule={schedule}
        exercises={exercises}
        onAddRoutine={addRoutine}
        onUpdateRoutine={updateRoutine}
        onDeleteRoutine={deleteRoutine}
        onAssignDay={assignDay}
        onSignOut={onSignOut}
        userName={userName}
        onUpdateName={onUpdateName}
        timerDuration={timerDuration}
        onSetTimerDuration={setTimerDuration}
        barbellWeight={barbellWeight}
        onSetBarbellWeight={setBarbellWeight}
        showDuration={showDuration}
        onSetShowDuration={setShowDuration}
        weekStartDay={weekStartDay}
        onSetWeekStartDay={setWeekStartDay}
        soundEnabled={soundEnabled}
        onSetSoundEnabled={setSoundEnabled}
        hapticsEnabled={hapticsEnabled}
        onSetHapticsEnabled={setHapticsEnabled}
        accent={accent}
        onSetAccent={setAccent}
        categoryColors={categoryColors}
        onSetCategoryColor={setCategoryColor}
        bio={profileRow?.bio ?? null}
        onUpdateBio={updateBio}
        unit={unit}
        onSetUnit={setUnit}
        toDisplay={toDisplay}
        fromDisplay={fromDisplay}
        logs={logs}
      />

    </div>
  );
}

function PasswordResetScreen({ onUpdate }: { onUpdate: (pw: string) => Promise<string | null> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords don\'t match.'); return; }
    setError(null); setLoading(true);
    const err = await onUpdate(password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <div className="min-h-screen bg-te-bg flex flex-col items-center justify-center pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]"
      style={{ background: 'radial-gradient(ellipse 100% 50% at 50% -10%, rgba(244,241,236,0.09) 0%, #010101 55%)' }}>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/apple-touch-icon.png" alt="" className="w-[72px] h-[72px] rounded-te-md"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.55)' }} />
          <p className="text-[32px] font-bold te-t1" style={{ letterSpacing: '-0.035em' }}>Overload</p>
        </div>
        <div className="rounded-te-lg p-6 space-y-4"
          style={{ background: 'var(--te-surface-3)', border: '1px solid var(--te-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <div className="text-center space-y-1">
            <p className="text-[17px] font-semibold te-t1 tracking-tight">Set new password</p>
            <p className="text-[13px]" style={{ color: 'var(--te-text-4)' }}>Choose a strong password</p>
          </div>
          <form onSubmit={handle} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="New password" autoComplete="new-password"
              className="w-full rounded-te-md px-4 py-[15px] text-[17px] te-t1 placeholder:text-white/25 focus:outline-none transition-colors"
              style={{ background: 'var(--te-fill-subtle)', border: '1px solid var(--te-border)' }} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password" autoComplete="new-password"
              className="w-full rounded-te-md px-4 py-[15px] text-[17px] te-t1 placeholder:text-white/25 focus:outline-none transition-colors"
              style={{ background: 'var(--te-fill-subtle)', border: '1px solid var(--te-border)' }} />
            {error && <p className="text-[13px]" style={{ color: 'var(--te-danger)' }}>{error}</p>}
            <button type="submit" disabled={loading || !password || !confirm}
              className="w-full py-[15px] rounded-te-md font-semibold text-[15px] tracking-tight disabled:opacity-30 active:opacity-80 transition-all"
              style={{ background: '#f4f1ec', color: 'var(--te-ink)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, state, passwordRecovery, signIn, signUp, signOut, signInWithGoogle, resendConfirmation, verifyOtp, resetPassword, updatePassword, userName, updateUserName } = useAuth();

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-te-bg flex items-center justify-center">
        <img src="/apple-touch-icon.png" alt="" className="w-16 h-16 animate-logo-load" style={{ borderRadius: 'var(--te-radius-md)' }} />
      </div>
    );
  }

  if (state === 'authenticated' && passwordRecovery) {
    return <PasswordResetScreen onUpdate={updatePassword} />;
  }

  if (state === 'unauthenticated' || !user) {
    return <AuthView onSignIn={signIn} onSignUp={signUp} onResend={resendConfirmation} onVerifyOtp={verifyOtp} onResetPassword={resetPassword} onGoogle={signInWithGoogle} />;
  }

  return <MainApp userId={user.id} onSignOut={signOut} userName={userName} onUpdateName={updateUserName} />;
}
