import { useEffect, useRef, useMemo } from 'react';
import { FireIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import ExerciseCard from '../components/ExerciseCard';
import type { Exercise, WorkoutLog } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

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

  const PREVIEW_FIGURES = [
    { view: 'posterior' as const, muscles: ['upper-back', 'trapezius'] as never[], isUpper: true,  w: 44, h: 80 },
    { view: 'anterior' as const,  muscles: ['chest', 'front-deltoids'] as never[], isUpper: true,  w: 52, h: 92 },
    { view: 'anterior' as const,  muscles: ['quadriceps', 'hamstring'] as never[], isUpper: false, w: 44, h: 80 },
  ];

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
      const maxScroll = Math.max(1, scrollEl!.scrollHeight - scrollEl!.clientHeight);
      const scrollFactor = Math.min(scrollEl!.scrollTop / 80, 1);
      // Mirror of the top release: the last cards come to full size as you
      // reach the bottom, so the page needs no tall bottom margin to get there.
      const bottomFactor = Math.min((maxScroll - scrollEl!.scrollTop) / 80, 1);

      container.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
        const r = card.getBoundingClientRect();
        const cardMid = r.top + r.height / 2;
        const raw = cardMid - centerY;
        const dist = raw < 0 ? Math.abs(raw) * scrollFactor : raw * bottomFactor;
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
      className="w-full overflow-hidden active:opacity-80 transition-opacity"
      style={{ display: 'block', textAlign: 'left', position: 'relative', background: '#010101', border: '1px solid #2c2c2c', borderRadius: 20, boxShadow: '0 0 15px rgba(0,0,0,0.25)' }}
    >
      <div style={{ height: 132, position: 'relative', overflow: 'hidden' }}>
        {/* Affordance chevron — a thin doorway marker, top-right per the design. */}
        <ChevronRightIcon
          className="w-[10px] h-[16px]"
          style={{ position: 'absolute', top: 20, right: 20, color: '#ffffff', opacity: 0.5 }}
        />

        {/* EXERCISE LIBRARY — Geist Mono SemiBold, wraps to two lines. */}
        <p style={{
          position: 'absolute', top: 20, left: 20, maxWidth: 190,
          fontFamily: "'Geist Mono', monospace", fontSize: 34, fontWeight: 600,
          letterSpacing: '-0.17px', lineHeight: '32px', textTransform: 'uppercase',
          color: '#ffffff',
        }}>
          Exercise library
        </p>

        {/* Three muscle figures, centre-right, tallest in the middle — grey
            bodies with white-highlighted muscles, matching the design. */}
        <div style={{ position: 'absolute', bottom: 0, left: 186, right: 20, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 0 }}>
          {PREVIEW_FIGURES.map((fig, i) => (
            <div key={i} style={{ position: 'relative', width: fig.w, height: fig.h, flexShrink: 0, marginLeft: -8 }}>
              <div style={{
                position: 'absolute',
                [fig.isUpper ? 'top' : 'bottom']: -6,
                left: '50%', transform: 'translateX(-50%)',
                width: '120%',
              }}>
                <Model
                  type={fig.view}
                  data={[{ name: 'p', muscles: fig.muscles }]}
                  bodyColor="#333333"
                  highlightedColors={['#ffffff']}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          ))}
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
    <div ref={containerRef} className="space-y-5 soft-borders">

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
                  style={{ background: 'var(--te-card)', border: '1px solid var(--te-border)', boxShadow: '0 0 6px rgba(0,0,0,0.15)', transformOrigin: 'center center', willChange: 'transform, opacity' }}
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
