import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import type { Muscle } from '@phelian/react-body-highlighter';
import FullPageSheet from './FullPageSheet';
import Modal from './Modal';
import SearchField from './SearchField';
import { accentHex, accentAlpha } from '../lib/accent';
import {
  EXERCISE_LIBRARY,
  EQUIPMENT_LABELS,
  type LibraryExercise,
  type EquipmentType,
} from '../data/exerciseLibrary';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: LibraryExercise) => void;
  /** The "+" on a card: adds the exercise straight to the user's list with
      sensible defaults, without opening the editor or closing the library, so
      several can be added in one pass. onSelect stays the "customise first"
      path from the detail popup. Optional — when absent (read-only detail
      viewer) the "+" falls back to onSelect. */
  onQuickAdd?: (exercise: LibraryExercise) => void;
  existingNames: Set<string>;
  initialSelected?: LibraryExercise;
}

// ── Tokens ────────────────────────────────────────────────────
const ACCENT     = '#f4f1ec';
const ACCENT_DIM = 'var(--te-text-4)';

// Surfaces
const CARD_BG    = 'var(--te-surface-3)';
const HAIRLINE   = 'var(--te-border-strong)';   // matches the app's border tokens
const MINI_BG    = 'var(--te-surface-1)';   // muscle-filter previews sit darker than the fields

const POSTERIOR = new Set<string>([
  'upper-back','lower-back','back-deltoids','trapezius',
  'hamstring','gluteal','calves','left-soleus','right-soleus',
]);
function bestView(m: Muscle[]): 'anterior' | 'posterior' {
  const p = m.filter(x => POSTERIOR.has(x)).length;
  return p > m.length - p ? 'posterior' : 'anterior';
}

// ── Muscle group categories & order ──────────────────────────
const MUSCLE_CATEGORY: Record<string, string> = {
  'chest':'Chest','front-deltoids':'Shoulders','back-deltoids':'Shoulders',
  'trapezius':'Shoulders','upper-back':'Back','lower-back':'Back',
  'biceps':'Biceps','triceps':'Triceps','forearm':'Forearms',
  'abs':'Core','obliques':'Core',
  'quadriceps':'Quads','hamstring':'Hamstrings & Glutes','gluteal':'Hamstrings & Glutes',
  'calves':'Calves','left-soleus':'Calves','right-soleus':'Calves',
};
function getCategory(ex: LibraryExercise) { return MUSCLE_CATEGORY[ex.primaryMuscles[0]] ?? 'Other'; }

// Muscle-filter cards shown under the search bar. Each highlights the
// worked muscles on a small body model; tapping filters the library.
const MUSCLE_FILTERS: { cat: string; view: 'anterior' | 'posterior'; isUpper: boolean; muscles: Muscle[] }[] = [
  { cat: 'Chest',               view: 'anterior',  isUpper: true,  muscles: ['chest'] },
  { cat: 'Back',                view: 'posterior', isUpper: true,  muscles: ['upper-back', 'lower-back'] },
  { cat: 'Shoulders',           view: 'anterior',  isUpper: true,  muscles: ['front-deltoids', 'trapezius'] },
  { cat: 'Biceps',              view: 'anterior',  isUpper: true,  muscles: ['biceps'] },
  { cat: 'Triceps',             view: 'posterior', isUpper: true,  muscles: ['triceps'] },
  { cat: 'Core',                view: 'anterior',  isUpper: true,  muscles: ['abs', 'obliques'] },
  { cat: 'Quads',               view: 'anterior',  isUpper: false, muscles: ['quadriceps'] },
  { cat: 'Hamstrings & Glutes', view: 'posterior', isUpper: false, muscles: ['hamstring', 'gluteal'] },
  { cat: 'Calves',              view: 'posterior', isUpper: false, muscles: ['calves'] },
  { cat: 'Forearms',            view: 'anterior',  isUpper: true,  muscles: ['forearm'] },
];

