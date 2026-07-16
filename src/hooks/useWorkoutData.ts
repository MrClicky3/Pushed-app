import { useState, useEffect, useCallback } from 'react';
import { supabase, deviceId } from '../lib/supabase';
import type { Exercise, WorkoutLog, SetType, LoadType } from '../types';

// Client-side fallback for exercises.load_type: if that column isn't in the
// database yet (migration not applied), writes strip it and the type would
// revert to 'weighted' on edit. We mirror the chosen load_type in localStorage
// keyed by exercise id so bodyweight / weighted-BW sticks regardless; the DB
// value still wins whenever it is present.
const LOAD_TYPE_KEY = 'exercise_load_types';

function loadLoadTypeMap(): Record<string, LoadType> {
  try {
    return JSON.parse(localStorage.getItem(LOAD_TYPE_KEY) || '{}');
  } catch {
    return {};
  }
}

function rememberLoadType(id: string, lt?: LoadType) {
  if (!id || !lt) return;
  try {
    const m = loadLoadTypeMap();
    m[id] = lt;
    localStorage.setItem(LOAD_TYPE_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function withLoadType(e: Exercise): Exercise {
  if (e.load_type) return e;
  const lt = loadLoadTypeMap()[e.id];
  return lt ? { ...e, load_type: lt } : e;
}

// True once we detect the set_type column is missing (migration not yet run) —
// subsequent writes skip the column so logging keeps working.
let setTypeColumnMissing = false;

function isMissingSetTypeColumn(error: { message?: string } | null): boolean {
  return !!error?.message && /set_type/.test(error.message);
}

// True when the exercises.load_type migration hasn't been applied yet — writes
// retry without the column so adding/editing exercises keeps working.
function isMissingLoadType(error: { message?: string } | null): boolean {
  return !!error?.message && /load_type/.test(error.message);
}

export function useWorkoutData(userId: string) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExercises = useCallback(async () => {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    if (data) setExercises((data as Exercise[]).map(withLoadType));
  }, [userId]);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('workout_logs')
      .select('*, exercises(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setLogs(data);
  }, [userId]);

  useEffect(() => {
    Promise.all([fetchExercises(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchExercises, fetchLogs]);

  async function addExercise(input: Omit<Exercise, 'id' | 'device_id' | 'created_at'>): Promise<Exercise | null> {
    const row = { ...input, device_id: deviceId, user_id: userId };
    let { data, error } = await supabase.from('exercises').insert(row).select().single();
    if (error && isMissingLoadType(error)) {
      const { load_type, ...rest } = row;
      ({ data } = await supabase.from('exercises').insert(rest).select().single());
    }
    if (data) {
      rememberLoadType(data.id, input.load_type);
      const e = withLoadType(data as Exercise);
      setExercises(prev => [...prev, e]);
      return e;
    }
    return null;
  }

  async function updateExercise(id: string, input: Partial<Exercise>) {
    let { data, error } = await supabase.from('exercises').update(input).eq('id', id).select().single();
    if (error && isMissingLoadType(error)) {
      const { load_type, ...rest } = input;
      ({ data } = await supabase.from('exercises').update(rest).eq('id', id).select().single());
    }
    if (data) {
      if (input.load_type) rememberLoadType(id, input.load_type);
      const e = withLoadType(data as Exercise);
      setExercises(prev => prev.map(x => x.id === id ? e : x));
    }
  }

  async function deleteExercise(id: string) {
    await supabase.from('exercises').delete().eq('id', id);
    setExercises(prev => prev.filter(e => e.id !== id));
    setLogs(prev => prev.filter(l => l.exercise_id !== id));
  }

  async function addLog(input: { exercise_id: string; reps_done: number; weight: number; sets: number; comment: string; set_type?: SetType }) {
    const { set_type, ...rest } = input;
    const row = { ...rest, device_id: deviceId, user_id: userId };
    const payload = setTypeColumnMissing || !set_type ? row : { ...row, set_type };
    let { data, error } = await supabase
      .from('workout_logs')
      .insert(payload)
      .select('*, exercises(*)')
      .single();
    if (error && isMissingSetTypeColumn(error)) {
      setTypeColumnMissing = true;
      ({ data } = await supabase.from('workout_logs').insert(row).select('*, exercises(*)').single());
    }
    if (data) setLogs(prev => [{ ...data, set_type: data.set_type ?? set_type }, ...prev]);
  }

  async function updateLog(id: string, input: { reps_done: number; weight: number; sets: number; comment: string; set_type?: SetType }) {
    const { set_type, ...rest } = input;
    const payload = setTypeColumnMissing || !set_type ? rest : { ...rest, set_type };
    let { data, error } = await supabase
      .from('workout_logs')
      .update(payload)
      .eq('id', id)
      .select('*, exercises(*)')
      .single();
    if (error && isMissingSetTypeColumn(error)) {
      setTypeColumnMissing = true;
      ({ data } = await supabase.from('workout_logs').update(rest).eq('id', id).select('*, exercises(*)').single());
    }
    if (data) setLogs(prev => prev.map(l => l.id === id ? { ...data, set_type: data.set_type ?? set_type } : l));
  }

  async function deleteLog(id: string) {
    await supabase.from('workout_logs').delete().eq('id', id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }

  return { exercises, logs, loading, addExercise, updateExercise, deleteExercise, addLog, updateLog, deleteLog };
}
