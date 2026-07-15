import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A self-contained coach-mark tour. Each interactive step spotlights the real
// control (cut out of the blur) and advances by *performing* the gesture,
// which fires the real shortcut so the user sees its actual outcome (the log
// sheet slides up, focus mode collapses the UI, the profile opens). The
// message sits in a consistent lower-middle spot over its own dark gradient so
// it stays readable even once a menu is open. Finishing lifts the blur.

type GuideTab = 'log' | 'exercises' | 'analytics';
type Interaction = 'button' | 'tap' | 'swipeUp' | 'swipeLeft';
type Target = 'none' | 'focus' | 'dock' | 'rightEdge';
type Outcome = 'none' | 'addLog' | 'addExercise' | 'focus' | 'profile';

interface Step {
  tab?: GuideTab;
  target: Target;
  interaction: Interaction;
  outcome: Outcome;
  title: string;
  body?: string;
  reveal?: string;   // message shown once the outcome is on screen
}

const STEPS: Step[] = [
  {
    target: 'none', interaction: 'button', outcome: 'none',
    title: 'Welcome to Overload!',
    body: 'Take a quick tour to familiarize yourself with the features that make Overload fast.',
  },
  {
    tab: 'log', target: 'dock', interaction: 'swipeUp', outcome: 'addLog',
    title: 'Swipe up to log your set.',
    reveal: 'Log your set here.',
  },
  {
    target: 'focus', interaction: 'tap', outcome: 'focus',
    title: 'Turn on focus mode.',
    body: 'Focus mode lets you see only your exercise logs, to keep distractions away.',
    reveal: 'Distractions hidden.',
  },
  {
    target: 'rightEdge', interaction: 'swipeLeft', outcome: 'profile',
    title: 'Quickly access your profile.',
    reveal: 'Here you can view your profile and leaderboard to compete with friends!',
  },
  {
    tab: 'exercises', target: 'dock', interaction: 'swipeUp', outcome: 'addExercise',
    title: 'Add your first exercise.',
    body: 'Swipe up here to add one — you’re ready to track.',
    reveal: 'Add your exercise here.',
  },
];

interface Rect { top: number; left: number; width: number; height: number; }

interface Props {
  open: boolean;
  onClose: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
  onGoTab: (tab: GuideTab) => void;
  onDemoAddLog: () => void;
  onDemoAddExercise: () => void;
  onDemoCloseAdd: () => void;
  onOpenProfile: () => void;
  onCloseProfile: () => void;
}