// ── Equipment icons ───────────────────────────────────────────
function EquipIcon({ type, size = 13, color = 'var(--te-text-4)' }: { type: EquipmentType; size?: number; color?: string }) {
  const p: React.SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: '0 0 24 24', fill: color };
  switch (type) {
    case 'barbell': return <svg {...p}><rect x="1.5" y="9.5" width="2.5" height="5" rx="1"/><rect x="4.8" y="7.5" width="2.6" height="9" rx="1.1"/><rect x="16.6" y="7.5" width="2.6" height="9" rx="1.1"/><rect x="20" y="9.5" width="2.5" height="5" rx="1"/><rect x="7" y="10.9" width="10" height="2.2" rx="1.1"/></svg>;
    case 'dumbbell': return <svg {...p}><rect x="1.5" y="7.5" width="3" height="9" rx="1.2"/><rect x="5" y="9" width="2.6" height="6" rx="1"/><rect x="7.4" y="10.8" width="9.2" height="2.4" rx="1.2"/><rect x="16.4" y="9" width="2.6" height="6" rx="1"/><rect x="19.5" y="7.5" width="3" height="9" rx="1.2"/></svg>;
    case 'cable': return <svg {...p}><circle cx="12" cy="4.8" r="3"/><rect x="10.8" y="7.4" width="2.4" height="8" rx="1.2"/><path d="M8 14.5h8l-4 5z"/></svg>;
    case 'machine': return <svg {...p}><rect x="2.5" y="3" width="4" height="18" rx="1.6"/><rect x="17.5" y="3" width="4" height="18" rx="1.6"/><rect x="6" y="10.8" width="12" height="2.4" rx="1.2"/></svg>;
    case 'bodyweight': return <svg {...p}><circle cx="12" cy="4.5" r="2.6"/><path d="M6.5 10.2c1.7-1 3.6-1.5 5.5-1.5s3.8.5 5.5 1.5l-1 1.8c-1.4-.8-2.9-1.2-4.5-1.2s-3.1.4-4.5 1.2z"/><path d="M9.3 13.8l2.7 5.7 2.7-5.7c-.85.4-1.75.6-2.7.6s-1.85-.2-2.7-.6z"/></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="5.5"/></svg>;
  }
}

