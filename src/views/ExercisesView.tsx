import { useEffect, useRef, useMemo } from 'react';
import { FireIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import ExerciseCard from '../components/ExerciseCard';
import { accentHex } from '../lib/accent';
import type { Exercise, WorkoutLog } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

interface Props {
  exercises: Exercise[];
  logs: WorkoutLog[];
  onAdd: () => void;
  onEdit: (exercise: Exercise) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}

const GROUP_ORDER = ['upper', 'lower', 'push', 'pull', 'legs', 'core'];

export default function ExercisesView({ exercises, logs, onAdd, onEdit, onOpenLibrary, unit, toDisplay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Staggered figures: back | hero | legs — depth cascade
  const PREVIEW_FIGURES = [
    { view: 'posterior' as const, muscles: ['upper-back', 'trapezius'] as never[], isUpper: true,  w: 52, h: 94,  opacity: 0.55 },
    { view: 'anterior' as const,  muscles: ['chest', 'front-deltoids'] as never[], isUpper: true,  w: 66, h: 118, opacity: 1.00 },
    { view: 'anterior' as const,  muscles: ['quadriceps', 'hamstring'] as never[], isUpper: false, w: 52, h: 90,  opacity: 0.60 },
  ];

  // iPod-style scroll depth effect — direct DOM manipulation for 60fps
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

  const orderedGroups = GROUP_ORDER.filter(g => groups[g]);
  const otherGroups = Object.keys(groups).filter(g => !GROUP_ORDER.includes(g)).sort();
  const groupOrder = [...orderedGroups, ...otherGroups];

  const libraryCard = (
    <button
      onClick={onOpenLibrary}
      className="w-full rounded-[20px] overflow-hidden active:opacity-80 transition-opacity"
      style={{ display: 'block', textAlign: 'left', position: 'relative', border: '1px solid #202020', boxShadow: '0 0 15px rgba(0,0,0,0.25)' }}
    >
      <div style={{
        height: 153,
        background: 'linear-gradient(124.9deg, rgb(26,16,16) 12%, rgb(78,34,31) 62%, rgb(150,52,47) 98%, rgb(190,60,53) 120%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Hot glow behind the figures */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 55% 80% at 88% 100%, rgba(255,69,58,0.22) 0%, rgba(255,69,58,0.07) 45%, transparent 70%)',
        }} />

        {/* Top-left: label stack */}
        <div style={{ position: 'absolute', top: 16, left: 18 }}>
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f4f1ec', lineHeight: 1 }}>
            Exercise Library
          </p>
          <p style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)', marginTop: 5, lineHeight: 1 }}>
            Form guides & muscle maps
          </p>
        </div>

        {/* Top-right: arrow */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', top: 16, right: 16 }}>
          <path d="M9 5l7 7-7 7" stroke="rgba(255,255,255,0.22)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        {/* Bottom-left: count */}
        <div style={{ position: 'absolute', bottom: 16, left: 18 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 44, fontWeight: 700, color: 'rgba(244,241,236,0.92)', lineHeight: 1, letterSpacing: '-0.04em', display: 'block' }}>63</span>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: '-0.04em', color: 'rgba(244,241,236,0.92)', marginTop: 1, display: 'block' }}>exercises</span>
        </div>

        {/* Right: staggered muscle figures — back | hero | front */}
        {/* No overflow:hidden on individual figures — card clips; lets shoulders/deltoids breathe */}
        <div style={{ position: 'absolute', bottom: 0, right: 6, display: 'flex', alignItems: 'flex-end', gap: 0 }}>
          {PREVIEW_FIGURES.map((fig, i) => (
            <div key={i} style={{ position: 'relative', width: fig.w, height: fig.h, flexShrink: 0, opacity: fig.opacity }}>
              <div style={{
                position: 'absolute',
                [fig.isUpper ? 'top' : 'bottom']: -6,
                left: '50%', transform: 'translateX(-50%)',
                width: '120%',
              }}>
                <Model
                  type={fig.view}
                  data={[{ name: 'p', muscles: fig.muscles }]}
                  bodyColor="#181818"
                  highlightedColors={[accentHex()]}
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
            <FireIcon className="w-7 h-7 text-apple-label-tertiary" />
          </div>
          <p className="text-white font-semibold text-[16px] mb-1.5 tracking-tight">No exercises yet</p>
          <p className="text-apple-label-tertiary text-[13px] leading-relaxed" style={{ maxWidth: 220 }}>
            Browse the library to find exercises, or add your own.
          </p>
        </div>
        <button
          onClick={onAdd}
          className="te-label active:opacity-60 transition-opacity py-1 text-center w-full"
        >
          or add manually
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-5">

      {/* Library card */}
      {libraryCard}

      {groupOrder.map(group => {
        const groupExercises = groups[group];
        return (
          <div key={group}>
            <div className="flex items-center gap-2 mb-3 pb-2.5" style={{ borderBottom: '1px solid #202020' }}>
              <span className="te-label" style={{ color: 'rgba(244,241,236,0.35)' }}>{group}</span>
              <span className="ml-auto te-label">{groupExercises.length}</span>
            </div>
            <div className="space-y-1.5">
              {groupExercises.map(ex => (
                <div
                  key={ex.id}
                  data-card
                  className="rounded-[20px] overflow-hidden"
                  style={{ background: '#141414', border: '1px solid #202020', boxShadow: '0 0 7.5px rgba(0,0,0,0.25)', transformOrigin: 'center center', willChange: 'transform, opacity' }}
                >
                  <ExerciseCard
                    exercise={ex}
                    lastLog={getLastLog(ex.id)}
                    onEdit={() => onEdit(ex)}
                    unit={unit}
                    toDisplay={toDisplay}
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
