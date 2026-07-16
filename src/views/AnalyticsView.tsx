import React, { useState, useMemo, useRef, useId, useEffect } from 'react';
import { ChevronDownIcon, XMarkIcon, ChartBarSquareIcon, TrophyIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { CompetitionMiniWidget } from '../components/Competitions';
import type { Exercise, WorkoutLog, Routine, ScheduleDay } from '../types';
import type { WeightUnit } from '../hooks/useSettings';
import type { useCompetitions } from '../hooks/useCompetitions';
import { buildCompletedDays, calcStreak } from '../lib/streak';
import { loadSkips, loadDaySet } from '../lib/skips';
import { accentHex } from '../lib/accent';

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

type DayRange = 7 | 30 | 90 | 'all' | 'custom';

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

function rangeSuffix(rangeDays: number, isAll: boolean): string {
  if (isAll) return 'all time';
  if (rangeDays <= 7) return 'last 7 days';
  if (rangeDays <= 30) return 'last 30 days';
  if (rangeDays <= 90) return 'last 90 days';
  const mo = Math.round(rangeDays / 30.44);
  if (mo >= 24) return 'last 2 years';
  if (mo >= 12) return 'last 1 year';
  return `last ${mo}mo`;
}

function categoryColor(group: string): string {
  if (group === 'upper') return '#9b8cf2';
  if (group === 'lower') return '#f2c08c';
  return accentHex();
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="te-panel rounded-2xl overflow-hidden">{children}</div>;
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
const C_YLg = 46;
const C_PL = C_YLg + 4;
const C_PRg = 14;
const C_PT = 10;
const C_XH = 30;
const C_CH = 176;

function chartX(i: number, n: number) {
  return C_PL + (i / Math.max(n - 1, 1)) * (CW - C_PL - C_PRg);
}

function ScrubChart({
  points, unit, fillColor, maxLabels, scrubIndex,
}: {
  points: ChartPoint[]; unit?: string; fillColor: string; maxLabels?: number; scrubIndex: number | null;
}) {
  const uid = useId().replace(/:/g, '');
  if (points.length < 2) return null;

  const TOTAL_H = C_PT + C_CH + C_XH;

  const vals = points.map(p => p.value);
  const dMin = Math.min(...vals);
  const dMax = Math.max(...vals);
  const vPad = (dMax - dMin) * 0.18 || dMax * 0.08 || 2;
  const yMax = dMax + vPad;
  const yMin = Math.max(0, dMin - vPad * 0.4);
  const yRange = yMax - yMin || 1;

  const py = (v: number) => C_PT + ((yMax - v) / yRange) * C_CH;
  const xs = points.map((_, i) => chartX(i, points.length));
  const ys = points.map(p => py(p.value));

  const areaBot = C_PT + C_CH;

  const lineD = (() => {
    const n = xs.length;
    if (n === 2) return `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)} L ${xs[1].toFixed(1)} ${ys[1].toFixed(1)}`;
    const clampY = (v: number) => Math.max(C_PT, Math.min(areaBot, v));
    const gx = (i: number) => xs[Math.max(0, Math.min(n - 1, i))];
    const gy = (i: number) => ys[Math.max(0, Math.min(n - 1, i))];
    let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const c1x = gx(i) + (gx(i + 1) - gx(i - 1)) / 6;
      const c1y = clampY(gy(i) + (gy(i + 1) - gy(i - 1)) / 6);
      const c2x = gx(i + 1) - (gx(i + 2) - gx(i)) / 6;
      const c2y = clampY(gy(i + 1) - (gy(i + 2) - gy(i)) / 6);
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${gx(i + 1).toFixed(1)} ${gy(i + 1).toFixed(1)}`;
    }
    return d;
  })();
  const areaD = `${lineD} L ${xs[xs.length - 1].toFixed(1)} ${areaBot} L ${xs[0].toFixed(1)} ${areaBot} Z`;

  const yTicks = (() => {
    const all = niceYTicks(dMin, dMax).filter(t => py(t) >= C_PT - 2 && py(t) <= C_PT + C_CH + 2);
    if (all.length <= 4) return all;
    return [all[0], all[Math.round(all.length / 3)], all[Math.round((2 * all.length) / 3)], all[all.length - 1]];
  })();

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
  const latestX = xs[xs.length - 1];
  const latestY = ys[ys.length - 1];

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

      {yTicks.map(tick => {
        const ty = py(tick);
        const ly = Math.max(C_PT + 9, Math.min(C_PT + C_CH + 4, ty + 4));
        return (
          <text
            key={tick}
            x={C_YLg - 10} y={ly}
            textAnchor="end"
            fontSize="12.5"
            fill="rgba(255,255,255,0.4)"
            fontFamily={MONO}
            fontWeight="500"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtYLabel(tick)}{unit ?? ''}
          </text>
        );
      })}

      <path d={areaD} fill={`url(#fill${uid})`} />
      <path d={lineD} fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {hi === null && (
        <circle cx={latestX} cy={latestY} r="4.5" fill="#ffffff" />
      )}

      {hi !== null && hx !== null && hy !== null && (
        <>
          <line x1={hx} x2={hx} y1={C_PT - 2} y2={C_PT + C_CH} stroke="rgba(255,255,255,0.22)" strokeWidth="1.25" />
          <circle cx={hx} cy={hy} r="8" fill="#0a0908" />
          <circle cx={hx} cy={hy} r="6" fill="#ffffff" />
        </>
      )}

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

function ProgressPager({ pages, page, onPageChange }: {
  pages: PageDef[]; page: number; onPageChange: (p: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const st = useRef<{ x: number; y: number; mode: null | 'page' | 'scrub' | 'abort'; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const scrubbingRef = useRef(false);

  const nPts = pages[page]?.points.length ?? 0;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => { if (scrubbingRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  function xToIndex(clientX: number) {
    const el = viewportRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const vbX = ((clientX - r.left) / r.width) * CW;
    const frac = (vbX - C_PL) / (CW - C_PL - C_PRg);
    return Math.max(0, Math.min(nPts - 1, Math.round(frac * (nPts - 1))));
  }

  function onPointerDown(e: React.PointerEvent) {
    const s = { x: e.clientX, y: e.clientY, mode: null as null | 'page' | 'scrub' | 'abort', timer: null as ReturnType<typeof setTimeout> | null };
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
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === null) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        s.mode = 'page';
        if (s.timer) clearTimeout(s.timer);
      } else if (Math.abs(dy) > 12) {
        s.mode = 'abort';
        if (s.timer) clearTimeout(s.timer);
      }
    }
    if (s.mode === 'page') {
      setDragX(dx);
    } else if (s.mode === 'scrub') {
      setScrub(xToIndex(e.clientX));
    }
  }

  function endGesture(e: React.PointerEvent) {
    const s = st.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    scrubbingRef.current = false;
    if (s.mode === 'page') {
      const el = viewportRef.current;
      const w = el ? el.getBoundingClientRect().width : 300;
      const dx = e.clientX - s.x;
      const thresh = w * 0.22;
      let np = page;
      if (dx < -thresh && page < pages.length - 1) np = page + 1;
      else if (dx > thresh && page > 0) np = page - 1;
      onPageChange(np);
      setDragX(0);
    } else if (s.mode === 'scrub') {
      setScrub(null);
    }
    st.current = null;
  }

  const paging = st.current?.mode === 'page';

  return (
    <div>
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
          className="flex"
          style={{
            transform: `translateX(calc(${-page * 100}% + ${dragX}px))`,
            transition: paging ? 'none' : 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {pages.map((def, i) => (
            <div key={def.key} className="w-full shrink-0 pt-2 pb-1" style={{ paddingRight: i < pages.length - 1 ? 0 : 0 }}>
              <PageHeader def={def} scrubIndex={i === page ? scrub : null} />
              <div className="mt-3">
                <ScrubChart
                  points={def.points}
                  unit={def.unit}
                  fillColor={def.fillColor}
                  maxLabels={def.maxLabels}
                  scrubIndex={i === page ? scrub : null}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-2">
        {pages.map((def, i) => (
          <button
            key={def.key}
            onClick={() => onPageChange(i)}
            aria-label={`Show ${def.title}`}
            className="rounded-full transition-all"
            style={{
              width: i === page ? 18 : 6,
              height: 6,
              background: i === page ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="rounded-[20px] px-[18px] py-[12px] flex items-center justify-between gap-3"
      style={{ background: '#141414', border: '1px solid #1a1a1a' }}
    >
      <p className="text-[15px] font-semibold text-white tracking-tight">{label}</p>
      <div className="text-right shrink-0">
        <p className="text-[22px] font-bold text-white tabular-nums leading-none tracking-tight te-digit">{value}</p>
        <p className="text-[12px] mt-[4px]" style={{ color: 'rgba(244,241,236,0.35)' }}>{sub}</p>
      </div>
    </div>
  );
}

function CustomRangeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const MIN = 7;
  const MAX = 730;
  const pct = ((value - MIN) / (MAX - MIN)) * 100;

  const months = Math.round(value / 30.44);
  const display =
    value >= 700 || months >= 24
      ? '2y'
      : value >= 365 || months >= 12
      ? '1y'
      : value >= 60
      ? `${months}mo`
      : `${value}d`;

  function getVal(clientX: number) {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    return Math.round(MIN + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (MAX - MIN));
  }

  return (
    <div className="te-panel rounded-xl px-4 py-[12px] mt-1.5">
      <div className="flex items-center justify-between mb-[10px]">
        <span className="te-label">Custom range</span>
        <span className="text-[13px] font-bold text-white tabular-nums te-digit">{display}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-5 flex items-center cursor-pointer select-none"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onChange(getVal(e.clientX)); }}
        onPointerMove={e => { if (!e.buttons) return; onChange(getVal(e.clientX)); }}
      >
        <div
          className="absolute inset-x-0 h-[5px] rounded-full"
          style={{
            background: 'linear-gradient(180deg, #121214 0%, #1a1a1c 100%)',
            boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,255,255,0.04)',
          }}
        />
        <div
          className="absolute left-0 h-[5px] rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(180deg, #3de26a 0%, #28c354 100%)',
            boxShadow: '0 0 8px rgba(40,195,84,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
          }}
        />
        <div
          className="absolute w-[20px] h-[20px] rounded-full -translate-x-1/2"
          style={{
            left: `${pct}%`,
            background: 'linear-gradient(180deg, #f6f6f7 0%, #c9c9cc 100%)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,0,0,0.2)',
          }}
        />
      </div>
      <div className="flex justify-between mt-[4px]">
        <span className="te-label">1w</span>
        <span className="te-label">2y</span>
      </div>
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
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

function RangePicker({
  range, customDays, onChange, onCustomChange,
}: {
  range: DayRange; customDays: number; onChange: (r: DayRange) => void; onCustomChange: (d: number) => void;
}) {
  return (
    <div>
      <div className="flex gap-1 w-full">
        {RANGE_OPTIONS.map(({ key, label }) => {
          const active = range === key;
          return (
            <button
              key={String(key)}
              onClick={() => onChange(key)}
              className={`${active ? 'te-toggle-on te-toggle-mono' : 'te-toggle-off'} flex-1 py-[6px] rounded-[10px] text-[11.5px] font-semibold select-none`}
              style={{ color: active ? '#0a0908' : 'rgba(255,255,255,0.4)' }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {range === 'custom' && <CustomRangeSlider value={customDays} onChange={onCustomChange} />}
    </div>
  );
}

function resolveRangeDays(range: DayRange, customDays: number, logs: WorkoutLog[]): number {
  if (range === 'custom') return customDays;
  if (range === 'all') {
    if (!logs.length) return 30;
    const earliest = logs.reduce((min, l) => {
      const t = new Date(l.created_at).getTime();
      return t < min ? t : min;
    }, Date.now());
    return Math.max(Math.ceil((Date.now() - earliest) / 86400000) + 1, 1);
  }
  return range;
}

function filterLogsByRange(logs: WorkoutLog[], rangeDays: number): WorkoutLog[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  cutoff.setHours(0, 0, 0, 0);
  return logs.filter(l => new Date(l.created_at) >= cutoff);
}

function buildAllDaysInRange(rangeDays: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
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

function buildContinuousChart(
  allDays: Date[],
  dailyBestMap: Map<string, number>,
  rangeDays: number,
): ChartPoint[] {
  const points: ChartPoint[] = [];
  let lastVal = 0;
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

function buildEntryOnlyChart(
  logs: WorkoutLog[],
  toDisplay: (kg: number) => number,
): ChartPoint[] {
  const dailyBestMap = new Map<string, { value: number; date: Date }>();
  for (const log of logs) {
    const d = new Date(log.created_at);
    const k = d.toDateString();
    const v = toDisplay(log.weight);
    const cur = dailyBestMap.get(k);
    if (!cur || v > cur.value) dailyBestMap.set(k, { value: v, date: d });
  }
  const entries = Array.from(dailyBestMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  const totalSpan = entries.length >= 2
    ? Math.ceil((entries[entries.length - 1].date.getTime() - entries[0].date.getTime()) / 86400000) + 1
    : 30;
  return entries.map(e => ({
    value: e.value,
    label: fmtDate(e.date),
    shortLabel: fmtAxisLabel(e.date, totalSpan),
    tooltipLabel: fmtFullDate(e.date),
  }));
}

function buildCompletionChart(
  exercise: Exercise,
  filteredLogs: WorkoutLog[],
  rangeDays: number,
): { points: ChartPoint[]; avg: number } {
  const perDay = new Map<string, number>();
  for (const log of filteredLogs) {
    const k = new Date(log.created_at).toDateString();
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const targetSets = Math.max(exercise.sets, 1);
  const allDays = buildAllDaysInRange(rangeDays);
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
    <div className="te-panel rounded-2xl overflow-hidden">
      {allGroups.map((group, gi) => (
        <div key={group}>
          {gi > 0 && <div className="h-px bg-white/[0.06] mx-3" />}
          <div className="px-4 pt-4 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-[5px] h-[5px] rounded-full shrink-0 inline-block" style={{
                background: group === 'upper' ? 'var(--te-upper)' : group === 'lower' ? 'var(--te-lower)' : 'rgba(244,241,236,0.3)',
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

const RECAP_HEADLINES = [
  'Great session.',
  'Solid work.',
  'Strong session.',
  'Well done.',
  'Crushed it.',
  'Keep building.',
];

function todayStorageKey(suffix: string) {
  const d = new Date();
  return `recap-${suffix}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function SessionRecapCard({
  logs,
  exercises,
  unit,
  toDisplay,
}: {
  logs: WorkoutLog[];
  exercises: Exercise[];
  unit: WeightUnit;
  toDisplay: (kg: number) => number;
}) {
  const [headline] = useState(
    () => RECAP_HEADLINES[Math.floor(Math.random() * RECAP_HEADLINES.length)]
  );
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(todayStorageKey('dismissed')) === '1'
  );
  const [gradientVisible, setGradientVisible] = useState(true);
  const listScrollRef = React.useRef<HTMLDivElement>(null);

  function dismiss() {
    localStorage.setItem(todayStorageKey('dismissed'), '1');
    setDismissed(true);
  }

  function handleListScroll() {
    const el = listScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setGradientVisible(!atBottom);
  }

  const { todayLogs, summaries, dateStr, sentence, score } = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const tLogs = logs.filter(l => {
      const d = new Date(l.created_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` === key;
    });

    const map = new Map<string, { exercise: Exercise; bestWeight: number; bestReps: number; sets: number }>();
    for (const log of tLogs) {
      const ex = exercises.find(e => e.id === log.exercise_id);
      if (!ex) continue;
      const cur = map.get(log.exercise_id);
      if (!cur) {
        map.set(log.exercise_id, { exercise: ex, bestWeight: log.weight, bestReps: log.reps_done, sets: 1 });
      } else {
        cur.sets++;
        if (log.weight > cur.bestWeight || (log.weight === cur.bestWeight && log.reps_done > cur.bestReps)) {
          cur.bestWeight = log.weight;
          cur.bestReps = log.reps_done;
        }
      }
    }
    const sums = Array.from(map.values());
    const sets = tLogs.length;
    const vol = Math.round(tLogs.reduce((s, l) => s + toDisplay(l.weight) * l.reps_done, 0));
    const ds = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const exCount = sums.length;
    let durationStr = '';
    if (tLogs.length > 1) {
      const times = tLogs.map(l => new Date(l.created_at).getTime());
      const mins = Math.round((Math.max(...times) - Math.min(...times)) / 60000);
      durationStr = mins < 1 ? '' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
    }
    const sent = `${exCount} exercise${exCount !== 1 ? 's' : ''}, ${sets} set${sets !== 1 ? 's' : ''}, ${vol} ${unit} moved${durationStr ? ` · ${durationStr}` : ''}.`;

    let scoreVal: number | null = null;
    if (sums.length > 0) {
      const exScores = sums.map(({ exercise, bestWeight, bestReps, sets: setsLogged }) => {
        const stt = exercise.sets > 0 ? exercise.sets : null;
        const rt = exercise.target_reps > 0 ? exercise.target_reps : null;
        const wt = exercise.weight > 0 ? exercise.weight : null;
        if (!stt && !rt && !wt) return 0.7;
        const parts: number[] = [];
        if (stt) parts.push(Math.min(setsLogged / stt, 1.0));
        if (rt) parts.push(Math.min(bestReps / rt, 1.1));
        if (wt) parts.push(Math.min(bestWeight / wt, 1.1));
        return parts.reduce((a, b) => a + b, 0) / parts.length;
      });
      const overall = exScores.reduce((a, b) => a + b, 0) / exScores.length;
      scoreVal = Math.max(1, Math.min(10, Math.round(overall * 10)));
    }

    return { todayLogs: tLogs, summaries: sums, dateStr: ds, sentence: sent, score: scoreVal };
  }, [logs, exercises, toDisplay, unit]);

  if (!todayLogs.length || dismissed) return null;

  return (
    <div className="te-panel rounded-2xl overflow-hidden">
      <div
        className="px-4 pt-4 pb-3 flex items-start justify-between gap-3"
        style={{ background: 'rgba(48,209,88,0.13)' }}
      >
        <div className="min-w-0">
          <p className="te-label mb-1.5" style={{ color: 'rgba(48,209,88,0.65)' }}>{dateStr}</p>
          <p className="text-[22px] font-bold text-white tracking-tight leading-tight">{headline}</p>
          <p className="te-label mt-1.5 leading-relaxed">{sentence}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 -mr-1 active:opacity-50 transition-opacity shrink-0 mt-0.5"
          style={{ color: 'rgba(48,209,88,0.45)' }}
          aria-label="Dismiss recap"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {summaries.length > 0 && (
        <div className="relative">
          <div className="h-px bg-white/[0.06]" />
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            className="overflow-y-auto divide-y divide-white/[0.05]"
            style={{ maxHeight: 150, WebkitOverflowScrolling: 'touch' as never }}
          >
            {summaries.map(({ exercise, bestWeight, bestReps, sets }) => (
              <div key={exercise.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white/80 tracking-tight truncate">{exercise.name}</p>
                  <p className="te-label" style={{ fontSize: 10, marginTop: 2 }}>
                    {sets} set{sets !== 1 ? 's' : ''}
                  </p>
                </div>
                <p className="te-mono text-[12px] font-semibold text-white/35 tabular-nums shrink-0 ml-3">
                  {toDisplay(bestWeight)}{unit} × {bestReps}
                </p>
              </div>
            ))}
          </div>
          {summaries.length > 3 && (
            <div
              className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{
                height: 44,
                background: 'linear-gradient(to bottom, transparent, #0e0c0a)',
                opacity: gradientVisible ? 1 : 0,
                transition: gradientVisible ? 'opacity 0.25s ease' : 'none',
              }}
            />
          )}
        </div>
      )}

      {score !== null && (
        <>
          <div className="h-px bg-white/[0.06]" />
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="te-label">Session score</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-bold tabular-nums leading-none te-digit" style={{ color: '#30d158' }}>{score}</span>
              <span className="te-label">/10</span>
            </div>
          </div>
        </>
      )}
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
          className="flex-1 flex flex-col items-center justify-center gap-1.5 h-[60px] rounded-[20px]"
          style={{ background: '#141210', border: '1px solid var(--te-border)' }}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<DayRange>(30);
  const [customDays, setCustomDays] = useState(90);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [chartPage, setChartPage] = useState(0);
  const [prOpen, setPrOpen] = useState(false);
  const rangeDays = resolveRangeDays(range, customDays, logs);
  const isAll = range === 'all';

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
      .map(([id, pr]) => ({
        id,
        name: exercises.find(e => e.id === id)?.name ?? 'Unknown',
        label: pr.weight > 0 ? `${Math.round(toDisplay(pr.weight))}${unit} × ${pr.reps}` : `${pr.reps} reps`,
        date: pr.date,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, exercises, toDisplay, unit]);

  const { todayIsScheduled, isTodayComplete } = useMemo(() => {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const entry = schedule.find(s => s.day_of_week === dow);
    const routineId = entry?.routine_id ?? null;
    const routine = routineId ? routines.find(r => r.id === routineId) : null;
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    // Manually finishing the workout (Complete workout button) unlocks the
    // recap at any time — even on a purely manual, non-routine day.
    if (loadDaySet('workoutdone', todayKey).size > 0) return { todayIsScheduled: true, isTodayComplete: true };
    if (!routine) return { todayIsScheduled: false, isTodayComplete: false };
    const completed = buildCompletedDays(logs, schedule, routines, exercises);
    if (completed.has(todayKey)) return { todayIsScheduled: true, isTodayComplete: true };
    // Also unlocked once every planned exercise is done OR skipped, so the
    // recap appears on Progress when you finish the day by skipping too.
    const skipped = loadSkips(todayKey);
    const workingToday = new Map<string, number>();
    for (const l of logs) {
      if (l.set_type === 'warmup') continue;
      const d = new Date(l.created_at);
      if (`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` !== todayKey) continue;
      workingToday.set(l.exercise_id, (workingToday.get(l.exercise_id) ?? 0) + 1);
    }
    const allResolved = routine.exercise_ids.every(id => {
      const ex = exercises.find(e => e.id === id);
      if (!ex || ex.sets <= 0) return true;
      return (workingToday.get(id) ?? 0) >= ex.sets || skipped.has(id);
    });
    return { todayIsScheduled: true, isTodayComplete: allResolved };
  }, [logs, schedule, routines, exercises]);

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

  const hasLogsInRange = selected
    ? filterLogsByRange(workingLogs, rangeDays).some(l => l.exercise_id === selected.id)
    : false;

  const analytics = useMemo(() => {
    if (!selected) return null;
    const catColor = categoryColor(selected.muscle_group);
    const rangeLabel = rangeSuffix(rangeDays, isAll).replace(/^\w/, c => c.toUpperCase());
    const maxLabels = rangeDays <= 7 ? 7 : rangeDays <= 30 ? 6 : 5;

    const rangeExLogs = filterLogsByRange(workingLogs, rangeDays).filter(l => l.exercise_id === selected.id);

    let weightPoints: ChartPoint[];
    if (isAll) {
      weightPoints = buildEntryOnlyChart(rangeExLogs, toDisplay);
    } else {
      const dailyBestMap = new Map<string, number>();
      for (const log of rangeExLogs) {
        const k = new Date(log.created_at).toDateString();
        const v = toDisplay(log.weight);
        const cur = dailyBestMap.get(k);
        if (cur === undefined || v > cur) dailyBestMap.set(k, v);
      }
      weightPoints = buildContinuousChart(buildAllDaysInRange(rangeDays), dailyBestMap, rangeDays);
    }

    const completion = buildCompletionChart(selected, rangeExLogs, rangeDays);

    const prevLogs = (() => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeDays); cutoff.setHours(0, 0, 0, 0);
      const prevCutoff = new Date(); prevCutoff.setDate(prevCutoff.getDate() - rangeDays * 2); prevCutoff.setHours(0, 0, 0, 0);
      return workingLogs.filter(l => {
        if (l.exercise_id !== selected.id) return false;
        const d = new Date(l.created_at);
        return d >= prevCutoff && d < cutoff;
      });
    })();
    const prevPerDay = new Map<string, number>();
    for (const log of prevLogs) {
      const k = new Date(log.created_at).toDateString();
      prevPerDay.set(k, (prevPerDay.get(k) ?? 0) + 1);
    }
    const targetSets = Math.max(selected.sets, 1);
    const prevAvg = (() => {
      const days: number[] = [];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let i = rangeDays * 2 - 1; i >= rangeDays; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const sets = prevPerDay.get(d.toDateString()) ?? 0;
        days.push(Math.min(100, Math.round((sets / targetSets) * 100)));
      }
      return days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    })();

    const e1rm = (() => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeDays); cutoff.setHours(0, 0, 0, 0);
      const prevCutoff = new Date(); prevCutoff.setDate(prevCutoff.getDate() - rangeDays * 2); prevCutoff.setHours(0, 0, 0, 0);
      let curBest = 0, prevBest = 0;
      for (const log of workingLogs) {
        if (log.exercise_id !== selected.id) continue;
        const d = new Date(log.created_at);
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
      return {
        value: `${toDisplay(heaviestWeight)}${unit}`,
        sub: fmtFullDate(new Date(prLog.created_at)),
        has: true,
      };
    })();

    return {
      catColor, rangeLabel, maxLabels,
      weightPoints,
      completionPoints: completion.points,
      avgDaily: completion.avg,
      avgDailySub: signedPct(completion.avg, prevAvg),
      e1rm, heaviest,
      weightUnit: unit,
    };
  }, [selected, workingLogs, rangeDays, isAll, toDisplay, unit]);

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

  const pages: PageDef[] = analytics ? [
    {
      key: 'weight',
      title: 'Weight progress',
      points: analytics.weightPoints,
      unit: analytics.weightUnit,
      fillColor: analytics.catColor,
      formatValue: v => `${v}${analytics.weightUnit}`,
      idleCounter: null,
      rangeLabel: analytics.rangeLabel,
      maxLabels: analytics.maxLabels,
    },
    {
      key: 'daily',
      title: 'Daily completion',
      points: analytics.completionPoints,
      unit: '%',
      fillColor: analytics.catColor,
      formatValue: v => `${v}%`,
      idleCounter: (
        <p className="text-[32px] font-bold text-white tabular-nums leading-none tracking-tight te-digit">
          <span className="text-[17px] font-semibold align-middle mr-1" style={{ color: 'rgba(255,255,255,0.45)' }}>avg</span>
          {analytics.avgDaily}%
        </p>
      ),
      rangeLabel: analytics.rangeLabel,
      maxLabels: analytics.maxLabels,
    },
  ] : [];

  return (
    <div>

      <CompetitionMiniWidget comps={competitions} onOpen={onOpenCompetitions} />

      {todayIsScheduled && (
        <div className="mb-3">
          {isTodayComplete ? (
            <SessionRecapCard logs={logs} exercises={exercises} unit={unit} toDisplay={toDisplay} />
          ) : (
            <div className="te-panel rounded-2xl px-4 py-5">
              <p className="te-label" style={{ fontSize: 11 }}>
                Complete all exercises to unlock your session recap.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mb-[18px]">
        <StreakCard logs={logs} schedule={schedule} routines={routines} exercises={exercises} />
      </div>

      <div className="space-y-[10px]">
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

        <RangePicker range={range} customDays={customDays} onChange={setRange} onCustomChange={setCustomDays} />
      </div>

      <div className="mt-3">
        {!hasLogsInRange || !analytics ? (
          <Card>
            <div className="px-4 py-6 text-center">
              <p className="te-label">
                No data for {selected.name} in the {rangeSuffix(rangeDays, isAll)}
              </p>
            </div>
          </Card>
        ) : (
          <>
            <ProgressPager pages={pages} page={chartPage} onPageChange={setChartPage} />

            <div className="space-y-1.5 pt-5">
              {chartPage === 0 ? (
                <>
                  {analytics.e1rm.has && <StatCard label="Estimated 1RM" value={analytics.e1rm.value} sub={analytics.e1rm.sub} />}
                  {analytics.heaviest.has && <StatCard label="Heaviest weight" value={analytics.heaviest.value} sub={analytics.heaviest.sub} />}
                </>
              ) : (
                <>
                  <StatCard label="Average daily" value={`${analytics.avgDaily}%`} sub={analytics.avgDailySub} />
                  {analytics.heaviest.has && <StatCard label="Heaviest weight" value={analytics.heaviest.value} sub={analytics.heaviest.sub} />}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Personal records — bento at the very bottom, opens the full list */}
      <button
        onClick={() => setPrOpen(true)}
        className="te-panel w-full rounded-2xl px-4 py-3.5 mt-3 flex items-center gap-3 active:bg-white/[0.04] transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(48,209,88,0.14)' }}>
          <TrophyIcon className="w-4 h-4" style={{ color: '#30d158' }} />
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
          <div className="te-panel rounded-2xl px-4 py-8 text-center te-label">No records yet</div>
        ) : (
          <div className="te-panel rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
            {prs.map(pr => (
              <div key={pr.id} className="flex items-center px-4 py-[14px] gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[#f4f1ec] tracking-tight truncate">{pr.name}</p>
                  <p className="te-label mt-0.5">{fmtFullDate(new Date(pr.date))}</p>
                </div>
                <span className="te-digit text-[18px] font-bold tabular-nums text-[#f4f1ec] shrink-0">{pr.label}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
