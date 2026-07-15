import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A self-contained coach-mark tour. Everything but the step's target is
// blurred; the target itself is cut out of the blur (a spotlight) so you see
// the real control. The three gesture steps advance by *performing* the
// gesture — tap the focus switch, swipe up on the bar, swipe in from the
// right — not by a button. Finishing lifts the blur with a satisfying fade.

type Interaction = 'button' | 'tap' | 'swipeUp' | 'swipeLeft';
type Target = 'none' | 'focus' | 'dock' | 'rightEdge';

interface Step {
  target: Target;
  interaction: Interaction;
  title: string;
  body?: string;
  caption: 'top' | 'bottom' | 'center';
}

const STEPS: Step[] = [
  { target: 'none',      interaction: 'button',    title: 'Welcome to Overload', body: 'A quick tour.',        caption: 'center' },
  { target: 'dock',      interaction: 'swipeUp',   title: 'Swipe up to add',                                   caption: 'top' },
  { target: 'focus',     interaction: 'tap',       title: 'Focus mode',          body: 'Tap to hide the rest.', caption: 'bottom' },
  { target: 'rightEdge', interaction: 'swipeLeft', title: 'Your profile',        body: 'Swipe in from here.',   caption: 'bottom' },
  { target: 'none',      interaction: 'button',    title: 'Add your first exercise', body: 'That’s all it takes.', caption: 'center' },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function Walkthrough({
  open, onClose, focusMode, onToggleFocus,
}: {
  open: boolean;
  onClose: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
}) {
  const [i, setI] = useState(0);
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const initialFocus = useRef(focusMode);

  useEffect(() => { if (open) { setI(0); setClosing(false); initialFocus.current = focusMode; } }, [open]);

  const step = open ? STEPS[i] : null;

  // Measure the current target so the spotlight lands on the real element.
  useLayoutEffect(() => {
    if (!step) return;
    const measure = () => setRect(targetRect(step.target));
    measure();
    window.addEventListener('resize', measure);
    const id = window.setTimeout(measure, 60); // after any layout settle
    return () => { window.removeEventListener('resize', measure); window.clearTimeout(id); };
  }, [step?.target, i, open]);

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

  function advance() { last ? finish() : setI(i + 1); }
  function finish() {
    if (focusMode !== initialFocus.current) onToggleFocus(); // leave focus as we found it
    setClosing(true);
    window.setTimeout(onClose, 480);
  }

  const hole = s.target !== 'none' ? rect : null;

  return (
    <div
      className="fixed inset-0 z-[70] select-none"
      style={{ opacity: closing ? 0 : 1, transition: 'opacity 0.46s cubic-bezier(0.22,1,0.36,1)' }}
    >
      <style>{WT_CSS}</style>

      {/* Blur/scrim with a spotlight hole cut out of it */}
      <Spotlight hole={hole} />

      {/* Skip — always tappable, above every interaction layer */}
      <button
        onClick={finish}
        className="absolute z-30 text-[13px] font-medium text-white/45 active:text-white/70 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 'max(20px, env(safe-area-inset-right))' }}
      >
        Skip
      </button>

      {/* Gesture hint glyph over the target */}
      {!closing && <HintGlyph interaction={s.interaction} hole={hole} />}

      {/* Interaction layer for gesture steps */}
      {!closing && s.interaction !== 'button' && (
        <GestureCatcher
          interaction={s.interaction}
          hole={hole}
          onDo={() => {
            if (s.target === 'focus') onToggleFocus();
            advance();
          }}
        />
      )}

      {/* Caption */}
      <div
        key={i}
        className="absolute left-1/2 w-full max-w-[330px] px-[26px] z-20"
        style={{ transform: 'translateX(-50%)', animation: 'wt-rise 0.32s cubic-bezier(0.22,1,0.36,1)', ...captionPos(s.caption) }}
      >
        <div className="text-center">
          <h3 className="text-[21px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>{s.title}</h3>
          {s.body && <p className="text-[14px] leading-snug text-white/55 mt-1.5">{s.body}</p>}
        </div>

        <div className="flex items-center justify-center gap-2 mt-5">
          {STEPS.map((_, idx) => (
            <span key={idx} className="rounded-full transition-all"
              style={{ width: idx === i ? 18 : 6, height: 6, background: idx === i ? '#f4f1ec' : 'rgba(255,255,255,0.22)' }} />
          ))}
        </div>

        {s.interaction === 'button' ? (
          <button
            onClick={advance}
            className="w-full h-[50px] rounded-[16px] mt-5 flex items-center justify-center text-[15px] font-semibold text-black active:opacity-80 transition-opacity"
            style={{ background: '#f4f1ec' }}
          >
            {last ? 'Done' : 'Start'}
          </button>
        ) : (
          <p className="text-center text-[12px] font-medium tracking-wide text-white/35 mt-4 uppercase">Try it</p>
        )}
      </div>
    </div>
  );
}

// ── Spotlight (4 blurred panels around the hole) ────────────────────────────
function Spotlight({ hole }: { hole: Rect | null }) {
  const panel: React.CSSProperties = {
    position: 'absolute',
    background: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)',
  };
  if (!hole) return <div style={{ ...panel, inset: 0 }} />;

  const p = 10; // hole padding
  const x = hole.left - p, y = hole.top - p, w = hole.width + p * 2, h = hole.height + p * 2;
  return (
    <>
      <div style={{ ...panel, top: 0, left: 0, right: 0, height: Math.max(0, y) }} />
      <div style={{ ...panel, top: y + h, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...panel, top: y, left: 0, width: Math.max(0, x), height: h }} />
      <div style={{ ...panel, top: y, left: x + w, right: 0, height: h }} />
      {/* Ring around the spotlight */}
      <div
        className="wt-ring-glow"
        style={{ position: 'absolute', top: y, left: x, width: w, height: h, borderRadius: 16, pointerEvents: 'none' }}
      />
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
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (interaction === 'swipeUp' && -dy > 46 && Math.abs(dx) < 60) { fired.current = true; onDo(); }
    if (interaction === 'swipeLeft' && -dx > 46 && Math.abs(dy) < 60) { fired.current = true; onDo(); }
  }
  function up(e: React.PointerEvent) {
    if (fired.current || !start.current) { start.current = null; return; }
    if (interaction === 'tap') {
      const dx = Math.abs(e.clientX - start.current.x);
      const dy = Math.abs(e.clientY - start.current.y);
      if (dx < 12 && dy < 12) onDo();
    }
    start.current = null;
  }

  // For 'tap', constrain the catcher to the hole so only the real control
  // triggers it. For swipes, catch anywhere on screen.
  const style: React.CSSProperties = interaction === 'tap' && hole
    ? { position: 'absolute', top: hole.top - 10, left: hole.left - 10, width: hole.width + 20, height: hole.height + 20, touchAction: 'none' }
    : { position: 'absolute', inset: 0, touchAction: 'none' };

  return <div className="z-10" style={style} onPointerDown={down} onPointerMove={move} onPointerUp={up} />;
}