// ── Tiny icons ────────────────────────────────────────────────
const SvgCheck = ({ c }: { c: string }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 6" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const SvgX     = ({ c }: { c: string }) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></svg>;
const SvgPlus  = ({ c }: { c: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.2" strokeLinecap="round"/></svg>;
const SvgBookmark = ({ c }: { c: string }) => <svg width="20" height="20" viewBox="0 0 24 24" fill={c}><path d="M6 3.5h12a1 1 0 0 1 1 1V20a.75.75 0 0 1-1.18.61L12 16.9l-5.82 3.71A.75.75 0 0 1 5 20V4.5a1 1 0 0 1 1-1z"/></svg>;

// ── Exercise animation — autoplays, no controls ───────────────
const ANIM_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';

// The animation's first frame — a still shipped alongside each clip. Used as
// the poster under the playing gif, and as the card art in the library grid.
function posterFor(gifUrl: string): string {
  return `${ANIM_BASE}/${gifUrl.replace('videos/', 'images/').replace('.gif', '.jpg')}`;
}

function ExerciseAnimation({ gifUrl, inline }: { gifUrl: string; inline?: boolean }) {
  const posterUrl = posterFor(gifUrl);
  const animUrl   = `${ANIM_BASE}/${gifUrl}`;

  const wrapper: React.CSSProperties = inline
    ? { position: 'relative', height: 180, background: '#f5f2ee', borderBottom: '1px solid var(--te-border)' }
    : { margin: '0 16px 10px', borderRadius: 'var(--te-radius-md)', overflow: 'hidden', border: `1px solid ${HAIRLINE}`, background: '#f5f2ee', position: 'relative', height: 180 };

  return (
    <div style={wrapper}>
      {/* Poster underlay avoids a flash before the gif decodes */}
      <img src={posterUrl} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <img src={animUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}

// ── Muscle-filter mini card ───────────────────────────────────
const MiniMuscleCard = React.memo(function MiniMuscleCard({ filter, active, onToggle }: {
  filter: typeof MUSCLE_FILTERS[number]; active: boolean; onToggle: () => void;
}) {
  const data = useMemo(() => [{ name: 'p', muscles: filter.muscles }], [filter.muscles]);
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      title={filter.cat}
      className="active:opacity-70 transition-all"
      style={{
        flexShrink: 0, width: 56, height: 65, borderRadius: 'var(--te-radius-md)',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        background: active ? 'var(--te-border)' : MINI_BG,
        border: `1px solid ${active ? 'var(--te-text-1)' : HAIRLINE}`,
        boxShadow: active ? '0 0 0 1px var(--te-text-1)' : 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        // Lower-body figures sit higher so the target muscles stay in frame.
        [filter.isUpper ? 'top' : 'bottom']: filter.isUpper ? -6 : -28,
        left: '50%', transform: 'translateX(-50%)', width: '112%',
      }}>
        <Model
          type={filter.view}
          data={data}
          bodyColor={active ? '#333333' : '#2b2b2b'}
          highlightedColors={[accentHex()]}
          style={{ width: '100%' }}
        />
      </div>
    </button>
  );
});

// ── Exercise card (Figma "Card") ──────────────────────────────
const CarouselCard = React.memo(function CarouselCard({ exercise, onTap, onToggleAdd, added }: {
  exercise: LibraryExercise; onTap: () => void; onToggleAdd: () => void; added: boolean;
}) {
  const isUpper = exercise.muscleGroup === 'upper';
  const view = bestView(exercise.primaryMuscles);
  const mapData = useMemo(() => [{ name: 'p', muscles: exercise.primaryMuscles }], [exercise.primaryMuscles]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
      className="active:opacity-80 transition-opacity"
      style={{
        width: '100%', height: 240,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', background: CARD_BG, border: `1px solid ${HAIRLINE}`,
        borderRadius: 'var(--te-radius-md)', overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
      }}
    >
      {/* Card art: the animation's first frame, so the grid previews the actual
          movement. Exercises without a clip keep the muscle model. */}
      {exercise.gifUrl ? (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '74%', background: '#f5f2ee' }}>
          <img
            src={posterFor(exercise.gifUrl)}
            alt=""
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <div style={{
          position: 'absolute',
          // Lower-body figures sit higher so the target muscles stay in frame.
          [isUpper ? 'top' : 'bottom']: isUpper ? 26 : 14,
          left: '50%', transform: 'translateX(-50%)', width: '58%',
        }}>
          <Model type={view} data={mapData} bodyColor="#343434" highlightedColors={[accentHex()]} style={{ width: '100%' }} />
        </div>
      )}
      {/* Single gradient — solid card fading up from behind the title */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 118, background: 'linear-gradient(to top, var(--te-surface-3) 30%, rgba(20,20,20,0) 100%)' }} />

      {/* Tag */}
      <div style={{ position: 'relative', padding: '11px 46px 0 11px' }}>
        {/* Sits over the card art, which is light — so the pill carries its own
            near-opaque backing rather than the translucent one it used against
            the old dark muscle model. */}
        <span className="te-label" style={{
          display: 'inline-block', maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'rgba(255,255,255,0.88)', fontSize: 10, textTransform: 'capitalize',
          padding: '3px 8px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(10,10,12,0.82)',
        }}>
          {exercise.primaryMuscles[0]?.replace(/-/g, ' ')}
        </span>
      </div>

      {/* Add / check */}
      <button onClick={e => { e.stopPropagation(); onToggleAdd(); }} style={{
        position: 'absolute', top: 12, right: 12,
        width: 30, height: 30, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: added ? ACCENT : 'rgba(10,10,14,0.72)',
        border: `1px solid ${added ? ACCENT : 'var(--te-border-strong)'}`,
      }}>
        {added ? <SvgCheck c="var(--te-surface-1)" /> : <SvgPlus c="rgba(255,255,255,0.8)" />}
      </button>

      {/* Title */}
      <div style={{ position: 'relative', padding: '0 12px 13px' }}>
        <p className="text-[15px] font-semibold te-t1" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {exercise.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <EquipIcon type={exercise.equipment} size={13} />
          <span className="te-label" style={{ color: 'var(--te-text-4)' }}>
            {EQUIPMENT_LABELS[exercise.equipment]}
          </span>
        </div>
      </div>
    </div>
  );
});

// ── Flat A–Z grid of exercise cards ──────────────────────────
function ExerciseGrid({ exercises, onTap, isAdded }: {
  exercises: LibraryExercise[];
  onTap: (ex: LibraryExercise) => void;
  isAdded: (ex: LibraryExercise) => boolean;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
      padding: '0 20px',
    }}>
      {exercises.map(ex => (
        <CarouselCard
          key={ex.id}
          exercise={ex}
          onTap={() => onTap(ex)}
          // The "+" opens the exercise's detail popup rather than adding
          // silently — you preview it, add from there, and land back here.
          onToggleAdd={() => onTap(ex)}
          added={isAdded(ex)}
        />
      ))}
    </div>
  );
}

