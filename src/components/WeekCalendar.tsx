// A 7-day week strip — swipe left/right to change weeks. Extracted from the Log
// page so the Routines scheduler can show the exact same calendar. Purely a day
// picker: the ring fills with `progressFor` and a day's initial brightens when
// `hasScheduleFor` is true.
import { useMemo, useRef, useState } from 'react';
import { addDays, dayInitial, isSameDay, keyOf } from '../lib/calendarDays';

// ── Single day ring — track + progress arc + centered initial ──
function DayRing({
  date, initial, progress, isToday, isSelected, hasSchedule, onSelect,
}: {
  date: Date;
  initial: string;
  progress: number;      // 0…1
  isToday: boolean;
  isSelected: boolean;
  hasSchedule: boolean;  // a routine is scheduled for this day-of-week
  onSelect: (d: Date) => void;
}) {
  const size = 38;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, progress));

  const arcColor = isToday ? 'var(--te-accent)' : 'var(--te-text-1)';
  // White initial marks a day that's on the routine (or the selected day);
  // other days stay dim.
  const letterColor = isToday
    ? 'var(--te-accent)'
    : hasSchedule || isSelected
    ? 'var(--te-text-1)'
    : 'var(--te-text-4)';

  return (
    <button
      onClick={() => onSelect(date)}
      className="relative flex items-center justify-center shrink-0 active:opacity-70 transition-opacity"
      style={{ width: size, height: size }}
      aria-label={date.toDateString()}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--te-border-strong)" strokeWidth={stroke}
        />
        {progress > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={arcColor} strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
        )}
      </svg>
      <span
        className="absolute select-none"
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em', color: letterColor }}
      >
        {initial}
      </span>
      {/* Dot below the ring (outside the circle) — the accent marks today,
          plain off-white marks the selected day */}
      {(isToday || isSelected) && (
        <span
          className="absolute rounded-full"
          style={{ width: 4, height: 4, background: isToday ? 'var(--te-accent)' : 'var(--te-text-1)', bottom: -7, left: '50%', transform: 'translateX(-50%)' }}
        />
      )}
    </button>
  );
}

// One week's row of 7 day rings
function WeekRow({
  weekStart, selectedDate, today, onSelect, progressFor, hasScheduleFor,
}: {
  weekStart: Date;
  selectedDate: Date;
  today: Date;
  onSelect: (d: Date) => void;
  progressFor: (d: Date) => number;
  hasScheduleFor: (d: Date) => boolean;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  return (
    // justify-around (not justify-between) so the half-gap at each week's edge
    // combines with the neighbour's to make the spacing across the week seam
    // match the spacing within a week when swiping between weeks.
    <div className="flex items-center justify-around shrink-0" style={{ width: '33.3333%' }}>
      {days.map(d => (
        <DayRing
          key={keyOf(d)}
          date={d}
          initial={dayInitial(d)}
          progress={progressFor(d)}
          isToday={isSameDay(d, today)}
          isSelected={isSameDay(d, selectedDate)}
          hasSchedule={hasScheduleFor(d)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ── 7-day week strip — swipe left/right to change weeks ────────
// A three-week track (prev · current · next) that follows the finger and snaps
// continuously into the neighbouring week based on swipe direction.
export default function WeekCalendar({
  weekStart, selectedDate, today, onSelect, onShiftWeek, progressFor, hasScheduleFor,
}: {
  weekStart: Date;
  selectedDate: Date;
  today: Date;
  onSelect: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
  progressFor: (d: Date) => number;
  hasScheduleFor: (d: Date) => boolean;
}) {
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const width = useRef(0);
  const pendingShift = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const THRESHOLD = 55;

  const prevWeek = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const nextWeek = useMemo(() => addDays(weekStart, 7), [weekStart]);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    active.current = true;
    width.current = containerRef.current?.offsetWidth ?? 0;
    setSnapping(false);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (Math.abs(deltaY) > Math.abs(deltaX) + 6) { active.current = false; return; }
    setDx(deltaX);
  }
  function onTouchEnd() {
    if (!active.current) return;
    active.current = false;
    const w = width.current || 1;
    setSnapping(true);
    if (dx <= -THRESHOLD) { pendingShift.current = 1; setDx(-w); }        // reveal next week
    else if (dx >= THRESHOLD) { pendingShift.current = -1; setDx(w); }    // reveal prev week
    else { pendingShift.current = 0; setDx(0); }                          // snap back
  }
  function onTransitionEnd(e: React.TransitionEvent) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (!snapping) return;
    const shift = pendingShift.current;
    pendingShift.current = 0;
    setSnapping(false);
    setDx(0);                                  // recenter without animation
    if (shift !== 0) onShiftWeek(shift);       // adopt the revealed week as current
  }

  return (
    // paddingBottom leaves room for the day dots that sit outside the rings so
    // overflow-hidden (which masks the neighbouring weeks) doesn't clip them.
    <div ref={containerRef} className="overflow-hidden" style={{ touchAction: 'pan-y', paddingBottom: 10 }}>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={onTransitionEnd}
        className="flex items-center"
        style={{
          width: '300%',
          transform: `translateX(calc(-33.3333% + ${dx}px))`,
          transition: snapping ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
          willChange: 'transform',
        }}
      >
        <WeekRow weekStart={prevWeek} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
        <WeekRow weekStart={weekStart} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
        <WeekRow weekStart={nextWeek} selectedDate={selectedDate} today={today} onSelect={onSelect} progressFor={progressFor} hasScheduleFor={hasScheduleFor} />
      </div>
    </div>
  );
}
