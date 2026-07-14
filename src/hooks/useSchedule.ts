import { useState, useCallback } from 'react';
import type { Routine, ScheduleDay } from '../types';

function storageKey(userId: string, key: string) {
  return `schedule_${userId}_${key}`;
}

function loadRoutines(userId: string): Routine[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, 'routines'));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function loadSchedule(userId: string): ScheduleDay[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, 'schedule'));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveRoutines(userId: string, routines: Routine[]) {
  try {
    localStorage.setItem(storageKey(userId, 'routines'), JSON.stringify(routines));
  } catch {}
}

function saveSchedule(userId: string, schedule: ScheduleDay[]) {
  try {
    localStorage.setItem(storageKey(userId, 'schedule'), JSON.stringify(schedule));
  } catch {}
}

export function useSchedule(userId: string) {
  const [routines, setRoutines] = useState<Routine[]>(() => loadRoutines(userId));
  const [schedule, setSchedule] = useState<ScheduleDay[]>(() => loadSchedule(userId));

  const updateRoutines = useCallback((updater: (prev: Routine[]) => Routine[]) => {
    setRoutines(prev => {
      const next = updater(prev);
      saveRoutines(userId, next);
      return next;
    });
  }, [userId]);

  const updateSchedule = useCallback((updater: (prev: ScheduleDay[]) => ScheduleDay[]) => {
    setSchedule(prev => {
      const next = updater(prev);
      saveSchedule(userId, next);
      return next;
    });
  }, [userId]);

  function addRoutine(name: string, exercise_ids: string[]): Routine {
    const routine: Routine = {
      id: `routine-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user_id: userId,
      name,
      exercise_ids,
      created_at: new Date().toISOString(),
    };
    updateRoutines(prev => [...prev, routine]);
    return routine;
  }

  function updateRoutine(id: string, name: string, exercise_ids: string[]) {
    updateRoutines(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, name, exercise_ids } : r);
      // Keep the embedded routines copy in sync (used as a fallback reference)
      updateSchedule(prev2 => prev2.map(s => {
        if (s.routine_id !== id) return s;
        const r = updated.find(x => x.id === id) ?? s.routines ?? null;
        return { ...s, routines: r ? { ...r, name, exercise_ids } : null };
      }));
      return updated;
    });
  }

  function deleteRoutine(id: string) {
    updateRoutines(prev => prev.filter(r => r.id !== id));
    updateSchedule(prev => prev.map(s =>
      s.routine_id === id ? { ...s, routine_id: null, routines: null } : s
    ));
  }

  function assignDay(day_of_week: number, routine_id: string | null) {
    updateSchedule(prev => {
      if (routine_id === null) {
        return prev.filter(s => s.day_of_week !== day_of_week);
      }
      const routine = routines.find(r => r.id === routine_id) ?? null;
      const entry: ScheduleDay = {
        id: `schedule-${day_of_week}`,
        user_id: userId,
        day_of_week,
        routine_id,
        routines: routine,
      };
      const exists = prev.some(s => s.day_of_week === day_of_week);
      return exists
        ? prev.map(s => s.day_of_week === day_of_week ? entry : s)
        : [...prev, entry];
    });
  }

  return { routines, schedule, addRoutine, updateRoutine, deleteRoutine, assignDay };
}
