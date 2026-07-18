import React, { useState, useMemo, useRef, useId, useEffect } from 'react';
import { ChevronDownIcon, ChartBarSquareIcon, TrophyIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { CompetitionMiniWidget } from '../components/Competitions';
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';
import type { WeightUnit } from '../hooks/useSettings';
import type { useCompetitions } from '../hooks/useCompetitions';
import { calcStreak, dayCompletionPct } from '../lib/streak';
import { accentHex } from '../lib/accent';
import { categoryVar, categoryHex } from '../lib/categoryColors';

interface Props {
  logs: WorkoutLog[];
  exercises: Exercise[];
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
  routines: Routine[];
  schedule: ScheduleDay[];
  competitions: ReturnType<typeof useCompetitions>;
  onOpenCompetitions: () => void;
}

type DayRange = 7 | 30 | 90 | 365;

const CATEGORY_ORDER = ['upper', 'lower', 'push', 'pull', 'legs', 'core'];
const CATEGORY_LABELS: Record<string, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

const MONO = "'Geist Mono', 'SF Mono', ui-monospace, monospace";

// Every bento block on this page shares one surface: same background,
// same border colour and thickness, same corner radius.
const BENTO_RADIUS = 20;
const BENTO: React.CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid var(--te-border)',
  borderRadius: BENTO_RADIUS,
};

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtFullDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAxisLabel(d: Date, rangeDays: number) {
  if (rangeDays <= 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (rangeDays <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (rangeDays <= 120) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function rangeSuffix(rangeDays: number): string {
  if (rangeDays <= 7) return 'last 7 days';
  if (rangeDays <= 30) return 'last 30 days';
  if (rangeDays <= 90) return 'last 90 days';
  const mo = Math.round(rangeDays / 30.44);
  if (mo >= 24) return 'last 2 years';
  if (mo >= 12) return 'last 1 year';
  return `last ${mo}mo`;
}

function categoryColor(group: string): string {
  const hex = categoryHex(group);
  return hex.startsWith('#') ? hex : accentHex();
}


interface ChartPoint { value: number; label: string; shortLabel?: string; tooltipLabel?: string; }

function niceYTicks(dMin: number, dMax: number): number[] {
  const range = dMax - dMin || dMax * 0.2 || 10;
  const rough = range / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = norm < 1.5 ? mag : norm < 3.5 ? 2 * mag : norm < 7.5 ? 5 * mag : 10 * mag;
  const lo = Math.floor(dMin / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const v = Math.round((lo + i * step) * 1e8) / 1e8;
    if (v > dMax * 1.25) break;
    if (v >= dMin - step * 0.5) ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

function fmtYLabel(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

const CW = 440;
const C_PT = 10;
const C_XH = 30;
const C_CH = 176;

// Points span the chart's full width edge-to-edge (no reserved left/right
// margin) so that when two windows are tiled side by side for swiping, a
// continuous line never breaks or leaves a gap at the seam.
function chartX(i: number, n: number) {
  return (i / Math.max(n - 1, 1)) * CW;
}

// Padded y-domain for a set of values. Computed once per chart section (e.g.
// from an exercise's whole history, or a fixed 0–100 for percentages) rather
// than per visible window, so paging through time never changes the scale —
// only the time axis moves, never the vertical elevation of the line.
function yDomainFor(pointSets: { value: number }[][]): { dMin: number; dMax: number; yMin: number; yMax: number } {
  const vals = pointSets.flat().map(p => p.value);
  const dMin = Math.min(...vals);
  const dMax = Math.max(...vals);
  const vPad = (dMax - dMin) * 0.18 || dMax * 0.08 || 2;
  const yMax = dMax + vPad;
  const yMin = Math.max(0, dMin - vPad * 0.4);
  return { dMin, dMax, yMin, yMax };
}

function yTicksFor(domain: { dMin: number; dMax: number; yMin: number; yMax: number }): number[] {
  const yRange = domain.yMax - domain.yMin || 1;
  const py = (v: number) => C_PT + ((domain.yMax - v) / yRange) * C_CH;
  const all = niceYTicks(domain.dMin, domain.dMax).filter(t => py(t) >= C_PT - 2 && py(t) <= C_PT + C_CH + 2);
  if (all.length <= 4) return all;
  return [all[0], all[Math.round(all.length / 3)], all[Math.round((2 * all.length) / 3)], all[all.length - 1]];
}

// Daily/Overall completion charts are always a 0–100% metric — a fixed
// domain, computed once, so their scale never shifts while paging either.
const PERCENT_DOMAIN = yDomainFor([[{ value: 0 }, { value: 100 }]]);
const PERCENT_YTICKS = yTicksFor(PERCENT_DOMAIN);

function ScrubChart({
  points, fillColor, maxLabels, scrubIndex, yMin, yMax,
}: {
  points: ChartPoint[];
  fillColor: string;
  maxLabels?: number;
  scrubIndex: number | null;
  yMin: number;
  yMax: number;
}) {
  const uid = useId().replace(/:/g, '');
  if (points.length < 2) return null;

  const TOTAL_H = C_PT + C_CH + C_XH;
  const yRange = yMax - yMin || 1;

  // Clamped so a value outside the domain (e.g. an edge-case seed of 0 below
  // yMin) can never draw the line past the chart's own bottom edge, into the
  // x-axis label row below it.
  const py = (v: number) => Math.min(C_PT + C_CH, Math.max(C_PT, C_PT + ((yMax - v) / yRange) * C_CH));
  const xs = points.map((_, i) => chartX(i, points.length));
  const ys = points.map(p => py(p.value));

  const areaBot = C_PT + C_CH;

  const lineD = (() => {
    const n = xs.length;
    if (n === 2) return `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)} L ${xs[1].toFixed(1)} ${ys[1].toFixed(1)}`;
    // Monotone cubic (Fritsch–Carlson): a smooth curve through every real data
    // point that never overshoots between them. This keeps the line free of
    // sharp corners while guaranteeing it never invents a peak/dip that isn't
    // in the data — so scrubbing always lands on a value the chart actually shows.
    const dxs: number[] = [];
    const slopes: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = xs[i + 1] - xs[i] || 1e-6;
      dxs.push(dx);
      slopes.push((ys[i + 1] - ys[i]) / dx);
    }
    const m: number[] = new Array(n);
    m[0] = slopes[0];
    m[n - 1] = slopes[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (slopes[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / slopes[i];
      const b = m[i + 1] / slopes[i];
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * slopes[i];
        m[i + 1] = t * b * slopes[i];
      }
    }
    let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const c1x = xs[i] + dxs[i] / 3;
      const c1y = ys[i] + (m[i] * dxs[i]) / 3;
      const c2x = xs[i + 1] - dxs[i] / 3;
      const c2y = ys[i + 1] - (m[i + 1] * dxs[i]) / 3;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
    }
    return d;
  })();
  const areaD = `${lineD} L ${xs[xs.length - 1].toFixed(1)} ${areaBot} L ${xs[0].toFixed(1)} ${areaBot} Z`;

  const numLabels = Math.min(maxLabels ?? 6, points.length);
  const labelIdxs: number[] = (() => {
    const n = points.length;
    if (n <= numLabels) return points.map((_, i) => i);
    const idxs: number[] = [0];
    for (let k = 1; k < numLabels - 1; k++) idxs.push(Math.round((k / (numLabels - 1)) * (n - 1)));
    idxs.push(n - 1);
    return [...new Set(idxs)];
  })();

  const hi = scrubIndex;
  const hx = hi != null ? xs[hi] : null;
  const hy = hi != null ? ys[hi] : null;

  return (
    <svg
      viewBox={`0 0 ${CW} ${TOTAL_H}`}
      className="w-full select-none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`fill${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={fillColor} stopOpacity="0.55" />
          <stop offset="55%"  stopColor={fillColor} stopOpacity="0.16" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={areaD} fill={`url(#fill${uid})`} />
      <path d={lineD} fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {hi !== null && hx !== null && hy !== null && (
        <>
          <line x1={hx} x2={hx} y1={C_PT - 2} y2={C_PT + C_CH} stroke="rgba(255,255,255,0.22)" strokeWidth="1.25" />
          <circle cx={hx} cy={hy} r="8" fill="#0a0908" />
          <circle cx={hx} cy={hy} r="6" fill="#ffffff" />
        </>
      )}

      {/* Solid backing plate behind the date row (matches the page bg) so the
          line/area is fully hidden behind the axis labels. */}
      <rect x={0} y={C_PT + C_CH} width={CW} height={C_XH} fill="#010101" />

      {labelIdxs.map((i, li) => {
        const first = li === 0;
        const last = li === labelIdxs.length - 1;
        return (
          <text
            key={i}
            x={xs[i]}
            y={C_PT + C_CH + 23}
            textAnchor={first ? 'start' : last ? 'end' : 'middle'}
            fontSize="12.5"
            fill={hi === i ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
            fontWeight={hi === i ? '600' : '500'}
            fontFamily={MONO}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {points[i].shortLabel ?? points[i].label}
          </text>
        );
      })}
    </svg>
  );
}

// Y-axis tick labels, rendered as a fixed overlay on top of the swipeable
// chart's viewport (a sibling of the panning track, never inside it) so they
// stay put — only the chart line itself moves while swiping.
function YAxisLabels({ domain, yTicks, unit }: {
  domain: { yMin: number; yMax: number };
  yTicks: number[];
  unit?: string;
}) {
  const TOTAL_H = C_PT + C_CH + C_XH;
  const yRange = domain.yMax - domain.yMin || 1;
  const py = (v: number) => C_PT + ((domain.yMax - v) / yRange) * C_CH;
  return (
    <svg
      viewBox={`0 0 ${CW} ${TOTAL_H}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: 'block' }}
    >
      {/* Solid backing plate behind the label column (matches the page bg) so
          the chart line/area is fully hidden behind the vertical legend. No
          axis bar line — it read as a stray sliver on the far left. */}
      <rect x={0} y={C_PT - 6} width={56} height={C_CH + 12} fill="#010101" />
      {yTicks.map(tick => {
        const ty = py(tick);
        const ly = Math.max(C_PT + 9, Math.min(C_PT + C_CH + 4, ty + 4));
        const label = `${fmtYLabel(tick)}${unit ?? ''}`;
        return (
          <text
            key={tick}
            x={8} y={ly}
            textAnchor="start"
            fontSize="12.5"
            fill="rgba(255,255,255,0.4)"
            fontFamily={MONO}
            fontWeight="500"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

interface PageDef {
  key: string;
  title: string;
  points: ChartPoint[];
  unit: string;
  fillColor: string;
  formatValue: (v: number) => string;
  idleCounter: React.ReactNode | null;
  rangeLabel: string;
  maxLabels: number;
}

function PageHeader({ def, scrubIndex }: { def: PageDef; scrubIndex: number | null }) {
  const pt = scrubIndex != null ? def.points[scrubIndex] : null;
  return (
    <div className="flex items-end justify-between gap-3 px-1 min-h-[46px]">
      <div>
        <p className="text-[26px] font-bold text-white tracking-tight leading-none">{def.title}</p>
        <p className="text-[12px] mt-[7px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {pt ? (pt.tooltipLabel ?? pt.label) : def.rangeLabel}
        </p>
      </div>
      <div className="text-right shrink-0 self-start">
        {pt ? (
          <p className="text-[32px] font-bold text-white tabular-nums leading-none tracking-tight te-digit">
            {def.formatValue(pt.value)}
          </p>
        ) : def.idleCounter}
      </div>
    </div>
  );
}

const PAGE_THRESHOLD = 60;

// One standalone chart with scrub-to-read + swipe-to-page. A quick horizontal
// drag pages to the previous/next window of the same duration (three-panel
// track, same mechanics as the Log page's WeekCalendar); holding still for a
// beat instead reveals the scrub crosshair over the current window. Vertical
// drags fall through to page scroll. Paging into the future is blocked by
// passing nextDef={null}.
function ScrubbableChart({ def, prevDef, nextDef, domain, yTicks, onShiftWindow }: {
  def: PageDef;
  prevDef: ChartWindow | null;
  nextDef: ChartWindow | null;
  // A fixed y-domain/ticks for this whole chart section (computed once by the
  // caller — e.g. from an exercise's full history, or a constant 0–100% —
  // not per visible window) so paging through time only moves the time axis;
  // the line's vertical scale never jumps.
  domain: { yMin: number; yMax: number };
  yTicks: number[];
  onShiftWindow: (delta: 1 | -1) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const st = useRef<{ x: number; y: number; mode: null | 'scrub' | 'pan' | 'abort'; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const scrubbingRef = useRef(false);
  const panningRef = useRef(false);
  const pendingShift = useRef(0);

  const nPts = def.points.length;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (scrubbingRef.current || panningRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  function xToIndex(clientX: number) {
    const el = viewportRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const vbX = ((clientX - r.left) / r.width) * CW;
    const frac = vbX / CW;
    return Math.max(0, Math.min(nPts - 1, Math.round(frac * (nPts - 1))));
  }

  // Dragging left (negative dx) reveals the next/future window — blocked
  // whenever there isn't one.
  function clampDx(raw: number) {
    if (!nextDef) return Math.max(0, raw);
    return raw;
  }

  function onPointerDown(e: React.PointerEvent) {
    const s = { x: e.clientX, y: e.clientY, mode: null as null | 'scrub' | 'pan' | 'abort', timer: null as ReturnType<typeof setTimeout> | null };
    s.timer = setTimeout(() => {
      if (st.current && st.current.mode === null) {
        st.current.mode = 'scrub';
        scrubbingRef.current = true;
        setScrub(xToIndex(s.x));
      }
    }, 140);
    st.current = s;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = st.current;
    if (!s) return;
    const rawDx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === null) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(rawDx)) {
        s.mode = 'abort';
        if (s.timer) clearTimeout(s.timer);
      } else if (Math.abs(rawDx) > 8) {
        if (s.timer) clearTimeout(s.timer);
        s.mode = 'pan';
        panningRef.current = true;
        setDx(clampDx(rawDx));
      }
    } else if (s.mode === 'scrub') {
      setScrub(xToIndex(e.clientX));
    } else if (s.mode === 'pan') {
      setDx(clampDx(rawDx));
    }
  }

  function endGesture() {
    const s = st.current;
    if (s?.timer) clearTimeout(s.timer);
    if (s?.mode === 'pan') {
      const w = viewportRef.current?.offsetWidth || 1;
      setSnapping(true);
      if (dx <= -PAGE_THRESHOLD && nextDef) { pendingShift.current = 1; setDx(-w); }
      else if (dx >= PAGE_THRESHOLD) { pendingShift.current = -1; setDx(w); }
      else { pendingShift.current = 0; setDx(0); }
    }
    panningRef.current = false;
    scrubbingRef.current = false;
    setScrub(null);
    st.current = null;
  }

  function onTrackTransitionEnd(e: React.TransitionEvent) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (!snapping) return;
    const shift = pendingShift.current;
    pendingShift.current = 0;
    setSnapping(false);
    setDx(0);
    if (shift !== 0) onShiftWindow(shift as 1 | -1);
  }

  return (
    <div className="pt-2 pb-1">
      <PageHeader def={def} scrubIndex={scrub} />
      <div className="mt-3 relative">
        <div
          ref={viewportRef}
          className="overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <div
            onTransitionEnd={onTrackTransitionEnd}
            className="flex items-start"
            style={{
              width: '300%',
              transform: `translateX(calc(-33.3333% + ${dx}px))`,
              transition: snapping ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
              willChange: 'transform',
            }}
          >
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              {prevDef && (
                <ScrubChart
                  points={prevDef.points} fillColor={prevDef.fillColor} maxLabels={prevDef.maxLabels}
                  scrubIndex={null} yMin={domain.yMin} yMax={domain.yMax}
                />
              )}
            </div>
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              <ScrubChart
                points={def.points} fillColor={def.fillColor} maxLabels={def.maxLabels}
                scrubIndex={scrub} yMin={domain.yMin} yMax={domain.yMax}
              />
            </div>
            <div className="shrink-0" style={{ width: '33.3333%' }}>
              {nextDef && (
                <ScrubChart
                  points={nextDef.points} fillColor={nextDef.fillColor} maxLabels={nextDef.maxLabels}
                  scrubIndex={null} yMin={domain.yMin} yMax={domain.yMax}
                />
              )}
            </div>
          </div>
        </div>
        {/* Fixed overlay, outside the panning track — never moves while swiping. */}
        <YAxisLabels domain={domain} yTicks={yTicks} unit={def.unit} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="px-[14px] py-[9px] flex items-center justify-between gap-3"
      style={BENTO}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-white tracking-tight">{label}</p>
        <p className="text-[11px] mt-[2px] truncate" style={{ color: 'rgba(244,241,236,0.35)' }}>{sub}</p>
      </div>
      <p className="text-[18px] font-bold text-white tabular-nums leading-none tracking-tight te-digit shrink-0">{value}</p>
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  header,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-0.5 active:opacity-70 transition-opacity select-none"
      >
        {header}
        <ChevronDownIcon
          className="w-[14px] h-[14px] text-white/25 ml-auto shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div
        className="grid"
        style={{
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

const RANGE_OPTIONS: { key: DayRange; label: string }[] = [
  { key: 7, label: '7d' },
  { key: 30, label: '30d' },
  { key: 90, label: '90d' },
  { key: 365, label: '12m' },
];

function RangePicker({
  range, onChange,
}: {
  range: DayRange; onChange: (r: DayRange) => void;
}) {
  return (
    <div className="flex gap-1 w-full">
      {RANGE_OPTIONS.map(({ key, label }) => {
        const active = range === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} flex-1 py-[6px] rounded-[10px] text-[11.5px] font-semibold select-none`}
            style={{ color: active ? '#0a0908' : 'rgba(255,255,255,0.4)' }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

type ProgressPageView = 'exercise' | 'overall';

const PAGE_VIEW_OPTIONS: { key: ProgressPageView; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'exercise', label: 'Per exercise' },
];

function PageViewToggle({ view, onChange }: { view: ProgressPageView; onChange: (v: ProgressPageView) => void }) {
  return (
    <div className="flex gap-1.5 w-full mb-4">
      {PAGE_VIEW_OPTIONS.map(({ key, label }) => {
        const active = view === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} flex-1 py-[10px] rounded-[14px] text-[13.5px] font-semibold select-none`}
            style={{ color: active ? '#0a0908' : 'rgba(255,255,255,0.4)' }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function filterLogsByRange(logs: WorkoutLog[], rangeDays: number, endDate: Date = new Date()): WorkoutLog[] {
  const cutoff = new Date(endDate);
  cutoff.setDate(cutoff.getDate() - rangeDays);
  cutoff.setHours(0, 0, 0, 0);
  const upper = new Date(endDate);
  upper.setHours(23, 59, 59, 999);
  return logs.filter(l => {
    const t = new Date(l.created_at);
    return t >= cutoff && t <= upper;
  });
}

function buildAllDaysInRange(rangeDays: number, endDate: Date = new Date()): Date[] {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push(d);
  }
  return days;
}

// Endpoint of the Nth window back from today for a given chart's duration —
// window 0 ends today, window 1 ends rangeDays before that, and so on. Used to
// page charts through history without ever revealing a window past today.
function windowEndDate(rangeDays: number, offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset * rangeDays);
  return d;
}

function sampleLong(points: ChartPoint[], rangeDays: number): ChartPoint[] {
  if (rangeDays > 60 && points.length > 60) {
    const step = Math.ceil(points.length / 60);
    const sampled: ChartPoint[] = [];
    for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) {
      sampled.push(points[points.length - 1]);
    }
    return sampled;
  }
  return points;
}

// Most recent daily-best value for an exercise strictly before `before` — the
// value a continuous chart should carry forward into a window with no logs of
// its own. Falls back to 0 (drawn as a flat line at 0) when there's none.
function lastKnownWeightBefore(
  logs: WorkoutLog[],
  exerciseId: string,
  before: Date,
  toDisplay: (kg: number) => number,
): number {
  const prior = logs.filter(l => l.exercise_id === exerciseId && new Date(l.created_at) < before);
  if (!prior.length) return 0;
  const latest = prior.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b));
  const latestKey = new Date(latest.created_at).toDateString();
  return Math.max(...prior.filter(l => new Date(l.created_at).toDateString() === latestKey).map(l => toDisplay(l.weight)));
}

function buildContinuousChart(
  allDays: Date[],
  dailyBestMap: Map<string, number>,
  rangeDays: number,
  seedValue: number = 0,
): ChartPoint[] {
  const points: ChartPoint[] = [];
  let lastVal = seedValue;
  for (const day of allDays) {
    const k = day.toDateString();
    const v = dailyBestMap.get(k);
    if (v !== undefined) lastVal = v;
    points.push({
      value: lastVal,
      label: fmtDate(day),
      shortLabel: fmtAxisLabel(day, rangeDays),
      tooltipLabel: fmtFullDate(day),
    });
  }
  return sampleLong(points, rangeDays);
}

function buildCompletionChart(
  exercise: Exercise,
  filteredLogs: WorkoutLog[],
  rangeDays: number,
  endDate: Date = new Date(),
): { points: ChartPoint[]; avg: number } {
  const perDay = new Map<string, number>();
  for (const log of filteredLogs) {
    const k = new Date(log.created_at).toDateString();
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const targetSets = Math.max(exercise.sets, 1);
  const allDays = buildAllDaysInRange(rangeDays, endDate);
  const raw: number[] = [];
  const points: ChartPoint[] = allDays.map(day => {
    const sets = perDay.get(day.toDateString()) ?? 0;
    const pctVal = Math.min(100, Math.round((sets / targetSets) * 100));
    raw.push(pctVal);
    return {
      value: pctVal,
      label: fmtDate(day),
      shortLabel: fmtAxisLabel(day, rangeDays),
      tooltipLabel: fmtFullDate(day),
    };
  });
  const avg = raw.length ? Math.round(raw.reduce((a, b) => a + b, 0) / raw.length) : 0;
  return { points: sampleLong(points, rangeDays), avg };
}

// Whole-day completion across every planned exercise (not just one) — backs
// the Overall page's Daily completion chart. Uses the same per-day math as
// the Log page's calendar rings via dayCompletionPct.
function buildOverallCompletionChart(
  rangeDays: number,
  endDate: Date,
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
): { points: ChartPoint[]; avg: number } {
  const allDays = buildAllDaysInRange(rangeDays, endDate);
  const raw: number[] = [];
  const points: ChartPoint[] = allDays.map(day => {
    const pctVal = Math.round(dayCompletionPct(day, logs, schedule, routines, exercises) * 100);
    raw.push(pctVal);
    return {
      value: pctVal,
      label: fmtDate(day),
      shortLabel: fmtAxisLabel(day, rangeDays),
      tooltipLabel: fmtFullDate(day),
    };
  });
  const avg = raw.length ? Math.round(raw.reduce((a, b) => a + b, 0) / raw.length) : 0;
  return { points: sampleLong(points, rangeDays), avg };
}

// Slice of a PageDef needed to draw the prev/next side-panels of a swipeable
// chart — those never show a header, so they don't need title/formatValue/etc.
type ChartWindow = Pick<PageDef, 'points' | 'unit' | 'fillColor' | 'maxLabels'>;

function makeWindow(
  w: { points: ChartPoint[] } | null,
  unit: string,
  fillColor: string,
  maxLabels: number,
): ChartWindow | null {
  if (!w) return null;
  return { points: w.points, unit, fillColor, maxLabels };
}

// One window of the Weight progress chart, ending at `endDate` — computed the
// same way regardless of whether it's the current, previous, or next panel.
function buildWeightWindow(
  selected: Exercise,
  workingLogs: WorkoutLog[],
  rangeDays: number,
  endDate: Date,
  toDisplay: (kg: number) => number,
  unit: WeightUnit,
): { points: ChartPoint[]; e1rm: { value: string; sub: string; has: boolean }; heaviest: { value: string; sub: string; has: boolean } } {
  const rangeExLogs = filterLogsByRange(workingLogs, rangeDays, endDate).filter(l => l.exercise_id === selected.id);

  const dailyBestMap = new Map<string, number>();
  for (const log of rangeExLogs) {
    const k = new Date(log.created_at).toDateString();
    const v = toDisplay(log.weight);
    const cur = dailyBestMap.get(k);
    if (cur === undefined || v > cur) dailyBestMap.set(k, v);
  }
  const allDays = buildAllDaysInRange(rangeDays, endDate);
  const seed = lastKnownWeightBefore(workingLogs, selected.id, allDays[0], toDisplay);
  const points = buildContinuousChart(allDays, dailyBestMap, rangeDays, seed);

  const e1rm = (() => {
    const cutoff = new Date(endDate); cutoff.setDate(cutoff.getDate() - rangeDays); cutoff.setHours(0, 0, 0, 0);
    const prevCutoff = new Date(endDate); prevCutoff.setDate(prevCutoff.getDate() - rangeDays * 2); prevCutoff.setHours(0, 0, 0, 0);
    const upper = new Date(endDate); upper.setHours(23, 59, 59, 999);
    let curBest = 0, prevBest = 0;
    for (const log of workingLogs) {
      if (log.exercise_id !== selected.id) continue;
      const d = new Date(log.created_at);
      if (d > upper) continue;
      const est = log.weight * (1 + log.reps_done / 30);
      if (d >= cutoff) { if (est > curBest) curBest = est; }
      else if (d >= prevCutoff) { if (est > prevBest) prevBest = est; }
    }
    const cur = Math.round(toDisplay(curBest));
    const prev = Math.round(toDisplay(prevBest));
    return { value: `${cur}${unit}`, sub: signedPct(cur, prev), has: cur > 0 };
  })();

  const heaviest = (() => {
    if (!rangeExLogs.length) return { value: `0${unit}`, sub: '—', has: false };
    const heaviestWeight = Math.max(...rangeExLogs.map(l => l.weight));
    const atHeaviest = rangeExLogs.filter(l => l.weight === heaviestWeight);
    const prLog = atHeaviest.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return { value: `${toDisplay(heaviestWeight)}${unit}`, sub: fmtFullDate(new Date(prLog.created_at)), has: true };
  })();

  return { points, e1rm, heaviest };
}

// One window of a per-exercise Daily completion chart, ending at `endDate`.
function buildDailyWindow(
  selected: Exercise,
  workingLogs: WorkoutLog[],
  rangeDays: number,
  endDate: Date,
): { points: ChartPoint[]; avg: number } {
  const rangeExLogs = filterLogsByRange(workingLogs, rangeDays, endDate).filter(l => l.exercise_id === selected.id);
  return buildCompletionChart(selected, rangeExLogs, rangeDays, endDate);
}

// One window of the Overall (aggregate) Daily completion chart.
function buildOverallWindow(
  rangeDays: number,
  endDate: Date,
  logs: WorkoutLog[],
  schedule: ScheduleDay[],
  routines: Routine[],
  exercises: Exercise[],
): { points: ChartPoint[]; avg: number } {
  return buildOverallCompletionChart(rangeDays, endDate, logs, schedule, routines, exercises);
}

function signedPct(cur: number, prev: number): string {
  if (prev <= 0) return '0% vs previous';
  const pct = ((cur - prev) / prev) * 100;
  const r = Math.round(pct * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}% vs previous`;
}

function GroupedExercisePicker({
  exercises,
  activeId,
  onSelect,
}: {
  exercises: Exercise[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, Exercise[]>();
    for (const ex of exercises) {
      const g = ex.muscle_group;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(ex);
    }
    for (const [g, items] of map) {
      map.set(g, items.slice().sort((a, b) => a.name.localeCompare(b.name)));
    }
    return map;
  }, [exercises]);

  const orderedGroups = CATEGORY_ORDER.filter(g => grouped.has(g));
  const otherGroups = Array.from(grouped.keys()).filter(g => !CATEGORY_ORDER.includes(g)).sort();
  const allGroups = [...orderedGroups, ...otherGroups];

  return (
    <div className="overflow-hidden" style={BENTO}>
      {allGroups.map((group, gi) => (
        <div key={group}>
          {gi > 0 && <div className="h-px bg-white/[0.06] mx-3" />}
          <div className="px-4 pt-4 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-[5px] h-[5px] rounded-full shrink-0 inline-block" style={{
                background: categoryVar(group),
              }} />
              <p className="te-label">
                {CATEGORY_LABELS[group] ?? (group.charAt(0).toUpperCase() + group.slice(1))}
              </p>
            </div>
          </div>
          <div className="px-3 pt-1.5 pb-3 flex flex-wrap gap-[6px]">
            {grouped.get(group)!.map(ex => {
              const active = activeId === ex.id;
              return (
                <button
                  key={ex.id}
                  onClick={() => onSelect(ex.id)}
                  className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} px-2.5 py-[5px] rounded-xl text-[12px] font-semibold select-none`}
                  style={{ color: active ? '#0a0908' : 'rgba(255,255,255,0.4)' }}
                >
                  {ex.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StreakCard({ logs, schedule, routines, exercises }: {
  logs: WorkoutLog[];
  schedule: ScheduleDay[];
  routines: Routine[];
  exercises: Exercise[];
}) {
  const { current, longest, totalDays } = useMemo(
    () => calcStreak(logs, schedule, routines, exercises),
    [logs, schedule, routines, exercises],
  );
  const items = [
    { value: `${current}d`, label: 'streak' },
    { value: `${longest}d`, label: 'best' },
    { value: String(totalDays), label: 'total' },
  ];
  return (
    <div className="flex gap-[7px]">
      {items.map(({ value, label }) => (
        <div
          key={label}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 h-[60px]"
          style={BENTO}
        >
          <span className="text-[17px] font-bold tabular-nums leading-none te-digit text-white tracking-[-0.17px]">
            {value}
          </span>
          <span
            className="text-[10px] font-medium uppercase leading-none"
            style={{ color: 'rgba(244,241,236,0.35)', letterSpacing: '1.2px', fontFamily: MONO }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsView({ logs, exercises, unit, toDisplay, routines, schedule, competitions, onOpenCompetitions }: Props) {
  const [pageView, setPageView] = useState<ProgressPageView>('overall');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weightRange, setWeightRange] = useState<DayRange>(30);
  const [weightWindowOffset, setWeightWindowOffset] = useState(0);
  const [dailyRange, setDailyRange] = useState<DayRange>(30);
  const [dailyWindowOffset, setDailyWindowOffset] = useState(0);
  const [overallRange, setOverallRange] = useState<DayRange>(30);
  const [overallWindowOffset, setOverallWindowOffset] = useState(0);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const weightRangeDays: number = weightRange;
  const dailyRangeDays: number = dailyRange;
  const overallRangeDays: number = overallRange;

  // All-time personal records: the heaviest working set per exercise (ties
  // broken by more reps), with the date it was set.
  const prs = useMemo(() => {
    const map = new Map<string, { weight: number; reps: number; date: string }>();
    for (const l of logs) {
      if (l.set_type === 'warmup') continue;
      const cur = map.get(l.exercise_id);
      if (!cur || l.weight > cur.weight || (l.weight === cur.weight && l.reps_done > cur.reps)) {
        map.set(l.exercise_id, { weight: l.weight, reps: l.reps_done, date: l.created_at });
      }
    }
    return Array.from(map.entries())
      .map(([id, pr]) => {
        const ex = exercises.find(e => e.id === id);
        return {
          id,
          name: ex?.name ?? 'Unknown',
          group: ex?.muscle_group ?? 'other',
          label: pr.weight > 0 ? `${Math.round(toDisplay(pr.weight))}${unit} × ${pr.reps}` : `${pr.reps} reps`,
          date: pr.date,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, exercises, toDisplay, unit]);

  // Personal records split by muscle group — works for weighted, bodyweight
  // and any custom group, with known groups ordered first.
  const prGroups = useMemo(() => {
    const map = new Map<string, typeof prs>();
    for (const pr of prs) {
      if (!map.has(pr.group)) map.set(pr.group, []);
      map.get(pr.group)!.push(pr);
    }
    const known = CATEGORY_ORDER.filter(g => map.has(g));
    const rest = Array.from(map.keys()).filter(g => !CATEGORY_ORDER.includes(g)).sort();
    return [...known, ...rest].map(group => ({
      group,
      label: CATEGORY_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1),
      items: map.get(group)!,
    }));
  }, [prs]);

  const withLogs = useMemo(
    () => exercises
      .filter(e => logs.some(l => l.exercise_id === e.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, logs]
  );

  const defaultExerciseId = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const entry = schedule.find(s => s.day_of_week === dow);
    const routineId = entry?.routine_id ?? null;
    const routine = routineId ? routines.find(r => r.id === routineId) : null;
    if (routine) {
      for (const exId of routine.exercise_ids) {
        if (withLogs.find(e => e.id === exId)) return exId;
      }
    }
    if (!logs.length) return null;
    return logs.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    ).exercise_id;
  }, [schedule, routines, withLogs, logs]);

  const workingLogs = useMemo(() => logs.filter(l => l.set_type !== 'warmup'), [logs]);

  const defaultId = withLogs.length
    ? ((defaultExerciseId && withLogs.find(e => e.id === defaultExerciseId)) ? defaultExerciseId : withLogs[0].id)
    : null;
  const activeId = (selectedId && withLogs.find(e => e.id === selectedId)) ? selectedId : defaultId;
  const selected = activeId ? withLogs.find(e => e.id === activeId) ?? null : null;

  const catColor = selected ? categoryColor(selected.muscle_group) : 'rgba(244,241,236,0.3)';

  // Weight progress's y-domain is fixed from the exercise's whole history
  // (not the visible window) so paging through time never rescales the
  // chart — only the time axis moves.
  const weightDomain = useMemo(() => {
    if (!selected) return null;
    const vals = workingLogs.filter(l => l.exercise_id === selected.id).map(l => ({ value: toDisplay(l.weight) }));
    return yDomainFor([vals]);
  }, [selected, workingLogs, toDisplay]);
  const weightYTicks = useMemo(() => weightDomain ? yTicksFor(weightDomain) : [], [weightDomain]);

  // Reset each chart's paging whenever its duration (or, for the per-exercise
  // charts, the selected exercise) changes — a new window always starts at today.
  useEffect(() => { setWeightWindowOffset(0); }, [weightRange, activeId]);
  useEffect(() => { setDailyWindowOffset(0); }, [dailyRange, activeId]);
  useEffect(() => { setOverallWindowOffset(0); }, [overallRange]);

  // Weight-progress chart + its stat cards, driven by the weight range filter.
  // current/prev/next are the three panels the swipeable chart pages through.
  const weightAnalytics = useMemo(() => {
    if (!selected) return null;
    const rangeLabel = rangeSuffix(weightRangeDays).replace(/^\w/, c => c.toUpperCase());
    const maxLabels = weightRangeDays <= 7 ? 7 : weightRangeDays <= 30 ? 6 : 5;
    const current = buildWeightWindow(selected, workingLogs, weightRangeDays, windowEndDate(weightRangeDays, weightWindowOffset), toDisplay, unit);
    const prev = buildWeightWindow(selected, workingLogs, weightRangeDays, windowEndDate(weightRangeDays, weightWindowOffset + 1), toDisplay, unit);
    const next = weightWindowOffset === 0 ? null : buildWeightWindow(selected, workingLogs, weightRangeDays, windowEndDate(weightRangeDays, weightWindowOffset - 1), toDisplay, unit);
    return { rangeLabel, maxLabels, current, prev, next };
  }, [selected, workingLogs, weightRangeDays, weightWindowOffset, toDisplay, unit]);

  // Daily-completion chart (this exercise only) + its stat card.
  const dailyAnalytics = useMemo(() => {
    if (!selected) return null;
    const rangeLabel = rangeSuffix(dailyRangeDays).replace(/^\w/, c => c.toUpperCase());
    const maxLabels = dailyRangeDays <= 7 ? 7 : dailyRangeDays <= 30 ? 6 : 5;
    const current = buildDailyWindow(selected, workingLogs, dailyRangeDays, windowEndDate(dailyRangeDays, dailyWindowOffset));
    const prev = buildDailyWindow(selected, workingLogs, dailyRangeDays, windowEndDate(dailyRangeDays, dailyWindowOffset + 1));
    const next = dailyWindowOffset === 0 ? null : buildDailyWindow(selected, workingLogs, dailyRangeDays, windowEndDate(dailyRangeDays, dailyWindowOffset - 1));
    return { rangeLabel, maxLabels, current, prev, next };
  }, [selected, workingLogs, dailyRangeDays, dailyWindowOffset]);

  // Overall (aggregate, all exercises) Daily completion chart — Overall page only.
  const overallAnalytics = useMemo(() => {
    const rangeLabel = rangeSuffix(overallRangeDays).replace(/^\w/, c => c.toUpperCase());
    const maxLabels = overallRangeDays <= 7 ? 7 : overallRangeDays <= 30 ? 6 : 5;
    const current = buildOverallWindow(overallRangeDays, windowEndDate(overallRangeDays, overallWindowOffset), logs, schedule, routines, exercises);
    const prev = buildOverallWindow(overallRangeDays, windowEndDate(overallRangeDays, overallWindowOffset + 1), logs, schedule, routines, exercises);
    const next = overallWindowOffset === 0 ? null : buildOverallWindow(overallRangeDays, windowEndDate(overallRangeDays, overallWindowOffset - 1), logs, schedule, routines, exercises);
    return { rangeLabel, maxLabels, current, prev, next };
  }, [overallRangeDays, overallWindowOffset, logs, schedule, routines, exercises]);

  if (!logs.length) {
    return (
      <EmptyState
        icon={<ChartBarSquareIcon className="w-8 h-8 text-apple-label-tertiary" />}
        title="Your progress will appear here"
        subtitle="Log some workouts to see your progress."
      />
    );
  }

  if (!withLogs.length || !selected) {
    return (
      <EmptyState
        icon={<ChartBarSquareIcon className="w-8 h-8 text-apple-label-tertiary" />}
        title="Your progress will appear here"
        subtitle="Log some workouts to see per-exercise analytics."
      />
    );
  }

  const dotColor = selected.muscle_group === 'upper'
    ? 'var(--te-upper)'
    : selected.muscle_group === 'lower'
    ? 'var(--te-lower)'
    : 'rgba(244,241,236,0.3)';

  if (!weightAnalytics || !dailyAnalytics) return null;

  const weightDef: PageDef = {
    key: 'weight',
    title: 'Weight progress',
    points: weightAnalytics.current.points,
    unit,
    fillColor: catColor,
    formatValue: v => `${v}${unit}`,
    idleCounter: null,
    rangeLabel: weightAnalytics.rangeLabel,
    maxLabels: weightAnalytics.maxLabels,
  };
  const weightPrevWindow = makeWindow(weightAnalytics.prev, unit, catColor, weightAnalytics.maxLabels);
  const weightNextWindow = makeWindow(weightAnalytics.next, unit, catColor, weightAnalytics.maxLabels);

  const dailyDef: PageDef = {
    key: 'daily',
    title: 'Daily completion',
    points: dailyAnalytics.current.points,
    unit: '%',
    fillColor: catColor,
    formatValue: v => `${v}%`,
    idleCounter: (
      <p className="text-[32px] font-bold text-white tabular-nums leading-none tracking-tight te-digit">
        <span className="text-[17px] font-semibold align-middle mr-1" style={{ color: 'rgba(255,255,255,0.45)' }}>avg</span>
        {dailyAnalytics.current.avg}%
      </p>
    ),
    rangeLabel: dailyAnalytics.rangeLabel,
    maxLabels: dailyAnalytics.maxLabels,
  };
  const dailyPrevWindow = makeWindow(dailyAnalytics.prev, '%', catColor, dailyAnalytics.maxLabels);
  const dailyNextWindow = makeWindow(dailyAnalytics.next, '%', catColor, dailyAnalytics.maxLabels);

  const overallColor = accentHex();
  const overallDef: PageDef = {
    key: 'overall',
    title: 'Daily completion',
    points: overallAnalytics.current.points,
    unit: '%',
    fillColor: overallColor,
    formatValue: v => `${v}%`,
    idleCounter: (
      <p className="text-[32px] font-bold text-white tabular-nums leading-none tracking-tight te-digit">
        <span className="text-[17px] font-semibold align-middle mr-1" style={{ color: 'rgba(255,255,255,0.45)' }}>avg</span>
        {overallAnalytics.current.avg}%
      </p>
    ),
    rangeLabel: overallAnalytics.rangeLabel,
    maxLabels: overallAnalytics.maxLabels,
  };
  const overallPrevWindow = makeWindow(overallAnalytics.prev, '%', overallColor, overallAnalytics.maxLabels);
  const overallNextWindow = makeWindow(overallAnalytics.next, '%', overallColor, overallAnalytics.maxLabels);

  const prsBento = (
    <>
      <button
        onClick={() => setPrOpen(true)}
        className="w-full px-4 py-3.5 mt-3 flex items-center gap-3 active:bg-white/[0.04] transition-colors text-left"
        style={BENTO}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <TrophyIcon className="w-4 h-4" style={{ color: '#ffffff' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight">Personal records</p>
          <p className="te-label mt-0.5">
            {prs.length > 0 ? `${prs.length} exercise${prs.length === 1 ? '' : 's'} · your heaviest lifts` : 'Log sets to set records'}
          </p>
        </div>
        <ChevronRightIcon className="w-3.5 h-3.5 text-white/20 shrink-0" />
      </button>

      <Modal open={prOpen} onClose={() => setPrOpen(false)} title="Personal records">
        {prs.length === 0 ? (
          <div className="px-4 py-8 text-center te-label" style={BENTO}>No records yet</div>
        ) : (
          <div className="space-y-5">
            {prGroups.map(({ group, label, items }) => (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3 pb-2.5 px-1" style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <span className="te-label" style={{ color: 'rgba(244,241,236,0.35)' }}>{label}</span>
                  <span className="te-label ml-auto" style={{ color: 'rgba(244,241,236,0.35)' }}>{items.length}</span>
                </div>
                <div className="overflow-hidden divide-y divide-white/[0.05]" style={BENTO}>
                  {items.map(pr => (
                    <div key={pr.id} className="flex items-center px-4 py-[14px] gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">{pr.name}</p>
                        <p className="te-label mt-0.5">{fmtFullDate(new Date(pr.date))}</p>
                      </div>
                      <span className="te-digit text-[18px] font-bold tabular-nums text-[#f4f1ec] shrink-0">{pr.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );

  return (
    <div>
      <PageViewToggle view={pageView} onChange={setPageView} />

      {pageView === 'overall' ? (
        <div>
          {/* Daily completion (aggregate across every exercise) — at the top */}
          <div>
            <RangePicker range={overallRange} onChange={setOverallRange} />
            <div className="mt-3">
              <ScrubbableChart
                def={overallDef}
                prevDef={overallPrevWindow}
                nextDef={overallNextWindow}
                domain={PERCENT_DOMAIN}
                yTicks={PERCENT_YTICKS}
                onShiftWindow={delta => setOverallWindowOffset(o => Math.max(0, o - delta))}
              />
            </div>
          </div>

          <div className="mt-[18px]">
            <StreakCard logs={logs} schedule={schedule} routines={routines} exercises={exercises} />
          </div>

          <div className="mt-3">
            <CompetitionMiniWidget comps={competitions} onOpen={onOpenCompetitions} />
          </div>

          {prsBento}
        </div>
      ) : (
        <div>
          <CollapsibleSection
            open={exerciseOpen}
            onToggle={() => setExerciseOpen(o => !o)}
            header={
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: dotColor }} />
                <span
                  className="text-[11.5px] font-semibold uppercase truncate"
                  style={{ fontFamily: MONO, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.85)' }}
                >
                  {selected.name}
                </span>
              </div>
            }
          >
            <GroupedExercisePicker
              exercises={withLogs}
              activeId={selected.id}
              onSelect={id => { setSelectedId(id); setExerciseOpen(false); }}
            />
          </CollapsibleSection>

          {/* Weight progress — its own time filter */}
          <div className="mt-3">
            <RangePicker range={weightRange} onChange={setWeightRange} />
            <div className="mt-3">
              <ScrubbableChart
                def={weightDef}
                prevDef={weightPrevWindow}
                nextDef={weightNextWindow}
                domain={weightDomain ?? { yMin: 0, yMax: 1 }}
                yTicks={weightYTicks}
                onShiftWindow={delta => setWeightWindowOffset(o => Math.max(0, o - delta))}
              />
              <div className="space-y-1.5 pt-5">
                {/* Always shown — a dash stands in until there's data to report. */}
                <StatCard
                  label="Estimated 1RM"
                  value={weightAnalytics.current.e1rm.has ? weightAnalytics.current.e1rm.value : '–'}
                  sub={weightAnalytics.current.e1rm.has ? weightAnalytics.current.e1rm.sub : 'No data yet'}
                />
                <StatCard
                  label="Heaviest weight"
                  value={weightAnalytics.current.heaviest.has ? weightAnalytics.current.heaviest.value : '–'}
                  sub={weightAnalytics.current.heaviest.has ? weightAnalytics.current.heaviest.sub : 'No data yet'}
                />
              </div>
            </div>
          </div>

          {/* Daily completion (this exercise) — its own time filter */}
          <div className="mt-6">
            <RangePicker range={dailyRange} onChange={setDailyRange} />
            <div className="mt-3">
              <ScrubbableChart
                def={dailyDef}
                prevDef={dailyPrevWindow}
                nextDef={dailyNextWindow}
                domain={PERCENT_DOMAIN}
                yTicks={PERCENT_YTICKS}
                onShiftWindow={delta => setDailyWindowOffset(o => Math.max(0, o - delta))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
