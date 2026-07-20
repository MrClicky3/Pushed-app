import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Routine, ScheduleDay } from '../types';

// Routines and the weekly schedule used to live only in localStorage, which
// meant they never followed a user to a second device and vanished if the
// browser was cleared. They are in Supabase now. The old keys are still read
// once, to lift any pre-existing local data into the database.

function storageKey(userId: string, key: string) {
  return `schedule_${userId}_${key}`;
}

function readLocal<T>(userId: string, key: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, key));
    if (raw) return JSON.parse(raw) as T[];
  } catch { /* corrupt or unavailable — treat as empty */ }
  return [];
}

function markMigrated(userId: string) {
  try { localStorage.setItem(storageKey(userId, 'migrated'), '1'); } catch { /* non-fatal */ }
}

function alreadyMigrated(userId: string) {
  try { return localStorage.getItem(storageKey(userId, 'migrated')) === '1'; } catch { return false; }
}

function newId(): string {
  return crypto.randomUUID();
}

export function useSchedule(userId: string) {
  // Seeded from localStorage so the week renders instantly on load; replaced
  // by the server's copy as soon as it arrives.
  const [routines, setRoutines] = useState<Routine[]>(() => readLocal<Routine>(userId, 'routines'));
  const [schedule, setSchedule] = useState<ScheduleDay[]>(() => readLocal<ScheduleDay>(userId, 'schedule'));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const [routineRes, scheduleRes] = await Promise.all([
        supabase.from('routines').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('schedule').select('*, routines(*)').eq('user_id', userId),
      ]);
      if (cancelled) return;

      const serverRoutines = (routineRes.data as Routine[] | null) ?? [];
      const serverSchedule = (scheduleRes.data as ScheduleDay[] | null) ?? [];

      // First run on a device that still holds pre-Supabase data: push it up
      // rather than letting an empty server response wipe the user's week.
      if (!routineRes.error && serverRoutines.length === 0 && !alreadyMigrated(userId)) {
        const localRoutines = readLocal<Routine>(userId, 'routines');
        const localSchedule = readLocal<ScheduleDay>(userId, 'schedule');

        if (localRoutines.length > 0 || localSchedule.length > 0) {
          // Local ids look like "routine-1721…"; the table wants uuids.
          const idMap = new Map<string, string>();
          const rows = localRoutines.map(r => {
            const id = newId();
            idMap.set(r.id, id);
            return {
              id,
              user_id: userId,
              name: r.name,
              exercise_ids: r.exercise_ids ?? [],
              created_at: r.created_at ?? new Date().toISOString(),
            };
          });

          if (rows.length) await supabase.from('routines').insert(rows);

          const dayRows = localSchedule
            .filter(s => s.routine_id && idMap.has(s.routine_id))
            .map(s => ({
              user_id: userId,
              day_of_week: s.day_of_week,
              routine_id: idMap.get(s.routine_id as string) as string,
            }));
          if (dayRows.length) {
            await supabase.from('schedule').upsert(dayRows, { onConflict: 'user_id,day_of_week' });
          }

          markMigrated(userId);

          const [r2, s2] = await Promise.all([
            supabase.from('routines').select('*').eq('user_id', userId).order('created_at'),
            supabase.from('schedule').select('*, routines(*)').eq('user_id', userId),
          ]);
          if (cancelled) return;
          setRoutines((r2.data as Routine[] | null) ?? []);
          setSchedule((s2.data as ScheduleDay[] | null) ?? []);
          return;
        }
        markMigrated(userId);
      }

      if (!routineRes.error) setRoutines(serverRoutines);
      if (!scheduleRes.error) setSchedule(serverSchedule);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // Writes update local state first so the UI stays instant, then persist.
  const persistRoutine = useCallback(async (row: Routine) => {
    await supabase.from('routines').upsert({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      exercise_ids: row.exercise_ids,
      created_at: row.created_at,
    });
  }, []);

  function addRoutine(name: string, exercise_ids: string[]): Routine {
    const routine: Routine = {
      id: newId(),
      user_id: userId,
      name,
      exercise_ids,
      created_at: new Date().toISOString(),
    };
    setRoutines(prev => [...prev, routine]);
    void persistRoutine(routine);
    return routine;
  }

  function updateRoutine(id: string, name: string, exercise_ids: string[]) {
    setRoutines(prev => prev.map(r => (r.id === id ? { ...r, name, exercise_ids } : r)));
    // Keep the copy embedded in the schedule rows in step with the edit.
    setSchedule(prev => prev.map(s =>
      s.routine_id === id && s.routines
        ? { ...s, routines: { ...s.routines, name, exercise_ids } }
        : s,
    ));
    void supabase.from('routines').update({ name, exercise_ids }).eq('id', id);
  }

  function deleteRoutine(id: string) {
    setRoutines(prev => prev.filter(r => r.id !== id));
    // The FK is ON DELETE SET NULL, so the server clears the day for us.
    setSchedule(prev => prev.map(s =>
      s.routine_id === id ? { ...s, routine_id: null, routines: null } : s,
    ));
    void supabase.from('routines').delete().eq('id', id);
  }

  function assignDay(day_of_week: number, routine_id: string | null) {
    if (routine_id === null) {
      setSchedule(prev => prev.filter(s => s.day_of_week !== day_of_week));
      void supabase.from('schedule').delete()
        .eq('user_id', userId).eq('day_of_week', day_of_week);
      return;
    }

    const routine = routines.find(r => r.id === routine_id) ?? null;
    setSchedule(prev => {
      const entry: ScheduleDay = {
        id: prev.find(s => s.day_of_week === day_of_week)?.id ?? `schedule-${day_of_week}`,
        user_id: userId,
        day_of_week,
        routine_id,
        routines: routine,
      };
      return prev.some(s => s.day_of_week === day_of_week)
        ? prev.map(s => (s.day_of_week === day_of_week ? entry : s))
        : [...prev, entry];
    });

    void supabase.from('schedule').upsert(
      { user_id: userId, day_of_week, routine_id },
      { onConflict: 'user_id,day_of_week' },
    );
  }

  return { routines, schedule, addRoutine, updateRoutine, deleteRoutine, assignDay };
}
