import { useEffect, useRef, useMemo } from 'react';
import { FireIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import ExerciseCard from '../components/ExerciseCard';
import type { Exercise, Routine, ScheduleDay } from '../types';
import type { WeightUnit } from '../hooks/useSettings';

interface Props {
  exercises: Exercise[];
  routines: Routine[];
  schedule: ScheduleDay[];
  onEdit: (exercise: Exercise) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}

const GROUP_ORDER = ['upper', 'lower', 'push', 'pull', 'legs', 'core'];

export default function ExercisesView({ exercises, routines, schedule, onEdit, onOpenLibrary, unit, toDisplay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Today's scheduled routine's exercises — drives both the accent-bar state
  // and the sort (today's exercises float to the top of each muscle group).
  const todaysExerciseIds = useMemo(() => {
    const dow = (new Date().getDay() + 6) % 7; // Mon=0…Sun=6, matches lib/streak.ts
    const entry = schedule.find(s => s.day_of_week === dow);
    const routine = entry?.routine_id ? routines.find(r => r.id === entry.routine_id) : null;
    return new Set(routine?.exercise_ids ?? []);
  }, [schedule, routines]);

  // Sized down and shifted right (from the original flat-grid card's
  // left:135) to clear room for the wider two-line "Browse Exercises" title —
  // the old uppercase-mono "EXERCISE LIBRARY" text was narrow enough to not
  // need the room, but mixed-case bold sans at a readable size does.
  const PREVIEW_FIGURES = [
    { view: 'posterior' as const, muscles: ['upper-back', 'trapezius'] as never[], isUpper: true,  w: 41, h: 75 },
    { view: 'anterior' as const,  muscles: ['chest', 'front-deltoids'] as never[], isUpper: true,  w: 48, h: 85 },
    { view: 'anterior' as const,  muscles: ['quadriceps', 'hamstring'] as never[], isUpper: false, w: 41, h: 75 },
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

  // Today's-schedule exercises sort first (alphabetically among themselves),
  // then everything else (also alphabetical) — within each muscle group.
  const sortedExercises = useMemo(() => exercises.slice().sort((a, b) => {
    const aToday = todaysExerciseIds.has(a.id) ? 0 : 1;
    const bToday = todaysExerciseIds.has(b.id) ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    return a.name.localeCompare(b.name);
  }), [exercises, todaysExerciseIds]);

  const groups = useMemo(() => sortedExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const g = ex.muscle_group;
    if (!acc[g]) acc[g] = [];
    acc[g].push(ex);
    return acc;
  }, {}), [sortedExercises]);

  const orderedGroups = GROUP_ORDER.filter(g => groups[g]);
  const otherGroups = Object.keys(groups).filter(g => !GROUP_ORDER.includes(g)).sort();
  const groupOrder = [...orderedGroups, ...otherGroups];

  const libraryCard = (
    <button
      onClick={onOpenLibrary}
      className="w-full overflow-hidden active:opacity-80 transition-opacity"
      // The border-matching issue wasn't the border color (it was already
      // identical to exercise cards) — it's that this card's fill was pure
      // black (#010101), the same as the page background behind it. Regular
      // cards sit on var(--te-card) (#101010), one step lighter than the
      // page, so their edge gets a free tonal step in addition to the
      // border; this card had none, so the same border stroke had nothing
      // to contrast against and read as invisible. Matching the fill to
      // var(--te-card) fixes that at the root instead of compensating with
      // a stronger border.
      style={{ display: 'block', textAlign: 'left', position: 'relative', background: 'var(--te-card)', border: '1px solid var(--te-border)', borderRadius: 35, boxShadow: '0 0 15px rgba(0,0,0,0.25)' }}
    >
      <div style={{ height: 112, position: 'relative', overflow: 'hidden' }}>
        {/* Affordance chevron — a thin doorway marker, top-right per the design. */}
        <ChevronRightIcon
          className="w-[10px] h-[16px]"
          style={{ position: 'absolute', top: 20, right: 20, color: '#ffffff', opacity: 0.5 }}
        />

        {/* Browse Exercises — bold sans, two lines, mixed case. */}
        <p style={{
          position: 'absolute', top: 20, left: 20, maxWidth: 140,
          fontSize: 26, fontWeight: 700,
          letterSpacing: '-0.02em', lineHeight: '28px',
          color: '#ffffff',
        }}>
          Browse<br />Exercises
        </p>

        {/* Three muscle figures, centre-right, tallest in the middle — grey
            bodies with white-highlighted muscles, matching the design. */}
        <div style={{ position: 'absolute', bottom: 0, left: 157, right: 30, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 7 }}>
          {PREVIEW_FIGURES.map((fig, i) => (
            <div key={i} style={{ position: 'relative', width: fig.w, height: fig.h, flexShrink: 0 }}>
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
            Browse Exercises to find what you need, or add your own.
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
            <div className="flex items-baseline gap-2 mb-3 px-0.5">
              <span className="text-[13px] font-medium te-t1" style={{ textTransform: 'capitalize' }}>{group}</span>
              <span className="te-mono text-[11px] te-t4">{groupExercises.length}</span>
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
                    inTodaysSchedule={todaysExerciseIds.has(ex.id)}
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