// ── Category row — horizontal carousel + paging dots ─────────────
// Default browse view: one of these per muscle category. Exactly two cards
// fit the viewport at once (matches the Figma "Browse-exercises-page" Chest/
// Back rows), scroll-snapped so a swipe always settles on a pair.
function CategoryCarousel({ category, exercises, onTap, isAdded, sectionRef }: {
  category: string;
  exercises: LibraryExercise[];
  onTap: (ex: LibraryExercise) => void;
  isAdded: (ex: LibraryExercise) => boolean;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(exercises.length / 2);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div ref={sectionRef}>
      <div className="flex items-baseline gap-2 mb-3 px-5">
        <span className="text-[13px] font-medium te-t3">{category}</span>
        <span className="te-mono text-[11px] te-t4">{exercises.length}</span>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex overflow-x-auto"
        style={{
          gap: 10, scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as never, padding: '0 20px',
        }}
      >
        {exercises.map(ex => (
          <div key={ex.id} style={{ flex: '0 0 calc(50% - 5px)', scrollSnapAlign: 'start', minWidth: 0 }}>
            <CarouselCard
              exercise={ex}
              onTap={() => onTap(ex)}
              onToggleAdd={() => onTap(ex)}
              added={isAdded(ex)}
            />
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span
              key={i}
              className="rounded-full"
              style={{ width: 6, height: 6, background: i === page ? 'var(--te-text-2)' : 'var(--te-border-strong)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail – muscle chip ──────────────────────────────────────
function MuscleChip({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <span className="te-label" style={{
      padding: '4px 9px', borderRadius: 9999, whiteSpace: 'nowrap',
      color: primary ? accentHex() : 'var(--te-text-2)',
      background: primary ? accentAlpha(0.14) : 'var(--te-border)',
      border: `1px solid ${primary ? accentAlpha(0.32) : HAIRLINE}`,
    }}>
      {label.replace(/-/g, ' ')}
    </span>
  );
}

// ── Detail – cue / mistake ────────────────────────────────────
function CueLine({ text, good }: { text: string; good?: boolean }) {
  const col = good ? '#3FCF8E' : '#F2543D';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: col + '1f', border: `1px solid ${col}44` }}>
        {good ? <SvgCheck c={col} /> : <SvgX c={col} />}
      </span>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--te-text-2)' }}>{text}</p>
    </div>
  );
}

// ── Swipeable video + muscle model card ──────────────────────
function SwipeableHeroCard({ selected }: { selected: LibraryExercise }) {
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef(0);
  const hasVideo = !!selected.gifUrl;
  const totalSlides = hasVideo ? 2 : 1;

  useEffect(() => { setSlide(0); }, [selected.id]);

  const mapData = useMemo(() => [
    { name: 'p1', muscles: selected.primaryMuscles },
    { name: 'p2', muscles: selected.primaryMuscles },
    ...(selected.secondaryMuscles.length ? [{ name: 's1', muscles: selected.secondaryMuscles }] : []),
  ], [selected.primaryMuscles, selected.secondaryMuscles]);

  return (
    <div style={{ borderRadius: 'var(--te-radius-md)', overflow: 'hidden', border: `1px solid ${HAIRLINE}` }}>
      <div
        style={{ overflow: 'hidden' }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          const dx = touchStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(dx) > 40)
            setSlide(s => Math.max(0, Math.min(totalSlides - 1, s + (dx > 0 ? 1 : -1))));
        }}
      >
        <div style={{
          display: 'flex',
          transform: `translateX(-${slide * 100}%)`,
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* Slide 0 — form video (autoplays) */}
          {hasVideo && (
            <div style={{ flexShrink: 0, width: '100%' }}>
              <ExerciseAnimation gifUrl={selected.gifUrl!} inline />
            </div>
          )}
          {/* Slide 1 (or 0) — muscle model */}
          <div style={{
            flexShrink: 0, width: '100%',
            background: 'radial-gradient(130% 90% at 50% 0%, var(--te-fill-subtle), transparent 65%), var(--te-surface-1)',
            display: 'flex', height: 180, padding: '10px 12px',
          }}>
            {(['anterior', 'posterior'] as const).map(v => (
              <div key={v} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="te-label" style={{ color: 'var(--te-text-4)' }}>
                  {v === 'anterior' ? 'FRONT' : 'BACK'}
                </span>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Model type={v} data={mapData} bodyColor="#181818" highlightedColors={[accentAlpha(0.28), accentHex()]}
                    style={{ height: '100%', width: 'auto', maxWidth: '90%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar: video ↔ model toggle dots only */}
      {totalSlides > 1 && (
        <div style={{ background: 'var(--te-surface-1)', padding: '9px 14px 11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderTop: '1px solid var(--te-border)' }}>
          {(['Video', 'Muscles'] as const).map((label, i) => (
            <button key={label} onClick={() => setSlide(i)} className="te-label" style={{
              padding: '3px 9px', borderRadius: 9999, border: 'none', cursor: 'pointer',
              color: i === slide ? 'var(--te-surface-1)' : 'rgba(255,255,255,0.4)',
              background: i === slide ? 'var(--te-text-1)' : 'var(--te-border)',
              transition: 'all 0.2s ease',
            }}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ExerciseLibraryModal({ open, onClose, onSelect, onQuickAdd, existingNames, initialSelected }: Props) {
  const [savedOnly, setSavedOnly] = useState(false);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<LibraryExercise | null>(initialSelected ?? null);
  const [addedIds, setAddedIds]   = useState<Set<string>>(new Set());
  // Scroll targets for the muscle-icon "jump to category" row.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (open) {
      setSelected(initialSelected ?? null);
      setSearch('');
      setSavedOnly(false);
      setAddedIds(new Set());
    }
  }, [open]);

  const isAdded = (ex: LibraryExercise) =>
    addedIds.has(ex.id) || existingNames.has(ex.name.toLowerCase());
  // The "+" now creates a real exercise in the user's list. It is one-way:
  // once added, tapping again does nothing (removing could destroy an exercise
  // that already has logs). addedIds gives instant feedback before the parent
  // round-trips and existingNames catches up.
  const quickAdd = (ex: LibraryExercise) => {
    if (isAdded(ex)) return;
    if (!onQuickAdd) { onSelect(ex); return; }
    setAddedIds(s => new Set(s).add(ex.id));
    onQuickAdd(ex);
  };

  // Search or the Saved filter collapse the browse view into one flat, A–Z
  // grid — the per-category carousels below only make sense when browsing
  // everything, per the redesigned "Browse Exercises" page.
  const showGrid = savedOnly || search.trim().length > 0;

  const gridList = useMemo(() => {
    if (!showGrid) return [];
    let list = EXERCISE_LIBRARY;
    if (savedOnly) list = list.filter(e => addedIds.has(e.id) || existingNames.has(e.name.toLowerCase()));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.primaryMuscles.some(m => m.includes(q)) ||
        EQUIPMENT_LABELS[e.equipment].toLowerCase().includes(q)
      );
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [showGrid, savedOnly, search, addedIds, existingNames]);

  // Default browse view: every exercise grouped by muscle category, each
  // rendered as its own horizontally-scrolling carousel row (Figma
  // "Browse-exercises-page" — Chest/Back/... rows with paging dots).
  const byCategory = useMemo(() => {
    if (showGrid) return [];
    const groups = new Map<string, LibraryExercise[]>();
    for (const ex of EXERCISE_LIBRARY) {
      const cat = getCategory(ex);
      const list = groups.get(cat) ?? [];
      list.push(ex);
      groups.set(cat, list);
    }
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const order = [...MUSCLE_FILTERS.map(f => f.cat), 'Other'];
    return order.filter(cat => groups.has(cat)).map(cat => ({ cat, items: groups.get(cat)! }));
  }, [showGrid]);

  // Only offer muscle filters that actually have exercises.
  const availableFilters = useMemo(() => {
    const present = new Set(EXERCISE_LIBRARY.map(getCategory));
    return MUSCLE_FILTERS.filter(f => present.has(f.cat));
  }, []);

  // A muscle icon jumps to that category's row rather than filtering —
  // categories are always visible as rows in the default browse view, so
  // "jump to" reads more naturally than hiding every other row.
  function jumpToCategory(cat: string) {
    setSearch('');
    setSavedOnly(false);
    requestAnimationFrame(() => sectionRefs.current[cat]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function handleClose() { setSelected(null); setSearch(''); onClose(); }

  // ── Detail pop-up (opens over the library list) ──────────────
  const added = selected ? isAdded(selected) : false;
  const closeDetail = () => (initialSelected ? handleClose() : setSelected(null));

  const detailPopup = (
    <Modal open={open && !!selected} onClose={closeDetail} title="" noPadTop noPadBottom>
      {selected && (
        <div className="animate-detail-enter" style={{ paddingTop: 4 }}>

          {/* Hero — autoplaying video ↔ muscle model */}
          <SwipeableHeroCard selected={selected} />

          {/* Title + summary */}
          <div style={{ paddingTop: 16 }}>
            <h1 className="text-[20px] font-bold te-t1" style={{ letterSpacing: '-0.02em', lineHeight: 1.12 }}>{selected.name}</h1>
            {selected.summary && (
              <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--te-text-2)' }}>{selected.summary}</p>
            )}
          </div>

          {/* Overview — equipment · region · muscles worked in one panel */}
          <div className="te-panel rounded-te-md" style={{ marginTop: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1, padding: '12px 14px' }}>
                <p className="te-label mb-1.5">Equipment</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <EquipIcon type={selected.equipment} size={14} color="var(--te-text-1)" />
                  <span className="text-[15px] font-semibold te-t1">{EQUIPMENT_LABELS[selected.equipment]}</span>
                </div>
              </div>
              <div style={{ width: 1, background: HAIRLINE }} />
              <div style={{ flex: 1, padding: '12px 14px' }}>
                <p className="te-label mb-1.5">Region</p>
                <span className="text-[15px] font-semibold te-t1">{selected.muscleGroup === 'upper' ? 'Upper body' : 'Lower body'}</span>
              </div>
            </div>
            <div style={{ height: 1, background: HAIRLINE }} />
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="te-label" style={{ color: ACCENT_DIM, width: 66, flexShrink: 0 }}>Primary</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.primaryMuscles.map(m => <MuscleChip key={m} label={m} primary />)}
                </div>
              </div>
              {selected.secondaryMuscles.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="te-label" style={{ color: ACCENT_DIM, width: 66, flexShrink: 0 }}>Secondary</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selected.secondaryMuscles.map(m => <MuscleChip key={m} label={m} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* How to perform */}
          <div style={{ paddingTop: 22 }}>
            <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>How to perform</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {selected.instructions.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 13, padding: '3px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, 'Helvetica Neue', Arial, sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--te-text-1)', background: 'color-mix(in srgb, var(--te-text-1) 11%, transparent)', border: '1px solid color-mix(in srgb, var(--te-text-1) 27%, transparent)' }}>{i + 1}</span>
                    {i < selected.instructions.length - 1 && <span style={{ flex: 1, width: 1.5, background: 'var(--te-border)', margin: '4px 0' }} />}
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--te-text-2)', paddingBottom: 11 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {selected.cues?.length > 0 && (
            <div style={{ paddingTop: 6 }}>
              <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>Form cues</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.cues.map((c, i) => <CueLine key={i} text={c} good />)}
              </div>
            </div>
          )}

          {selected.mistakes?.length > 0 && (
            <div style={{ paddingTop: 20 }}>
              <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>Common mistakes to avoid</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.mistakes.map((m, i) => <CueLine key={i} text={m} />)}
              </div>
            </div>
          )}

          <div style={{ height: 88 }} />

          {/* Sticky CTA — same button as "Complete workout" / "Log set".
              Standalone: no backing panel behind it, so it floats over the
              scrolled content rather than sitting on its own footer bar. */}
          <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 calc(14px + env(safe-area-inset-bottom, 0px))' }}>
            <button
              onClick={() => { if (!added) { quickAdd(selected); closeDetail(); } }}
              disabled={added}
              className="te-white-btn w-full h-[55px] rounded-te-md flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {added
                ? <><CheckIcon className="w-[15px] h-[15px] text-black stroke-[2.5]" /><span className="text-[15px] font-semibold text-black tracking-[-0.17px]">Added to your exercises</span></>
                : <><SvgPlus c="var(--te-ink)" /><span className="text-[15px] font-semibold text-black tracking-[-0.17px]">Add to my exercises</span></>}
            </button>
          </div>

        </div>
      )}
    </Modal>
  );

  // ── Library list view (detail pops up on top) ────────────────
  return (
    <>
    <FullPageSheet open={open} onClose={handleClose} title="">
      <div style={{ margin: 0, position: 'relative' }}>

        {/* Large page title — matches the tab-level title treatment
            (ExercisesView's own "Exercises" heading), since this is now a
            pushed page rather than a modal with an inline nav-bar title. */}
        <h1
          className="text-[32px] font-bold te-t1 leading-none px-5"
          style={{ letterSpacing: '-0.04em', paddingTop: 4, paddingBottom: 20 }}
        >
          Browse Exercises
        </h1>

        {/* Search — shared pill (see SearchField) */}
        <div style={{ padding: '0 20px 16px' }}>
          <SearchField value={search} onChange={setSearch} placeholder="Search exercises" />
        </div>

        {/* Saved filter + muscle-filter mini cards */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 9, overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as never, padding: '6px 20px 18px' }}
        >
          {/* Saved — a preview without the card box */}
          <button
            onClick={() => setSavedOnly(v => !v)}
            aria-pressed={savedOnly}
            title="Saved exercises"
            className="active:opacity-70 transition-opacity"
            style={{ flexShrink: 0, width: 40, height: 65, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <SvgBookmark c={savedOnly ? 'var(--te-text-1)' : 'var(--te-text-4)'} />
          </button>
          {/* Divider — centred between the bookmark and the previews */}
          <div style={{ flexShrink: 0, width: 1, height: 38, background: 'rgba(255,255,255,0.18)', marginLeft: 2, marginRight: 11 }} />
          {availableFilters.map(f => (
            <MiniMuscleCard
              key={f.cat}
              filter={f}
              active={false}
              onToggle={() => jumpToCategory(f.cat)}
            />
          ))}
        </div>

        {showGrid ? (
          /* Search or Saved active — one flat A–Z grid of matches. */
          gridList.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p className="text-[17px] font-semibold te-t1 mb-2">No exercises found</p>
              <p className="te-label">{savedOnly ? 'Save exercises with the + button.' : 'Try a different search or muscle.'}</p>
            </div>
          ) : (
            <div style={{ paddingBottom: 24 }}>
              <ExerciseGrid
                exercises={gridList}
                onTap={setSelected}
                isAdded={isAdded}
              />
            </div>
          )
        ) : (
          /* Default browse view — one horizontally-scrolling carousel row
             per muscle category. */
          <div style={{ paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
            {byCategory.map(({ cat, items }) => (
              <CategoryCarousel
                key={cat}
                category={cat}
                exercises={items}
                onTap={setSelected}
                isAdded={isAdded}
                sectionRef={el => { sectionRefs.current[cat] = el; }}
              />
            ))}
          </div>
        )}

      </div>
    </FullPageSheet>
    {detailPopup}
    </>
  );
}