export default function Walkthrough(props: Props) {
  const { open, onClose, focusMode, onToggleFocus, onGoTab,
    onDemoAddLog, onDemoAddExercise, onDemoCloseAdd, onOpenProfile, onCloseProfile } = props;

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'prompt' | 'revealed'>('prompt');
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);      // spotlight hole
  const [lineRect, setLineRect] = useState<Rect | null>(null); // swipe-up line
  const initialFocus = useRef(focusMode);

  useEffect(() => {
    if (open) { setI(0); setPhase('prompt'); setClosing(false); initialFocus.current = focusMode; }
  }, [open]);

  const step = open ? STEPS[i] : null;

  useEffect(() => {
    if (!step) return;
    // Steps that switch pages get an "intro" beat: the destination page is
    // shown dimmed (not spotlit) with the message, so the user notices the
    // switch before the swipe prompt appears — otherwise Add Log and Add
    // Exercise are easy to confuse.
    if (step.tab) {
      onGoTab(step.tab);
      setPhase('intro');
      const t = window.setTimeout(() => setPhase('prompt'), 1200);
      return () => window.clearTimeout(t);
    }
    setPhase('prompt');
  }, [i, open]);

  useLayoutEffect(() => {
    if (!step || phase !== 'prompt') return;
    const measure = () => {
      setRect(targetRect(step.target));
      setLineRect(step.interaction === 'swipeUp' ? elRect('[data-guide="swipeline"]') : null);
    };
    measure();
    const t1 = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 260);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.removeEventListener('resize', measure); };
  }, [step?.target, i, open, phase]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  const revealed = phase === 'revealed';
  const intro = phase === 'intro';

  function cleanupOutcome(st: Step) {
    if (st.outcome === 'addLog' || st.outcome === 'addExercise') onDemoCloseAdd();
    if (st.outcome === 'profile') onCloseProfile();
    if (st.outcome === 'focus' && focusMode !== initialFocus.current) onToggleFocus();
  }
  function performOutcome(st: Step) {
    if (st.outcome === 'addLog') onDemoAddLog();
    else if (st.outcome === 'addExercise') onDemoAddExercise();
    else if (st.outcome === 'focus') onToggleFocus();
    else if (st.outcome === 'profile') onOpenProfile();
  }
  function onGesture() { performOutcome(s); setPhase('revealed'); }
  function advance() { cleanupOutcome(s); last ? finish() : setI(i + 1); }
  function finish() {
    cleanupOutcome(s);
    if (focusMode !== initialFocus.current) onToggleFocus();
    setClosing(true);
    window.setTimeout(onClose, 480);
  }

  const hole = phase === 'prompt' && s.target !== 'none' ? rect : null;
  const message = revealed ? (s.reveal ?? '') : s.title;
  const body = revealed ? undefined : s.body;
  const showButton = revealed || (s.interaction === 'button' && !intro);
  const buttonLabel = revealed ? (last ? 'Done' : 'Next') : 'Start';

  return (
    <div
      className="fixed inset-0 z-[70] select-none"
      style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.46s cubic-bezier(0.22,1,0.36,1)', pointerEvents: revealed ? 'none' : 'auto' }}
    >
      <style>{WT_CSS}</style>

      {phase === 'prompt' && <Spotlight hole={hole} />}
      {/* Intro beat: dim (not blurred) so the user sees the page we switched to */}
      {intro && <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} />}

      {/* Skip */}
      <button
        onClick={finish}
        className="absolute z-30 text-[13px] font-medium text-white/45 active:text-white/70 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 'max(20px, env(safe-area-inset-right))', pointerEvents: 'auto' }}
      >
        Skip
      </button>

      {/* Prompt-phase hints + gesture catcher */}
      {phase === 'prompt' && !closing && <HintGlyph interaction={s.interaction} hole={hole} lineRect={lineRect} />}
      {phase === 'prompt' && !closing && s.interaction !== 'button' && (
        <GestureCatcher interaction={s.interaction} hole={hole} onDo={onGesture} />
      )}

      {/* Message — consistent lower-middle spot, over its own dark gradient */}
      <div
        key={`m${i}-${phase}`}
        className="absolute left-1/2 w-full max-w-[340px] px-[26px] z-20 flex flex-col items-center"
        style={{ top: '61%', transform: 'translate(-50%, -50%)', animation: 'wt-rise 0.32s cubic-bezier(0.22,1,0.36,1)', pointerEvents: 'none' }}
      >
        {/* Readability gradient behind the text — strong enough to stay legible
            over an opened menu */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2"
          style={{
            width: '175%', height: 440, transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(ellipse 52% 50% at 50% 50%, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.9) 42%, rgba(0,0,0,0.55) 68%, transparent 88%)',
          }}
        />
        <div className="relative text-center">
          <h3 className="text-[21px] font-bold text-[#f4f1ec] tracking-tight leading-snug" style={{ letterSpacing: '-0.02em' }}>{message}</h3>
          {body && <p className="text-[14px] leading-snug text-white/60 mt-2">{body}</p>}
        </div>

        <div className="relative flex items-center justify-center gap-2 mt-5">
          {STEPS.map((_, idx) => (
            <span key={idx} className="rounded-full transition-all"
              style={{ width: idx === i ? 18 : 6, height: 6, background: idx === i ? '#f4f1ec' : 'rgba(255,255,255,0.25)' }} />
          ))}
        </div>

        {showButton && (
          <button
            onClick={advance}
            className="relative w-full h-[50px] rounded-[16px] mt-5 flex items-center justify-center text-[15px] font-semibold text-black active:opacity-80 transition-opacity"
            style={{ background: '#f4f1ec', pointerEvents: 'auto' }}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Spotlight (4 blurred panels around the hole; no ring) ───────────────────
function Spotlight({ hole }: { hole: Rect | null }) {
  const panel: React.CSSProperties = {
    position: 'absolute', background: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
  };
  if (!hole) return <div style={{ ...panel, inset: 0 }} />;
  const p = 10;
  const x = hole.left - p, y = hole.top - p, w = hole.width + p * 2, h = hole.height + p * 2;
  return (
    <>
      <div style={{ ...panel, top: 0, left: 0, right: 0, height: Math.max(0, y) }} />
      <div style={{ ...panel, top: y + h, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...panel, top: y, left: 0, width: Math.max(0, x), height: h }} />
      <div style={{ ...panel, top: y, left: x + w, right: 0, height: h }} />
    </>
  );
}

// ── Gesture detection ───────────────────────────────────────────────────────
function GestureCatcher({ interaction, hole, onDo }: { interaction: Interaction; hole: Rect | null; onDo: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  function down(e: React.PointerEvent) { start.current = { x: e.clientX, y: e.clientY }; fired.current = false; }
  function move(e: React.PointerEvent) {
    if (!start.current || fired.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    if (interaction === 'swipeUp' && -dy > 46 && Math.abs(dx) < 60) { fired.current = true; onDo(); }
    if (interaction === 'swipeLeft' && -dx > 46 && Math.abs(dy) < 60) { fired.current = true; onDo(); }
  }
  function up(e: React.PointerEvent) {
    if (fired.current || !start.current) { start.current = null; return; }
    if (interaction === 'tap') {
      const dx = Math.abs(e.clientX - start.current.x), dy = Math.abs(e.clientY - start.current.y);
      if (dx < 12 && dy < 12) onDo();
    }
    start.current = null;
  }
  const style: React.CSSProperties = interaction === 'tap' && hole
    ? { position: 'absolute', top: hole.top - 10, left: hole.left - 10, width: hole.width + 20, height: hole.height + 20, touchAction: 'none' }
    : { position: 'absolute', inset: 0, touchAction: 'none' };
  return <div className="z-10" style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} />;
}

// ── Hints ───────────────────────────────────────────────────────────────────
function HintGlyph({ interaction, hole, lineRect }: { interaction: Interaction; hole: Rect | null; lineRect: Rect | null }) {
  if (interaction === 'swipeUp') {
    // Pulse the actual swipe-up line, plus a chevron above it.
    const bar = lineRect;
    const chevronBottom = (bar ? window.innerHeight - bar.top : (hole ? window.innerHeight - hole.top : 120)) + 12;
    return (
      <>
        {bar && (
          <div
            className="absolute wt-lineglow z-10 pointer-events-none"
            style={{ top: bar.top, left: bar.left, width: bar.width, height: bar.height, borderRadius: 99 }}
          />
        )}
        <div className="absolute left-1/2 -translate-x-1/2 wt-up z-10 pointer-events-none" style={{ bottom: chevronBottom }}><Chevron dir="up" /></div>
      </>
    );
  }
  if (interaction === 'swipeLeft') {
    return <div className="absolute top-1/2 -translate-y-1/2 wt-left z-10 pointer-events-none" style={{ right: 30 }}><Chevron dir="left" /></div>;
  }
  if (interaction === 'tap' && hole) {
    // Just the pulsing circle on the toggle — no square.
    return (
      <div className="absolute wt-tap z-10 pointer-events-none rounded-full"
        style={{ top: hole.top + hole.height / 2 - 15, left: hole.left + hole.width / 2 - 15, width: 30, height: 30, border: '2px solid rgba(244,241,236,0.9)' }} />
    );
  }
  return null;
}

function Chevron({ dir }: { dir: 'up' | 'left' }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${dir === 'up' ? 0 : -90}deg)` }}>
      <path d="M5 15l7-7 7 7" stroke="#f4f1ec" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function elRect(sel: string): Rect | null {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}
function targetRect(target: Target): Rect | null {
  if (target === 'none') return null;
  if (target === 'rightEdge') return { top: window.innerHeight * 0.34, left: window.innerWidth - 22, width: 22, height: window.innerHeight * 0.32 };
  return elRect(target === 'focus' ? '[data-guide="focus"]' : '[data-guide="dock"]');
}

const WT_CSS = `
@keyframes wt-rise { from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)) } to { opacity: 1; transform: translate(-50%, -50%) } }
@keyframes wt-up-k { 0%,100% { transform: translate(-50%, 6px) } 50% { transform: translate(-50%, -8px) } }
@keyframes wt-left-k { 0%,100% { transform: translate(6px, -50%) } 50% { transform: translate(-10px, -50%) } }
@keyframes wt-tap-k { 0%,100% { transform: scale(0.85); opacity: 0.5 } 50% { transform: scale(1.15); opacity: 1 } }
@keyframes wt-line-k {
  0%,100% { background: rgba(244,241,236,0.45); box-shadow: 0 0 0 0 rgba(244,241,236,0.3) }
  50% { background: rgba(244,241,236,1); box-shadow: 0 0 7px 1px rgba(244,241,236,0.3) }
}
.wt-up { animation: wt-up-k 1.5s ease-in-out infinite }
.wt-left { animation: wt-left-k 1.5s ease-in-out infinite }
.wt-tap { animation: wt-tap-k 1.4s ease-in-out infinite }
.wt-lineglow { animation: wt-line-k 1.4s ease-in-out infinite }
`;
