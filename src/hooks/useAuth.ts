import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, deviceId } from '../lib/supabase';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

const CLAIMED_KEY = 'device_data_claimed';

async function claimDeviceData() {
  if (localStorage.getItem(CLAIMED_KEY)) return;
  try {
    await supabase.rpc('claim_device_data', { p_device_id: deviceId });
    localStorage.setItem(CLAIMED_KEY, '1');
  } catch {
    // non-fatal
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<AuthState>('loading');
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setState(session ? 'authenticated' : 'unauthenticated');
      if (session) claimDeviceData();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setState(session ? 'authenticated' : 'unauthenticated');
      if (session && event === 'SIGNED_IN') claimDeviceData();
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'USER_UPDATED') setPasswordRecovery(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signUp(email: string, password: string, name?: string): Promise<string | null> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://progressive-overloadtracker.vercel.app',
        ...(name?.trim() ? { data: { name: name.trim() } } : {}),
      },
    });
    return error?.message ?? null;
  }

  async function resendConfirmation(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: 'https://progressive-overloadtracker.vercel.app' },
    });
    return error?.message ?? null;
  }

  async function verifyOtp(email: string, token: string): Promise<string | null> {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' });
    return error?.message ?? null;
  }

  async function resetPassword(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://progressive-overloadtracker.vercel.app',
    });
    return error?.message ?? null;
  }

  async function updatePassword(newPassword: string): Promise<string | null> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setPasswordRecovery(false);
    return error?.message ?? null;
  }

  async function signInWithGoogle(): Promise<string | null> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateUserName(name: string): Promise<string | null> {
    const { data, error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
    if (data.user) setUser(data.user);
    return error?.message ?? null;
  }

  const userName: string = user?.user_metadata?.name ?? '';

  return {
    user, state, passwordRecovery,
    signIn, signUp, signOut, signInWithGoogle,
    resendConfirmation, verifyOtp,
    resetPassword, updatePassword,
    userName, updateUserName,
  };
}
