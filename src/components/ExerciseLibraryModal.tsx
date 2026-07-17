import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Model from '@phelian/react-body-highlighter';
import type { Muscle } from '@phelian/react-body-highlighter';
import FullPageSheet from './FullPageSheet';
import HardwareSlider from './HardwareSlider';
import { accentHex, accentAlpha } from '../lib/accent';
import {
  EXERCISE_LIBRARY,
  EQUIPMENT_LABELS,
  type LibraryExercise,
  type MuscleGroup,
  type EquipmentType,
} from '../data/exerciseLibrary';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: LibraryExercise) => void;
  existingNames: Set<string>;
  initialSelected?: LibraryExercise;
}

// ── Tokens (matches app TE system) ───────────────────────────
const ACCENT     = '#f4f1ec';
const ACCENT_DIM = 'rgba(244,241,236,0.28)';

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
const CATEGORY_ORDER = ['Chest','Back','Shoulders','Biceps','Triceps','Core','Quads','Hamstrings & Glutes','Calves','Forearms'];
function getCategory(ex: LibraryExercise) { return MUSCLE_CATEGORY[ex.primaryMuscles[0]] ?? 'Other'; }

// ── Equipment icons ───────────────────────────────────────────
function EquipIcon({ type, size = 13, color = 'rgba(255,255,255,0.38)' }: { type: EquipmentType; size?: number; color?: string }) {
  const p: React.SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' };
  switch (type) {
    case 'barbell': return <svg {...p}><line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round"/><rect x="4" y="9" width="2" height="6" rx="1" fill={color}/><rect x="18" y="9" width="2" height="6" rx="1" fill={color}/><rect x="2" y="10" width="2" height="4" rx="0.8" fill={color}/><rect x="20" y="10" width="2" height="4" rx="0.8" fill={color}/></svg>;
    case 'dumbbell': return <svg {...p}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
    case 'cable': return <svg {...p}><circle cx="12" cy="5.5" r="2.8" stroke={color} strokeWidth="1.8"/><line x1="12" y1="8.3" x2="12" y2="19" stroke={color} strokeWidth="1.8" strokeLinecap="round"/><path d="M9 16.5l3 3 3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case 'machine': return <svg {...p}><rect x="4" y="3" width="3.5" height="18" rx="1.5" stroke={color} strokeWidth="1.8"/><rect x="16.5" y="3" width="3.5" height="18" rx="1.5" stroke={color} strokeWidth="1.8"/><line x1="7.5" y1="12" x2="16.5" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/><line x1="4" y1="8" x2="20" y2="8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/></svg>;
    case 'bodyweight': return <svg {...p}><circle cx="12" cy="5" r="2.3" stroke={color} strokeWidth="1.8"/><path d="M8 10.5h8" stroke={color} strokeWidth="1.8" strokeLinecap="round"/><path d="M12 10.5v6" stroke={color} strokeWidth="1.8" strokeLinecap="round"/><path d="M9.5 16.5l2.5 3.5 2.5-3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.5 13.5l-2 2.5M15.5 13.5l2 2.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="1.8"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" stroke={color} strokeWidth="1.8" strokeLinecap="round"/></svg>;
  }
}

