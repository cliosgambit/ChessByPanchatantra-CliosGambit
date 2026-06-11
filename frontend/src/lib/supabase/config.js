const PLACEHOLDER_PATTERNS = [
  'PASTE_YOUR_ANON_KEY_HERE',
  'your-anon-public-key',
  'your_anon_key',
  'REPLACE_ME',
];

export function isValidSupabaseAnonKey(key) {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length < 80) return false;
  if (PLACEHOLDER_PATTERNS.some((p) => trimmed.toUpperCase().includes(p.toUpperCase()))) {
    return false;
  }
  return trimmed.startsWith('eyJ');
}

/** Direct Supabase JS client is opt-in only. */
export function isSupabaseDirectEnabled() {
  return (
    process.env.REACT_APP_USE_SUPABASE_DIRECT === 'true' &&
    isValidSupabaseAnonKey(process.env.REACT_APP_SUPABASE_ANON_KEY)
  );
}

export function getSupabaseConfigError() {
  if (!isSupabaseDirectEnabled()) {
    return null;
  }
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return 'REACT_APP_USE_SUPABASE_DIRECT=true but URL or anon key is missing.';
  }
  if (!isValidSupabaseAnonKey(key)) {
    return 'REACT_APP_USE_SUPABASE_DIRECT=true but anon key is invalid.';
  }
  return null;
}

/**
 * Admin app uses backend /api/data by default (same Postgres as Supabase).
 * Set REACT_APP_USE_SUPABASE_DIRECT=true + valid anon key to use Supabase JS client.
 */
export function isBackendDataProxyEnabled() {
  const useProxy = !isSupabaseDirectEnabled();
  if (useProxy && !isBackendDataProxyEnabled._logged) {
    console.info(
      '[Data] Using backend /api/data proxy. Set REACT_APP_USE_SUPABASE_DIRECT=true with a valid anon key for direct Supabase.'
    );
    isBackendDataProxyEnabled._logged = true;
  }
  return useProxy;
}
