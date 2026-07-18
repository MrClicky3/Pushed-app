import { useState, useCallback } from 'react';
import { isSoundEnabled, setSoundEnabled as applySound, isHapticsEnabled, setHapticsEnabled as applyHaptics } from '../lib/feedback';
import { applyAccent, loadAccent, type AccentKey } from '../lib/accent';
import { applyCategoryColors, loadCategoryColors, type CategoryColors, type CategoryKey } from '../lib/categoryColors';

export type WeightUnit = 'kg' | 'lbs';
export type WeekStartDay = 'saturday' | 'sunday' | 'monday';

const STORAGE_KEY  = 'settings_weight_unit';
const TIMER_KEY    = 'settings_timer_duration';
const BARBELL_KEY  = 'settings_barbell_weight';
const DURATION_KEY = 'settings_show_duration';
const WEEK_START_KEY = 'settings_week_start_day';

function load(): WeightUnit {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'lbs') return 'lbs';
  } catch {}
  return 'kg';
}

function loadWeekStartDay(): WeekStartDay {
  try {
    const v = localStorage.getItem(WEEK_START_KEY);
    if (v === 'saturday' || v === 'sunday' || v === 'monday') return v;
  } catch {}
  return 'monday';
}

function loadTimerDuration(): number {
  try {
    const v = localStorage.getItem(TIMER_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (n >= 15 && n <= 600) return n;
    }
  } catch {}
  return 90;
}

function loadBarbellWeight(): number {
  try {
    const v = localStorage.getItem(BARBELL_KEY);
    if (v) {
      const n = parseFloat(v);
      if (n >= 5 && n <= 40) return n;
    }
  } catch {}
  return 20;
}

function loadShowDuration(): boolean {
  try { return localStorage.getItem(DURATION_KEY) !== 'off'; } catch {}
  return true;
}

export function useSettings() {
  const [unit, setUnitState] = useState<WeightUnit>(load);
  const [timerDuration, setTimerDurationState] = useState<number>(loadTimerDuration);
  const [barbellWeight, setBarbellWeightState] = useState<number>(loadBarbellWeight);
  const [showDuration, setShowDurationState] = useState<boolean>(loadShowDuration);
  const [weekStartDay, setWeekStartDayState] = useState<WeekStartDay>(loadWeekStartDay);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(isSoundEnabled);
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(isHapticsEnabled);
  const [accent, setAccentState] = useState<AccentKey>(loadAccent);
  const [categoryColors, setCategoryColorsState] = useState<CategoryColors>(loadCategoryColors);

  const setUnit = useCallback((u: WeightUnit) => {
    try { localStorage.setItem(STORAGE_KEY, u); } catch {}
    setUnitState(u);
  }, []);

  const setTimerDuration = useCallback((d: number) => {
    const clamped = Math.max(15, Math.min(600, d));
    try { localStorage.setItem(TIMER_KEY, String(clamped)); } catch {}
    setTimerDurationState(clamped);
  }, []);

  const setBarbellWeight = useCallback((w: number) => {
    const clamped = Math.max(5, Math.min(40, w));
    try { localStorage.setItem(BARBELL_KEY, String(clamped)); } catch {}
    setBarbellWeightState(clamped);
  }, []);

  const setShowDuration = useCallback((on: boolean) => {
    try { localStorage.setItem(DURATION_KEY, on ? 'on' : 'off'); } catch {}
    setShowDurationState(on);
  }, []);

  const setWeekStartDay = useCallback((d: WeekStartDay) => {
    try { localStorage.setItem(WEEK_START_KEY, d); } catch {}
    setWeekStartDayState(d);
  }, []);

  const setSoundEnabled = useCallback((on: boolean) => {
    applySound(on); // persists the pref + warms up the audio graph
    setSoundEnabledState(on);
  }, []);

  const setHapticsEnabled = useCallback((on: boolean) => {
    applyHaptics(on);
    setHapticsEnabledState(on);
  }, []);

  const setAccent = useCallback((key: AccentKey) => {
    applyAccent(key); // persists + updates CSS variables live
    setAccentState(key);
  }, []);

  const setCategoryColor = useCallback((cat: CategoryKey, paletteKey: string) => {
    setCategoryColorsState(prev => {
      const next = { ...prev, [cat]: paletteKey };
      applyCategoryColors(next); // persists + updates CSS variables live
      return next;
    });
  }, []);

  function toDisplay(kg: number): number {
    if (unit === 'lbs') return Math.round(kg * 2.20462 * 2) / 2;
    return kg;
  }

  function fromDisplay(val: number): number {
    if (unit === 'lbs') return Math.round((val / 2.20462) * 10) / 10;
    return val;
  }

  return {
    unit, setUnit, toDisplay, fromDisplay,
    timerDuration, setTimerDuration,
    barbellWeight, setBarbellWeight,
    showDuration, setShowDuration,
    weekStartDay, setWeekStartDay,
    soundEnabled, setSoundEnabled,
    hapticsEnabled, setHapticsEnabled,
    accent, setAccent,
    categoryColors, setCategoryColor,
  };
}
