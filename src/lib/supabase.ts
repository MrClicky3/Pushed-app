import { createClient } from '@supabase/supabase-js';
import { getDeviceId } from './device';

export const deviceId = getDeviceId();

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. Copy .env.example ' +
      'to .env and fill both in (or set them in your host\'s environment panel), ' +
      'then restart the dev server.'
  );
}

export const supabase = createClient(
  url,
  anonKey,
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
