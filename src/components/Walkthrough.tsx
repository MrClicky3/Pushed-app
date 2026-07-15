import { useEffect, useState } from 'react';

// A lightweight, self-contained coach-mark tour. It teaches the app's
// non-obvious gestures (swipe-up-to-add, focus mode, edge-swipe to profile)
// without driving the app itself — purely an overlay. Shown once for new
// users and re-openable from Settings.

type Placement = 'top' | 'bottom' | 'center';
type Hint = 'welcome' | 'swipeUp' | 'focus' | 'swipeRight' | 'first';

interface Step {
  hint: Hint;
  title: string;
  body: string;
  caption: Placement;
}

const STEPS: Step[] = [
  {
    hint: 'welcome',
    title: 'Welcome to Overload',
    body: 'A 20-second tour of the gestures that make it fast. You can skip anytime.',
    caption: 'center',
  },
  {
    hint: 'swipeUp',
    title: 'Swipe up to add',
    body: 'Flick up from the bar to add — a log on Log, an exercise on Exercises.',
    caption: 'top',
  },
  {
    hint: 'focus',
    title: 'Focus mode',
    body: 'Tap the switch by the title to hide everything but today’s work.',
    caption: 'bottom',
  },
  {
    hint: 'swipeRight',
    title: 'Your profile',
    body: 'Swipe in from the right edge for your profile and the leaderboard.',
    caption: 'bottom',
  },
  {
    hint: 'first',
    title: 'Add your first exercise',
    body: 'Head to Exercises and add one — that’s all you need to start tracking.',
    caption: 'center',
  },
];

export default function Walkthrough({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));

  return (
    <div className="fixed inset-0 z-[70] select-none" style={{ animation: 'wt-fade 0.25s ease' }}>
      <style>{WT_CSS}</style>

      {/* Scrim */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }} />

      {/* Skip — discreet, top-right */}
      <button
        onClick={onClose}
        className="absolute z-10 text-[13px] font-medium text-white/45 active:text-white/70 transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 'max(20px, env(safe-area-inset-right))' }}
      >
        Skip
      </button>

      {/* Gesture hint layer */}
      <HintLayer hint={step.hint} />

      {/* Caption card */}
      <div
        key={i}
        className="absolute left-1/2 w-full max-w-[340px] px-[26px]"
        style={{
          transform: 'translateX(-50%)',
          animation: 'wt-rise 0.32s cubic-bezier(0.22,1,0.36,1)',
          ...captionPos(step.caption),
        }}
      >
        <div className="text-center">
          <h3 className="text-[21px] font-bold text-[#f4f1ec] tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {step.title}
          </h3>
          <p className="text-[14px] leading-snug text-white/55 mt-2">{step.body}</p>
        </div>

        {/* Dots + Next */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className="rounded-full transition-all"
              style={{
                width: idx === i ? 18 : 6,
                height: 6,
                background: idx === i ? '#f4f1ec' : 'rgba(255,255,255,0.22)',
              }}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full h-[50px] rounded-[16px] mt-5 flex items-center justify-center text-[15px] font-semibold text-black active:opacity-80 transition-opacity"
          style={{ background: '#f4f1ec' }}
        >
          {last ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function captionPos(p: Placement): React.CSSProperties {
  if (p === 'top') return { top: 'calc(env(safe-area-inset-top, 0px) + 84px)' };
  if (p === 'bottom') return { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' };
  return { top: '50%', transform: 'translate(-50%, -50%)' };
}

// ── Gesture hints ──────────────────────────────────────────────────────────
function HintLayer({ hint }: { hint: Hint }) {
  if (hint === 'swipeUp') {
    return (
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 26px)' }}>
        <div className="wt-swipe-up flex flex-col items-center">
          <Chevron dir="up" />
        </div>
        <div className="mt-3 rounded-full" style={{ width: 120, height: 5, background: 'rgba(244,241,236,0.5)' }} />
      </div>
    );
  }
  if (hint === 'focus') {
    return (
      <div
        className="absolute wt-pulse-ring"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 92px)', right: 26, width: 66, height: 40 }}
      />
    );
  }
  if (hint === 'swipeRight') {
    return (
      <div className="absolute top-1/2 -translate-y-1/2 flex items-center wt-swipe-left" style={{ right: 30 }}>
        <Chevron dir="left" />
      </div>
    );
  }
  // welcome / first — a soft centered glow
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 wt-glow"
      style={{ top: 'calc(50% - 190px)', width: 200, height: 200 }}
    />
  );
}

function Chevron({ dir, faint }: { dir: 'up' | 'left'; faint?: boolean }) {
  const rot = dir === 'up' ? 0 : -90;
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${rot}deg)`, opacity: faint ? 0.35 : 0.95 }}>
      <path d="M5 15l7-7 7 7" stroke="#f4f1ec" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const WT_CSS = `
@keyframes wt-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes wt-rise { from { opacity: 0; transform: translateX(-50%) translateY(10px) } to { opacity: 1; transform: translateX(-50%) translateY(0) } }
@keyframes wt-up { 0%,100% { transform: translateY(6px) } 50% { transform: translateY(-8px) } }
@keyframes wt-left { 0%,100% { transform: translateX(6px) } 50% { transform: translateX(-10px) } }
@keyframes wt-ring { 0% { box-shadow: 0 0 0 0 rgba(244,241,236,0.55); opacity: 1 } 100% { box-shadow: 0 0 0 16px rgba(244,241,236,0); opacity: 0.4 } }
@keyframes wt-glow-p { 0%,100% { opacity: 0.5; transform: scale(0.94) } 50% { opacity: 0.9; transform: scale(1.04) } }
.wt-swipe-up { animation: wt-up 1.5s ease-in-out infinite }
.wt-swipe-left { animation: wt-left 1.5s ease-in-out infinite }
.wt-pulse-ring { border-radius: 22px; border: 2px solid rgba(244,241,236,0.85); animation: wt-ring 1.4s ease-out infinite }
.wt-glow { border-radius: 50%; background: radial-gradient(circle, rgba(244,241,236,0.16) 0%, transparent 70%); animation: wt-glow-p 2.4s ease-in-out infinite }
`;
