import { createClient } from '@supabase/supabase-js';
import { getDeviceId } from './device';

export const deviceId = getDeviceId();

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'te-auth-token',
    },
    global: {
      headers: { 'x-device-id': deviceId },
    },
  }
);