// ── Hint glyph ──────────────────────────────────────────────────────────────
function HintGlyph({ interaction, hole }: { interaction: Interaction; hole: Rect | null }) {
  if (interaction === 'swipeUp') {
    const bottom = hole ? window.innerHeight - hole.top + 14 : 120;
    return (
      <div className="absolute left-1/2 -translate-x-1/2 wt-up z-10 pointer-events-none" style={{ bottom }}>
        <Chevron dir="up" />
      </div>
    );
  }
  if (interaction === 'swipeLeft') {
    return (
      <div className="absolute top-1/2 -translate-y-1/2 wt-left z-10 pointer-events-none" style={{ right: 30 }}>
        <Chevron dir="left" />
      </div>
    );
  }
  if (interaction === 'tap' && hole) {
    return (
      <div
        className="absolute wt-tap z-10 pointer-events-none rounded-full"
        style={{ top: hole.top + hole.height / 2 - 13, left: hole.left + hole.width / 2 - 13, width: 26, height: 26, border: '2px solid rgba(244,241,236,0.9)' }}
      />
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
function targetRect(target: Target): Rect | null {
  if (target === 'none') return null;
  if (target === 'rightEdge') {
    return { top: window.innerHeight * 0.34, left: window.innerWidth - 22, width: 22, height: window.innerHeight * 0.32 };
  }
  const sel = target === 'focus' ? '[data-guide="focus"]' : '[data-guide="dock"]';
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function captionPos(p: 'top' | 'bottom' | 'center'): React.CSSProperties {
  if (p === 'top') return { top: 'calc(env(safe-area-inset-top, 0px) + 84px)' };
  if (p === 'bottom') return { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 150px)' };
  return { top: '50%', transform: 'translate(-50%, -50%)' };
}

const WT_CSS = `
@keyframes wt-rise { from { opacity: 0; transform: translateX(-50%) translateY(10px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
@keyframes wt-up-k { 0%,100% { transform: translate(-50%, 6px) } 50% { transform: translate(-50%, -8px) } }
@keyframes wt-left-k { 0%,100% { transform: translate(6px, -50%) } 50% { transform: translate(-10px, -50%) } }
@keyframes wt-tap-k { 0%,100% { transform: scale(0.85); opacity: 0.5 } 50% { transform: scale(1.15); opacity: 1 } }
@keyframes wt-ring-k { 0% { box-shadow: 0 0 0 0 rgba(244,241,236,0.4) } 100% { box-shadow: 0 0 0 10px rgba(244,241,236,0) } }
.wt-up { animation: wt-up-k 1.5s ease-in-out infinite }
.wt-left { animation: wt-left-k 1.5s ease-in-out infinite }
.wt-tap { animation: wt-tap-k 1.4s ease-in-out infinite }
.wt-ring-glow { box-shadow: 0 0 0 1.5px rgba(244,241,236,0.55); animation: wt-ring-k 1.8s ease-out infinite }
`;
