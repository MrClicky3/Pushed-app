// Muted, satisfying UI feedback — soft synthesized Web Audio tones paired with
// haptics. Everything is generated on the fly (no audio assets / network), so it
// works under the app's strict Content-Security-Policy.

const SOUND_KEY = 'settings_sound';
const HAPTICS_KEY = 'settings_haptics';

let soundOn = (() => {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
})();
let hapticsOn = (() => {
  try { return localStorage.getItem(HAPTICS_KEY) !== 'off'; } catch { return true; }
})();

export function setSoundEnabled(on: boolean) {
  soundOn = on;
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  if (on) getCtx(); // warm up the audio graph so the next sound is instant
}
export function isSoundEnabled() {
  return soundOn;
}

export function setHapticsEnabled(on: boolean) {
  hapticsOn = on;
  try { localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}
export function isHapticsEnabled() {
  return hapticsOn;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5; // keep the whole app soft/muted
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });
  return ctx;
}

// Browsers only allow audio to start after a user gesture — prime the context
// on the very first interaction so the first tap already has sound.
if (typeof window !== 'undefined') {
  const prime = () => { getCtx(); };
  window.addEventListener('pointerdown', prime, { once: true, capture: true });
  window.addEventListener('touchstart', prime, { once: true, capture: true });
  window.addEventListener('keydown', prime, { once: true, capture: true });
}

interface Note {
  freq: number;
  dur?: number;          // seconds
  delay?: number;        // seconds from now
  type?: OscillatorType;
  gain?: number;         // peak gain — keep soft (0.02–0.09)
  sweepTo?: number;      // glide the pitch across the note
}

function play(notes: Note[]) {
  if (!soundOn) return;
  const c = getCtx();
  if (!c || !master) return;
  const now = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const start = now + (n.delay ?? 0);
    const dur = n.dur ?? 0.08;
    const peak = n.gain ?? 0.06;
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.sweepTo) osc.frequency.exponentialRampToValueAtTime(n.sweepTo, start + dur);
    // Gentle attack + smooth exponential release → a rounded, muted tone.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }
}

function vibrate(pattern: number | number[]) {
  if (!hapticsOn) return;
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch { /* ignore */ }
}

// Named feedback events — sound and haptic fired together. Deliberately scoped
// to a few meaningful moments (focus toggle, logging, deleting, skipping, and
// the completion milestones) rather than every tap.
export const feedback = {
  // Focus-mode switch
  focus(on: boolean) { vibrate(on ? 12 : 8); play([{ freq: on ? 520 : 600, sweepTo: on ? 720 : 420, dur: 0.09, gain: 0.05, type: 'triangle' }]); },
  // Swipe-up add affordance revealing — a soft rising tick
  reveal() { vibrate(9); play([{ freq: 660, sweepTo: 900, dur: 0.08, gain: 0.04, type: 'triangle' }]); },
  // Logging a set — a soft, satisfying two-note "plink"
  log() {
    vibrate([10, 20, 14]);
    play([
      { freq: 587.33, dur: 0.10, gain: 0.06 },               // D5
      { freq: 880.00, dur: 0.14, gain: 0.05, delay: 0.055 }, // A5
    ]);
  },
  // Deleting a log — muted low downward thud
  deleteLog() { vibrate([20, 40, 20]); play([{ freq: 220, sweepTo: 160, dur: 0.16, gain: 0.05, type: 'triangle' }]); },
  // Skipping an exercise — soft upward swish
  skip() { vibrate(10); play([{ freq: 340, sweepTo: 520, dur: 0.12, gain: 0.035 }]); },
  // The "update weight" prompt appearing — a stronger rising flourish
  weightPrompt() {
    vibrate([15, 40, 15, 40, 25]);
    play([
      { freq: 392.00, dur: 0.12, gain: 0.06 },              // G4
      { freq: 523.25, dur: 0.12, gain: 0.06, delay: 0.08 }, // C5
      { freq: 659.25, dur: 0.20, gain: 0.06, delay: 0.16 }, // E5
    ]);
  },
  // Every set of an exercise done — bright rising triad
  exerciseDone() {
    vibrate([12, 30, 12, 30, 18]);
    play([
      { freq: 523.25, dur: 0.11, gain: 0.055 },
      { freq: 659.25, dur: 0.11, gain: 0.05, delay: 0.07 },
      { freq: 783.99, dur: 0.17, gain: 0.05, delay: 0.14 },
    ]);
  },
  // Whole routine finished — a celebratory four-note flourish
  workoutDone() {
    vibrate([20, 50, 20, 50, 20, 50, 40]);
    play([
      { freq: 523.25, dur: 0.12, gain: 0.06 },
      { freq: 659.25, dur: 0.12, gain: 0.06, delay: 0.09 },
      { freq: 783.99, dur: 0.12, gain: 0.06, delay: 0.18 },
      { freq: 1046.5, dur: 0.28, gain: 0.065, delay: 0.27 },
    ]);
  },
};