// ── Tiny icons ────────────────────────────────────────────────
const SvgCheck = ({ c }: { c: string }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 6" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const SvgX     = ({ c }: { c: string }) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="2.6" strokeLinecap="round"/></svg>;
const SvgPlus  = ({ c }: { c: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2.2" strokeLinecap="round"/></svg>;
const SvgBack  = ({ c }: { c: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

// ── Exercise animation (hasaneyldrm/exercises-dataset) ────────
const ANIM_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';

function ExerciseAnimation({ gifUrl, inline }: { gifUrl: string; inline?: boolean }) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setPlaying(false); }, [gifUrl]);

  const posterUrl = `${ANIM_BASE}/${gifUrl.replace('videos/', 'images/').replace('.gif', '.jpg')}`;
  const animUrl   = `${ANIM_BASE}/${gifUrl}`;

  const wrapper: React.CSSProperties = inline
    ? { position: 'relative', height: 180, background: '#f5f2ee', borderBottom: '1px solid rgba(255,255,255,0.07)' }
    : { margin: '0 16px 10px', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--te-border)', background: '#f5f2ee', position: 'relative', height: 180 };

  return (
    <div style={wrapper}>
      <img
        key={playing ? 'gif' : 'poster'}
        src={playing ? animUrl : posterUrl}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* Play / pause */}
      <button
        onClick={() => setPlaying(p => !p)}
        style={{
          position: 'absolute', bottom: 8, right: 8,
          width: 30, height: 30, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: playing ? 'rgba(0,0,0,0.5)' : ACCENT,
          border: 'none', cursor: 'pointer',
        }}
      >
        {playing
          ? <svg width="11" height="11" viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16" rx="1" fill="white"/><rect x="15" y="4" width="4" height="16" rx="1" fill="white"/></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24"><path d="M7 4l13 8-13 8V4z" fill="white"/></svg>
        }
      </button>
    </div>
  );
}

// ── Carousel with dot indicator ───────────────────────────────
function CarouselSection({ category, exercises, onTap, isAdded, onToggleAdd }: {
  category: string;
  exercises: LibraryExercise[];
  onTap: (ex: LibraryExercise) => void;
  isAdded: (ex: LibraryExercise) => boolean;
  onToggleAdd: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cardW = 170 + 10;
    setActiveIdx(Math.min(Math.round(el.scrollLeft / cardW), exercises.length - 1));
  }, [exercises.length]);

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '0 20px', marginBottom: 6 }}>
        <p className="text-[17px] font-bold text-[#f4f1ec]" style={{ letterSpacing: '-0.02em' }}>{category}</p>
        <span className="te-label" style={{ color: 'rgba(255,255,255,0.28)' }}>{exercises.length}</span>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex', gap: 10,
          overflowX: 'auto', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as never,
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: 20,
          paddingTop: 2, paddingBottom: 4,
        }}
      >
        {/* Leading spacer — webkit ignores padding-left on overflow flex containers */}
        <div style={{ flexShrink: 0, width: 20 }} />
        {exercises.map(ex => (
          <CarouselCard
            key={ex.id}
            exercise={ex}
            onTap={() => onTap(ex)}
            onToggleAdd={() => onToggleAdd(ex.id)}
            added={isAdded(ex)}
          />
        ))}
        {/* Trailing spacer — webkit ignores padding-right on overflow flex containers */}
        <div style={{ flexShrink: 0, width: 20 }} />
      </div>

      {/* Dot indicators */}
      {exercises.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 6 }}>
          {exercises.map((_, i) => (
            <div key={i} style={{
              height: 3, borderRadius: 99,
              width: i === activeIdx ? 18 : 5,
              background: i === activeIdx ? ACCENT : 'rgba(255,255,255,0.14)',
              transition: 'all 0.25s ease',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carousel card ─────────────────────────────────────────────
const CarouselCard = React.memo(function CarouselCard({ exercise, onTap, onToggleAdd, added }: {
  exercise: LibraryExercise; onTap: () => void; onToggleAdd: () => void; added: boolean;
}) {
  const isUpper = exercise.muscleGroup === 'upper';
  const view = bestView(exercise.primaryMuscles);
  const mapData = useMemo(() => [{ name: 'p', muscles: exercise.primaryMuscles }], [exercise.primaryMuscles]);

  return (
    <button
      onClick={onTap}
      className="active:opacity-75 transition-opacity"
      style={{
        flexShrink: 0, width: 170, display: 'flex', flexDirection: 'column',
        background: '#141414', border: '1px solid var(--te-border)',
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
        scrollSnapAlign: 'start',
      }}
    >
      {/* Muscle model */}
      <div style={{
        position: 'relative', height: 170, overflow: 'hidden',
        background: 'radial-gradient(130% 100% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 60%), #0c0c10',
        borderBottom: '1px solid var(--te-border)',
      }}>
        <div style={{
          position: 'absolute',
          [isUpper ? 'top' : 'bottom']: -4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
        }}>
          <Model type={view} data={mapData} bodyColor="#181818" highlightedColors={[accentHex()]} style={{ width: '100%' }} />
        </div>

        {/* Add / check button */}
        <button onClick={e => { e.stopPropagation(); onToggleAdd(); }} style={{
          position: 'absolute', top: 8, right: 8,
          width: 26, height: 26, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: added ? ACCENT : 'rgba(10,10,14,0.72)',
          border: `1px solid ${added ? ACCENT : 'rgba(255,255,255,0.07)'}`,
        }}>
          {added ? <SvgCheck c="#0a0a0e" /> : <SvgPlus c="rgba(255,255,255,0.75)" />}
        </button>

        {/* Target label */}
        <span className="te-label" style={{
          position: 'absolute', bottom: 7, left: 8,
          color: 'rgba(255,255,255,0.35)', padding: '2px 6px',
          borderRadius: 5, background: 'rgba(8,8,12,0.7)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {exercise.primaryMuscles[0]?.replace(/-/g, ' ')}
        </span>
      </div>

      {/* Meta — strictly below the map, no overlap */}
      <div style={{ padding: '9px 10px 11px', display: 'flex', flexDirection: 'column', gap: 4, background: '#141414' }}>
        <p className="text-[14.5px] font-semibold text-[#f4f1ec]" style={{ letterSpacing: '-0.01em', lineHeight: 1.25 }}>
          {exercise.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <EquipIcon type={exercise.equipment} size={13} />
          <span className="te-label" style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11.5 }}>
            {EQUIPMENT_LABELS[exercise.equipment]}
          </span>
        </div>
      </div>
    </button>
  );
});

// ── Detail – stat tile ────────────────────────────────────────
function StatTile({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="te-panel flex-1 rounded-2xl" style={{ padding: '10px 12px' }}>
      <p className="te-label mb-1.5">{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}99`, flexShrink: 0 }} />}
        <span className="text-[14px] font-semibold text-[#f4f1ec]" style={{ letterSpacing: '-0.01em' }}>{value}</span>
      </div>
    </div>
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
      <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(244,241,236,0.78)' }}>{text}</p>
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
    <div style={{ margin: '0 16px', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--te-border)' }}>
      {/* Swipeable slides */}
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
          {/* Slide 0 — form video */}
          {hasVideo && (
            <div style={{ flexShrink: 0, width: '100%' }}>
              <ExerciseAnimation gifUrl={selected.gifUrl!} inline />
            </div>
          )}
          {/* Slide 1 (or 0) — muscle model */}
          <div style={{
            flexShrink: 0, width: '100%',
            background: 'radial-gradient(130% 90% at 50% 0%, rgba(255,255,255,0.04), transparent 65%), #0f0f14',
            display: 'flex', height: 180, padding: '10px 12px',
          }}>
            {(['anterior', 'posterior'] as const).map(v => (
              <div key={v} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="te-label" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8 }}>
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

      {/* Bottom bar: muscle chip | slide dots | legend */}
      <div style={{ background: '#0f0f14', padding: '8px 14px 11px', display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ flex: 1 }}>
          <span className="te-label" style={{ color: ACCENT, padding: '2px 7px', borderRadius: 5, background: ACCENT + '1f', border: `1px solid ${ACCENT}33` }}>
            {selected.primaryMuscles[0]?.replace(/-/g, ' ')}
          </span>
        </span>
        {totalSlides > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} style={{
                height: 3, width: i === slide ? 18 : 5, borderRadius: 99,
                background: i === slide ? ACCENT : 'rgba(255,255,255,0.22)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }} />
            ))}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT_DIM }} />
          <span className="te-label" style={{ color: 'rgba(255,255,255,0.28)' }}>Sec</span>
          <span style={{ marginLeft: 3, width: 5, height: 5, borderRadius: '50%', background: ACCENT }} />
          <span className="te-label" style={{ color: 'rgba(255,255,255,0.28)' }}>Pri</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function ExerciseLibraryModal({ open, onClose, onSelect, existingNames, initialSelected }: Props) {
  const [filter, setFilter]       = useState<'all' | MuscleGroup>('all');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<LibraryExercise | null>(initialSelected ?? null);
  const [addedIds, setAddedIds]   = useState<Set<string>>(new Set());
  const [focused, setFocused]     = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(initialSelected ?? null);
      setSearch('');
      setFilter('all');
      setAddedIds(new Set());
    }
  }, [open]);

  const toggleAdd = (id: string) =>
    setAddedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isAdded = (ex: LibraryExercise) =>
    addedIds.has(ex.id) || existingNames.has(ex.name.toLowerCase());

  const filtered = useMemo(() => {
    let list = EXERCISE_LIBRARY;
    if (filter !== 'all') list = list.filter(e => e.muscleGroup === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.primaryMuscles.some(m => m.includes(q)) ||
        EQUIPMENT_LABELS[e.equipment].toLowerCase().includes(q)
      );
    }
    return list;
  }, [filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryExercise[]>();
    for (const ex of filtered) {
      const cat = getCategory(ex);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ex);
    }
    return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ category: c, exercises: map.get(c)! }));
  }, [filtered]);

  function handleClose() { setSelected(null); setSearch(''); onClose(); }

  const REGION_FILTERS: { key: 'all' | MuscleGroup; label: string }[] = [
    { key: 'all',   label: 'All' },
    { key: 'upper', label: 'Upper' },
    { key: 'lower', label: 'Lower' },
  ];

  // ── Detail view ──────────────────────────────────────────────
  if (selected) {
    const added = isAdded(selected);

    return (
      <FullPageSheet open={open} onClose={handleClose}>
        <div className="animate-detail-enter" style={{ margin: 0, background: '#161617' }}>

          {/* Sticky back */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#161617', padding: '10px 16px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <button onClick={() => initialSelected ? handleClose() : setSelected(null)} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                <SvgBack c="#fff" />
              </button>
              <span className="te-label" style={{ color: 'rgba(255,255,255,0.38)', letterSpacing: '0.1em' }}>{initialSelected ? 'Close' : 'Library'}</span>
            </div>
          </div>

          {/* Hero card — swipeable: video ↔ muscle model */}
          <SwipeableHeroCard selected={selected} />

          {/* Title + summary */}
          <div style={{ padding: '16px 20px 0' }}>
            <h1 className="text-[24px] font-bold text-[#f4f1ec]" style={{ letterSpacing: '-0.025em', lineHeight: 1.1 }}>{selected.name}</h1>
            {selected.summary && (
              <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'rgba(244,241,236,0.5)' }}>{selected.summary}</p>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 20px 0' }}>
            <StatTile label="Equipment" value={EQUIPMENT_LABELS[selected.equipment]} />
            <StatTile label="Muscle group" value={selected.muscleGroup === 'upper' ? 'Upper' : 'Lower'} />
          </div>

          {/* How to */}
          <div style={{ padding: '20px 20px 0' }}>
            <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>How to perform</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {selected.instructions.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 13, padding: '3px 0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600, color: ACCENT, background: ACCENT + '1c', border: `1px solid ${ACCENT}44` }}>{i + 1}</span>
                    {i < selected.instructions.length - 1 && <span style={{ flex: 1, width: 1.5, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />}
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(244,241,236,0.78)', paddingBottom: 11 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {selected.cues?.length > 0 && (
            <div style={{ padding: '20px 20px 0' }}>
              <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>Form cues</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.cues.map((c, i) => <CueLine key={i} text={c} good />)}
              </div>
            </div>
          )}

          {selected.mistakes?.length > 0 && (
            <div style={{ padding: '20px 20px 0' }}>
              <p className="te-label mb-3.5" style={{ letterSpacing: '0.12em' }}>Common mistakes</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.mistakes.map((m, i) => <CueLine key={i} text={m} />)}
              </div>
            </div>
          )}

          {/* Bottom padding so content clears the sticky CTA */}
          <div style={{ height: 90 }} />

          {/* Sticky CTA */}
          <div style={{ position: 'sticky', bottom: 0, padding: '12px 20px calc(16px + env(safe-area-inset-bottom, 0px))', background: '#161617' }}>
            <button
              onClick={() => { if (!added) { onSelect(selected); toggleAdd(selected.id); handleClose(); } }}
              disabled={added}
              style={{
                width: '100%', height: 50, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                background: added ? '#163320' : ACCENT,
                color: added ? '#30d158' : '#0a0a0e',
                border: `1.5px solid ${added ? 'rgba(48,209,88,0.3)' : 'transparent'}`,
                cursor: added ? 'default' : 'pointer',
                boxShadow: added ? 'none' : `0 2px 12px ${ACCENT}55`,
              }}
            >
              {added ? <SvgCheck c="#30d158" /> : <SvgPlus c="#0a0a0e" />}
              {added ? 'Added to your exercises' : 'Add to my exercises'}
            </button>
          </div>

        </div>
      </FullPageSheet>
    );
  }

  // ── Library list view ────────────────────────────────────────
  return (
    <FullPageSheet open={open} onClose={handleClose}>
      <div style={{ margin: 0, position: 'relative' }}>

        {/* Back */}
        <div style={{ padding: '4px 20px 8px' }}>
          <button onClick={handleClose} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
            <SvgBack c="#fff" />
          </button>
        </div>

        {/* Header */}
        <div style={{ padding: '2px 20px 14px' }}>
          <span className="te-label" style={{ color: ACCENT, letterSpacing: '0.14em' }}>
            {String(filtered.length).padStart(2, '0')} Exercises
          </span>
          <h1 className="text-[26px] font-bold text-[#f4f1ec] mt-1 whitespace-nowrap" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
            Exercise Library
          </h1>
        </div>

        {/* Search */}
        <div style={{ padding: '0 20px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', height: 42, background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: `1px solid ${focused ? ACCENT + '77' : 'var(--te-border)'}`, transition: 'border-color .15s' }}>
            <MagnifyingGlassIcon style={{ width: 16, height: 16, flexShrink: 0, color: focused ? ACCENT : 'rgba(255,255,255,0.35)' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              placeholder="Search exercises, muscles…"
              className="text-[15px] text-white placeholder:text-white/20"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', letterSpacing: '-0.01em' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', width: 19, height: 19, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XMarkIcon style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.6)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Muscle group filter */}
        <div style={{ padding: '0 20px 16px' }}>
          <HardwareSlider options={REGION_FILTERS} value={filter} onChange={setFilter} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--te-border)', margin: '0 20px 20px' }} />

        {/* Grouped carousels */}
        {grouped.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p className="text-[16px] font-semibold text-[#f4f1ec] mb-2">No exercises found</p>
            <p className="te-label">Try a different search or filter.</p>
          </div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {grouped.map(({ category, exercises }) => (
              <CarouselSection
                key={category}
                category={category}
                exercises={exercises}
                onTap={setSelected}
                isAdded={isAdded}
                onToggleAdd={toggleAdd}
              />
            ))}
          </div>
        )}

      </div>
    </FullPageSheet>
  );
}
