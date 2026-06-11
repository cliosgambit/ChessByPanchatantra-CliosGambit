import { createClient } from '@supabase/supabase-js';
import { isSupabaseDirectEnabled } from './supabase/config';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();

/** Only created when REACT_APP_USE_SUPABASE_DIRECT=true and anon key is valid. */
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
