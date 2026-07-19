import { useEffect, useRef, useMemo } from 'react';
import { FireIcon } from '@heroicons/react/24/outline';
import ExerciseCard from '../components/ExerciseCard';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import type { Exercise, WorkoutLog } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

// First frame of an exercise's animation (a .jpg poster beside the .gif) —
// the same asset the library detail view shows before its clip plays.
const ANIM_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';
function posterUrl(gifUrl: string): string {
  return `${ANIM_BASE}/${gifUrl.replace('videos/', 'images/').replace('.gif', '.jpg')}`;
}
// A few movements with clearly readable silhouettes to preview on the library
// card. Fixed rather than random so the card doesn't flicker between renders.
const CARD_PREVIEW_GIFS = [
  'videos/0032-ila4NZS.gif', // deadlift
  'videos/0652-lBDjFxJ.gif', // pull-up
  'videos/0662-I4hDWkc.gif', // push-up
];

interface Props {
  exercises: Exercise[];
  logs: WorkoutLog[];
  onEdit: (exercise: Exercise) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}

const GROUP_ORDER = ['upper', 'lower', 'push', 'pull', 'legs', 'core'];

export default function ExercisesView({ exercises, logs, onEdit, onOpenLibrary, unit, toDisplay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollEl: HTMLElement | null = container.parentElement;
    while (scrollEl) {
      const oy = window.getComputedStyle(scrollEl).overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;

    const update = () => {
      const sRect = scrollEl!.getBoundingClientRect();
      const centerY = sRect.top + sRect.height * 0.44;
      const halfH = sRect.height * 0.52;
      const scrollFactor = Math.min(scrollEl!.scrollTop / 80, 1);

      container.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
        const r = card.getBoundingClientRect();
        const cardMid = r.top + r.height / 2;
        const raw = cardMid - centerY;
        const dist = raw < 0 ? Math.abs(raw) * scrollFactor : raw;
        const norm = Math.min(dist / halfH, 1);
        const ease = norm * norm;
        card.style.transform = `scale(${(1 - ease * 0.09).toFixed(4)})`;
        card.style.opacity = (1 - ease * 0.58).toFixed(4);
      });
    };

    scrollEl.addEventListener('scroll', update, { passive: true });
    const raf = requestAnimationFrame(update);
    return () => { scrollEl!.removeEventListener('scroll', update); cancelAnimationFrame(raf); };
  }, [exercises]);

  const sortedExercises = useMemo(() => exercises.slice().sort((a, b) => a.name.localeCompare(b.name)), [exercises]);

  const groups = useMemo(() => sortedExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const g = ex.muscle_group;
    if (!acc[g]) acc[g] = [];
    acc[g].push(ex);
    return acc;
  }, {}), [sortedExercises]);

  function getLastLog(exerciseId: string): WorkoutLog | undefined {
    return logs.find(l => l.exercise_id === exerciseId);
  }

  // Month-over-month strength trend per exercise: best est. 1RM (Epley) in the
  // last 30 days vs the 30 days before. Null until both windows have data.
  const trendById = useMemo(() => {
    const now = Date.now();
    const d30 = now - 30 * 86400000;
    const d60 = now - 60 * 86400000;
    const cur = new Map<string, number>();
    const prev = new Map<string, number>();
    for (const l of logs) {
      if (l.set_type === 'warmup' || l.weight <= 0) continue;
      const t = new Date(l.created_at).getTime();
      if (t < d60) continue;
      const est = l.weight * (1 + l.reps_done / 30);
      const bucket = t >= d30 ? cur : prev;
      if (est > (bucket.get(l.exercise_id) ?? 0)) bucket.set(l.exercise_id, est);
    }
    const out = new Map<string, number | null>();
    for (const ex of exercises) {
      const c = cur.get(ex.id) ?? 0;
      const p = prev.get(ex.id) ?? 0;
      out.set(ex.id, c > 0 && p > 0 ? ((c - p) / p) * 100 : null);
    }
    return out;
  }, [logs, exercises]);

  const orderedGroups = GROUP_ORDER.filter(g => groups[g]);
  const otherGroups = Object.keys(groups).filter(g => !GROUP_ORDER.includes(g)).sort();
  const groupOrder = [...orderedGroups, ...otherGroups];

  const libraryCard = (
    <button
      onClick={onOpenLibrary}
      className="w-full rounded-te-md overflow-hidden active:opacity-80 transition-opacity"
      style={{ display: 'block', textAlign: 'left', position: 'relative', border: '1px solid var(--te-border)', boxShadow: '0 0 15px rgba(0,0,0,0.25)' }}
    >
      {/* The card's wash is mixed from --te-accent rather than a baked-in red,
          so it follows the user's accent along with the muscle figures. */}
      <div style={{
        height: 164,
        background: `linear-gradient(124.9deg,
          color-mix(in srgb, var(--te-accent) 6%, var(--te-surface-1)) 8%,
          color-mix(in srgb, var(--te-accent) 16%, var(--te-surface-1)) 52%,
          color-mix(in srgb, var(--te-accent) 32%, var(--te-surface-1)) 92%,
          color-mix(in srgb, var(--te-accent) 20%, var(--te-surface-1)) 120%)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 62% 88% at 78% 60%,
            color-mix(in srgb, var(--te-accent) 26%, transparent) 0%,
            color-mix(in srgb, var(--te-accent) 9%, transparent) 45%,
            transparent 72%)`,
        }} />

        <div style={{ position: 'absolute', top: 20, left: 20 }}>
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 21, fontWeight: 600, letterSpacing: '-0.3px', textTransform: 'uppercase', color: 'var(--te-accent)', lineHeight: 1 }}>
            Exercise Library
          </p>
          {/* The app's tertiary text grey — the same step used for captions
              and meta everywhere else, so the subtitle sits back from the
              title without inventing a one-off colour. */}
          <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 500, letterSpacing: '-0.1px', color: 'var(--te-text-3)', marginTop: 9, lineHeight: 1 }}>
            Form guides, muscle maps
          </p>
        </div>

        <div style={{ position: 'absolute', bottom: 20, left: 20 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 40, fontWeight: 600, color: 'var(--te-text-1)', lineHeight: 1, letterSpacing: '-2.2px', display: 'block' }}>{EXERCISE_LIBRARY.length}</span>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 15, fontWeight: 600, letterSpacing: '-0.5px', textTransform: 'uppercase', color: 'var(--te-text-1)', marginTop: 9, display: 'block', lineHeight: 1 }}>exercises</span>
        </div>

        {/* Exercise-animation first frames, fanned like a small stack of
            cards. The posters have a light background, so each sits in its own
            rounded tile with a hairline — reads as physical thumbnails on the
            dark wash rather than floating cut-outs. */}
        <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', alignItems: 'flex-end' }}>
          {CARD_PREVIEW_GIFS.map((gif, i) => {
            const last = i === CARD_PREVIEW_GIFS.length - 1;
            const size = last ? 88 : 76;
            return (
              <div
                key={gif}
                style={{
                  width: size, height: size,
                  marginLeft: i === 0 ? 0 : -size * 0.46,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
                  background: '#f5f2ee',
                  transform: `rotate(${(i - 1) * 5}deg)`,
                  opacity: last ? 1 : 0.9,
                  zIndex: i,
                }}
              >
                <img
                  src={posterUrl(gif)}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </button>
  );

  if (groupOrder.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {libraryCard}
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-14 h-14 rounded-full te-panel flex items-center justify-center mb-4">
            <FireIcon className="w-7 h-7 te-t4" />
          </div>
          <p className="te-t1 font-semibold text-[17px] mb-1.5 tracking-tight">Your exercises will appear here</p>
          <p className="te-t4 text-[13px] leading-relaxed" style={{ maxWidth: 220 }}>
            Browse the library to find exercises, or add your own.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-5">

      {libraryCard}

      {groupOrder.map(group => {
        const groupExercises = groups[group];
        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-3 pb-2.5" style={{ borderBottom: '1px solid var(--te-surface-3)' }}>
              <span className="te-label" style={{ color: 'var(--te-text-4)' }}>{group}</span>
              <span className="ml-auto te-label">{groupExercises.length}</span>
            </div>
            <div className="space-y-1.5">
              {groupExercises.map(ex => (
                <div
                  key={ex.id}
                  data-card
                  className="rounded-te-md overflow-hidden"
                  style={{ background: 'var(--te-card)', border: '1px solid var(--te-border)', boxShadow: '0 0 7.5px rgba(0,0,0,0.25)', transformOrigin: 'center center', willChange: 'transform, opacity' }}
                >
                  <ExerciseCard
                    exercise={ex}
                    lastLog={getLastLog(ex.id)}
                    onEdit={() => onEdit(ex)}
                    unit={unit}
                    toDisplay={toDisplay}
                    trendPct={trendById.get(ex.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

    </div>
  );
}
