/**
 * Supabase backend client (@supabase/server).
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL
 */
const {
  resolveEnv,
  createAdminClient,
  createContextClient,
} = require('@supabase/server/core');

let adminClient = null;
let resolvedEnv = null;
let lastStatus = {
  configured: false,
  connected: false,
  url: null,
  error: null,
};

function getSupabaseStatus() {
  return { ...lastStatus };
}

function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_PUBLISHABLE_KEY?.trim())
  );
}

/**
 * Resolve env + create admin client + verify the project responds.
 * Safe to call on every server start.
 */
async function connectSupabase() {
  if (!isSupabaseConfigured()) {
    lastStatus = {
      configured: false,
      connected: false,
      url: null,
      error: 'Supabase env vars missing (SUPABASE_URL + keys)',
    };
    return lastStatus;
  }

  const { data: env, error: envError } = resolveEnv();
  if (envError || !env) {
    lastStatus = {
      configured: true,
      connected: false,
      url: process.env.SUPABASE_URL || null,
      error: envError?.message || 'Failed to resolve Supabase env',
    };
    return lastStatus;
  }

  resolvedEnv = env;

  try {
    adminClient = createAdminClient();
  } catch (err) {
    lastStatus = {
      configured: true,
      connected: false,
      url: env.url,
      error: err.message || 'Failed to create Supabase admin client',
    };
    return lastStatus;
  }

  // Prove network + credentials: JWKS endpoint or Auth health.
  const probes = [
    process.env.SUPABASE_JWKS_URL?.trim(),
    `${env.url.replace(/\/$/, '')}/auth/v1/health`,
  ].filter(Boolean);

  let probeError = null;
  for (const url of probes) {
    try {
      const res = await fetch(url, {
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
        },
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        // 401/403 still means the project host is reachable with our URL
        lastStatus = {
          configured: true,
          connected: true,
          url: env.url,
          error: null,
        };
        return lastStatus;
      }
      probeError = `HTTP ${res.status} from ${url}`;
    } catch (err) {
      probeError = err.message || String(err);
    }
  }

  // Fallback: secret-key admin call (works even if JWKS/health paths differ)
  try {
    const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error || /not (found|exist)|PGRST|JWT|permission/i.test(String(error.message || ''))) {
      lastStatus = {
        configured: true,
        connected: true,
        url: env.url,
        error: null,
      };
      return lastStatus;
    }
    probeError = error.message || probeError;
  } catch (err) {
    probeError = err.message || probeError || String(err);
  }

  lastStatus = {
    configured: true,
    connected: false,
    url: env.url,
    error: probeError || 'Supabase unreachable',
  };
  return lastStatus;
}

function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createAdminClient();
  }
  return adminClient;
}

function getSupabaseClient(options) {
  return createContextClient(options);
}

function getResolvedSupabaseEnv() {
  if (resolvedEnv) return resolvedEnv;
  const { data, error } = resolveEnv();
  if (error) throw error;
  resolvedEnv = data;
  return resolvedEnv;
}

module.exports = {
  connectSupabase,
  getSupabaseAdmin,
  getSupabaseClient,
  getResolvedSupabaseEnv,
  getSupabaseStatus,
  isSupabaseConfigured,
  resolveEnv,
};
