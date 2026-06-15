import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import { isSupabaseDirectEnabled } from './supabase/config';

const supabaseUrl = env('SUPABASE_URL')?.trim();
const supabaseAnonKey = env('SUPABASE_ANON_KEY')?.trim();

/** Only created when VITE_USE_SUPABASE_DIRECT=true and anon key is valid. */
export const supabase =
  isSupabaseDirectEnabled() && supabaseUrl
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
