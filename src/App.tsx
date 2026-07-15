import { useState, useEffect, useRef, useCallback } from 'react';
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
import ExercisesView from './views/ExercisesView';
import LogsView from './views/LogsView';
import AnalyticsView from './views/AnalyticsView';
import AuthView from './views/AuthView';
import ExerciseModal from './components/ExerciseModal';
import LogModal from './components/LogModal';
import ScheduleModal from './components/ScheduleModal';
import ProfilePage from './components/ProfilePage';
import Avatar from './components/Avatar';
import EdgeSwipePeek from './components/EdgeSwipePeek';
import Walkthrough from './components/Walkthrough';
import UsernameSetupModal from './components/UsernameSetupModal';
import ExerciseLibraryModal from './components/ExerciseLibraryModal';
import { calcStreak, calcConsistency } from './lib/streak';
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

type Tab = 'exercises' | 'log' | 'analytics';

function fmtTimer(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// "Leave your computer at home" watermark for wide screens
function WideScreenNote() {
  const text = 'LEAVE YOUR COMPUTER AT HOME';
  const style: React.CSSProperties = {
    color: 'rgba(244,241,236,0.035)',
    fontSize: 12,
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
        <div className="te-panel rounded-[26px] overflow-hidden">
          <div className="flex flex-col items-center pt-10 pb-8 px-8 text-center gap-5">
            <div className="w-14 h-14 rounded-full bg-apple-red/[0.15] flex items-center justify-center ring-1 ring-apple-red/20">
              <ChartBarIcon className="w-6 h-6 text-apple-red" />
            </div>
            <div>
              <p className="text-[20px] font-bold text-white leading-tight tracking-tight mb-2">
                Time to go heavier!
              </p>
              <p className="text-[15px] text-apple-label-secondary leading-relaxed max-w-[260px] mx-auto">
                You've hit your target for{' '}
                <span className="text-white font-medium">{exerciseName}</span>
                {' '}at{' '}
                <span className="text-white font-medium">{currentWeight}</span>.
              </p>
            </div>
          </div>

          <div className="h-px bg-white/[0.05]" />
          <button
            onClick={onBump}
            className="w-full py-[18px] text-[17px] font-semibold text-apple-green active:bg-white/[0.06] transition-colors tracking-tight"
          >
            Update weight
          </button>
          <div className="h-px bg-white/[0.05]" />
          <button
            onClick={onDismiss}
            className="w-full py-[18px] text-[17px] text-apple-label-tertiary active:bg-white/[0.06] transition-colors"
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
          className="te-panel flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-2xl"
          style={{ borderColor: 'rgba(48,209,88,0.2)', boxShadow: '0 4px 24px rgba(48,209,88,0.1), 0 4px 16px rgba(0,0,0,0.5)' }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(48,209,88,0.14)' }}>
            <TrophyIcon className="w-4 h-4" style={{ color: '#30d158' }} />
          </div>
          <div className="leading-tight">
            <span className="text-[14px] font-semibold tracking-tight" style={{ color: '#30d158' }}>New PR!</span>
            <span className="text-[14px] text-white ml-1.5 tracking-tight font-medium">{detail}</span>
            <span className="text-[14px] text-apple-label-tertiary ml-1.5 tracking-tight">{exerciseName}</span>
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
        <div className="te-panel flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-2xl">
          <div className="w-7 h-7 rounded-full bg-apple-red/[0.15] flex items-center justify-center shrink-0">
            <BoltIcon className="w-4 h-4 text-apple-red" />
          </div>
          <div className="leading-tight">
            <span className="text-[14px] font-semibold text-white tracking-tight">+{extra} extra rep{extra > 1 ? 's' : ''}</span>
            <span className="text-[14px] text-apple-label-tertiary ml-1.5 tracking-tight">{exerciseName}</span>
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
      <ViewfinderCircleIcon className="w-3.5 h-3.5 transition-opacity" style={{ color: '#f4f1ec', opacity: active ? 1 : 0.25 }} />
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
  } = useSettings();
  const { routines, schedule, addRoutine, updateRoutine, deleteRoutine, assignDay } = useSchedule(userId);
  const profileApi = useProfile(userId, userName);
  const friends = useFriends(userId);
  const { needsUsername, profile: profileRow, pushStats, createProfile, inviteUrl, setAvatar, uploadAvatarFile, updateBio } = profileApi;

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
  const [showProfile, setShowProfile] = useState(false);

  // First-run walkthrough. Auto-opens once for new users (data loaded, no
  // exercises yet); re-openable from Settings. Flag is localStorage-only.
  const WALKTHROUGH_KEY = 'overload_walkthrough_v1';
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    if (loading || needsUsername || !profileRow) return;
    let seen = true;
    try { seen = localStorage.getItem(WALKTHROUGH_KEY) === 'done'; } catch { /* ignore */ }
    if (!seen && exercises.length === 0) setShowGuide(true);
  }, [loading, needsUsername, profileRow, exercises.length]);
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    try { localStorage.setItem(WALKTHROUGH_KEY, 'done'); } catch { /* ignore */ }
  }, []);

  const profileName = profileRow?.display_name || profileRow?.username || userName || 'You';

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

  function triggerAdd() {
    if (tab === 'exercises') { setExercisePrefill(undefined); setExerciseModal({ open: true, exercise: null }); }
    else { setLogModal({ open: true, exercise: null, editLog: null }); }
  }
  function onDockTouchStart(e: React.TouchEvent) {
    swipeStartY.current = e.touches[0].clientY;
    swipeFullRef.current = false;
    swipeShownRef.current = false;
    setSwiping(true);
  }
  function onDockTouchMove(e: React.TouchEvent) {
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
    const committed = swipeFullRef.current;
    setSwiping(false);
    setSwipeDrag(0);
    swipeFullRef.current = false;
    swipeShownRef.current = false;
    if (committed) triggerAdd();
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
        <img src="/apple-touch-icon.png" alt="" className="w-16 h-16 animate-logo-load" style={{ borderRadius: 18 }} />
        <p className="text-[18px] font-semibold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          {greeting}{userName ? `, ${userName}` : ''}!
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.FC<{ className?: string; style?: React.CSSProperties }> }[] = [
    { key: 'exercises', label: 'Exercises', icon: RectangleStackIcon },
    { key: 'log', label: 'Log', icon: QueueListIcon },
    { key: 'analytics', label: 'Progress', icon: ChartBarSquareIcon },
  ];

  const tabTitles: Record<Tab, string> = {
    log: 'Workout Log',
    exercises: 'Exercises',
    analytics: 'Progress',
  };

  return (
    <div className="bg-te-bg h-full overflow-hidden flex flex-col relative">
      <WideScreenNote />
      {!showProfile && (
        <EdgeSwipePeek name={profileName} avatarUrl={profileRow?.avatar_url} onComplete={() => setShowProfile(true)} />
      )}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' } as never}
      >
      <div
        className="max-w-lg mx-auto pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]"
        style={{
          paddingTop: 'max(60px, env(safe-area-inset-top, 0px) + 20px)',
          paddingBottom: focusMode ? 'calc(40px + env(safe-area-inset-bottom, 0px))' : 'calc(80px + env(safe-area-inset-bottom, 0px))',
          transition: 'padding-bottom 0.36s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header */}
        <div
          className="grid"
          style={{ gridTemplateRows: focusMode ? '0fr' : '1fr', transition: 'grid-template-rows 0.36s cubic-bezier(0.22,1,0.36,1)' }}
        >
          <div style={{ overflow: 'hidden', opacity: focusMode ? 0 : 1, transition: `opacity ${focusMode ? '0.15s ease' : '0.3s ease 0.08s'}` }}>
            {/* items-center vertically centers the greeting against the avatar;
                the row's own padding gives the avatar's box-shadow ring
                clearance from the edges so it isn't clipped (the padding lives
                on the row, not the collapsing wrapper, so focus mode still
                collapses cleanly). */}
            <div className="flex items-center justify-between mb-1" style={{ paddingTop: 9, paddingBottom: 3, paddingRight: 3 }}>
              <span className="te-label">
                {greeting}{userName ? `, ${userName}` : ''}!
              </span>
              <button
                onClick={() => setShowProfile(true)}
                className="active:opacity-70 transition-opacity shrink-0"
                aria-label="Profile"
              >
                <Avatar name={profileName} avatarUrl={profileRow?.avatar_url} size={28} />
              </button>
            </div>
          </div>
        </div>
        <div
          className="flex items-end justify-between"
          style={{ marginBottom: tab === 'log' ? 12 : 24 }}
        >
          <h1 className="text-[36px] font-bold text-[#f4f1ec] leading-none" style={{ letterSpacing: '-0.04em' }}>
            {tabTitles[tab]}
          </h1>
          {/* Nudge down so the switch track sits on the title's baseline,
              compensating for the switch's own bottom padding. */}
          <div style={{ transform: 'translateY(5px)' }} data-guide="focus">
            <FocusModeSwitch active={focusMode} onToggle={toggleFocus} />
          </div>
        </div>

        {tab === 'exercises' ? (
          <ExercisesView
            exercises={exercises}
            logs={logs}
            onAdd={() => { setExercisePrefill(undefined); setExerciseModal({ open: true, exercise: null }); }}
            onEdit={ex => setExerciseModal({ open: true, exercise: ex })}
            onDelete={deleteExercise}
            onOpenLibrary={() => setLibraryOpen(true)}
            unit={unit}
            toDisplay={toDisplay}
          />
        ) : tab === 'log' ? (
          <LogsView
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
            showDuration={showDuration}
            focusMode={focusMode}
          />
        ) : (
          <AnalyticsView
            logs={logs}
            exercises={exercises}
            unit={unit}
            toDisplay={toDisplay}
            routines={routines}
            schedule={schedule}
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
          background: 'linear-gradient(to top, #0a0908 0%, rgba(10,9,8,0.92) 20%, rgba(10,9,8,0.5) 50%, transparent 100%)',
          opacity: swipeDrag > 2 ? Math.min(1, swipeDrag / (SWIPE_THRESHOLD * 0.85)) : 0,
          transform: `scaleY(${swiping ? 0.55 + Math.min(swipeDrag / SWIPE_THRESHOLD, 1) * 0.45 : 0.55})`,
          transformOrigin: 'bottom center',
          transition: swiping ? 'none' : 'opacity 0.34s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,9,8,0) 0%, rgba(10,9,8,0.92) 32%, #0a0908 58%)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onTouchStart={onDockTouchStart}
        onTouchMove={onDockTouchMove}
        onTouchEnd={onDockTouchEnd}
        onTouchCancel={onDockTouchCancel}
      >
        {/* Relative wrapper anchors the swipe-up affordance above the bar. */}
        <div style={{ position: 'relative' }} data-guide="dock">
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
                    <circle cx="16" cy="16" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
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
                  fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  color: gray, transition: 'color 0.15s ease',
                }}>
                  {full ? 'Release to add' : (tab === 'exercises' ? 'Add exercise' : 'Add a log')}
                </span>
              </div>
            );
          })()}

          {/* Tabs — hidden in focus mode */}
          {/* Swipe-up line — the grabber you drag up on to add. */}
          <div className="flex justify-center" style={{ paddingTop: 6, paddingBottom: 2 }}>
            <div style={{ width: 68, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.16)' }} />
          </div>

          {/* Tabs — plain flat bar (no skeuomorphic panel), hidden in focus mode. */}
          <div
            className="grid"
            style={{ gridTemplateRows: focusMode ? '0fr' : '1fr', transition: 'grid-template-rows 0.36s cubic-bezier(0.22,1,0.36,1)' }}
          >
            <div style={{ overflow: 'hidden', opacity: focusMode ? 0 : 1, transition: `opacity ${focusMode ? '0.15s ease' : '0.3s ease 0.08s'}` }}>
              <div className="flex justify-center pt-1 pb-0.5">
                <div
                  className="flex items-center rounded-full"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', padding: '4px 10px' }}
                >
                  {tabs.map(({ key, label, icon: Icon }) => {
                    const isActive = tab === key;
                    const color = isActive ? '#fff' : 'rgba(255,255,255,0.4)';
                    return (
                      <button
                        key={key}
                        onClick={() => switchTab(key)}
                        className="flex flex-col items-center gap-0.5 px-7 py-1 rounded-full active:opacity-60 transition-opacity select-none"
                      >
                        <Icon className="w-[22px] h-[22px]" style={{ color }} />
                        <span className="text-[10px] font-medium tracking-tight" style={{ color }}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
              border: `1.5px solid ${timerDone ? 'rgba(48,209,88,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 100,
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
              timerDone ? 'text-[#30d158]' :
              (timerRunning && timerRemaining !== null && timerRemaining <= 10) ? 'text-apple-orange' :
              'text-white/85'
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

      <ProfilePage
        open={showProfile}
        onClose={() => setShowProfile(false)}
        profile={profileRow}
        inviteUrl={inviteUrl}
        friends={friends}
        unit={unit}
        toDisplay={toDisplay}
        onOpenSettings={() => { setShowProfile(false); setScheduleOpen(true); }}
        setAvatar={setAvatar}
        uploadAvatarFile={uploadAvatarFile}
        updateBio={updateBio}
      />

      <Walkthrough open={showGuide} onClose={closeGuide} focusMode={focusMode} onToggleFocus={toggleFocus} />

      {needsUsername && <UsernameSetupModal onCreate={createProfile} />}

      {inviteToast && (
        <div
          className="fixed top-0 left-0 right-0 z-[55] flex justify-center pointer-events-none"
          style={{ paddingTop: 'max(56px, env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <div className="pointer-events-auto animate-slide-down te-panel px-5 py-3.5 rounded-2xl">
            <span className="text-[14px] font-semibold tracking-tight text-[#f4f1ec]">{inviteToast}</span>
          </div>
        </div>
      )}

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        routines={routines}
        schedule={schedule}
        exercises={exercises}
        onAddRoutine={addRoutine}
        onUpdateRoutine={updateRoutine}
        onDeleteRoutine={deleteRoutine}
        onAssignDay={assignDay}
        onSignOut={onSignOut}
        onReplayGuide={() => { setScheduleOpen(false); setShowGuide(true); }}
        userName={userName}
        onUpdateName={onUpdateName}
        timerDuration={timerDuration}
        onSetTimerDuration={setTimerDuration}
        barbellWeight={barbellWeight}
        onSetBarbellWeight={setBarbellWeight}
        showDuration={showDuration}
        onSetShowDuration={setShowDuration}
        soundEnabled={soundEnabled}
        onSetSoundEnabled={setSoundEnabled}
        hapticsEnabled={hapticsEnabled}
        onSetHapticsEnabled={setHapticsEnabled}
        accent={accent}
        onSetAccent={setAccent}
        unit={unit}
        onSetUnit={setUnit}
        toDisplay={toDisplay}
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
      style={{ background: 'radial-gradient(ellipse 100% 50% at 50% -10%, rgba(244,241,236,0.09) 0%, #0a0908 55%)' }}>
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/apple-touch-icon.png" alt="" className="w-[72px] h-[72px] rounded-[22px]"
            style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.55)' }} />
          <p className="text-[28px] font-bold text-[#f4f1ec]" style={{ letterSpacing: '-0.035em' }}>Overload</p>
        </div>
        <div className="rounded-3xl p-6 space-y-4"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
          <div className="text-center space-y-1">
            <p className="text-[18px] font-semibold text-[#f4f1ec] tracking-tight">Set new password</p>
            <p className="text-[13px]" style={{ color: 'rgba(244,241,236,0.4)' }}>Choose a strong password</p>
          </div>
          <form onSubmit={handle} className="space-y-3">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="New password" autoComplete="new-password"
              className="w-full rounded-2xl px-4 py-[15px] text-[16px] text-white placeholder:text-white/20 focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password" autoComplete="new-password"
              className="w-full rounded-2xl px-4 py-[15px] text-[16px] text-white placeholder:text-white/20 focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }} />
            {error && <p className="text-[13px]" style={{ color: '#ff453a' }}>{error}</p>}
            <button type="submit" disabled={loading || !password || !confirm}
              className="w-full py-[15px] rounded-2xl font-semibold text-[15px] tracking-tight disabled:opacity-30 active:opacity-80 transition-all"
              style={{ background: '#f4f1ec', color: '#0a0908', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, state, passwordRecovery, signIn, signUp, signOut, resendConfirmation, verifyOtp, resetPassword, updatePassword, userName, updateUserName } = useAuth();

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-te-bg flex items-center justify-center">
        <img src="/apple-touch-icon.png" alt="" className="w-16 h-16 animate-logo-load" style={{ borderRadius: 18 }} />
      </div>
    );
  }

  if (state === 'authenticated' && passwordRecovery) {
    return <PasswordResetScreen onUpdate={updatePassword} />;
  }

  if (state === 'unauthenticated' || !user) {
    return <AuthView onSignIn={signIn} onSignUp={signUp} onResend={resendConfirmation} onVerifyOtp={verifyOtp} onResetPassword={resetPassword} />;
  }

  return <MainApp userId={user.id} onSignOut={signOut} userName={userName} onUpdateName={updateUserName} />;
}
