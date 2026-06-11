import { getSupabaseConfigError, isBackendDataProxyEnabled } from './config';

export class SupabaseConfigError extends Error {
  constructor(message) {
    super(message || getSupabaseConfigError());
    this.name = 'SupabaseConfigError';
  }
}

export function isNonRetryableError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('invalid api key') ||
    msg.includes('not configured') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('401')
  );
}

export function requireSupabase() {
  if (isBackendDataProxyEnabled()) return;
  const err = getSupabaseConfigError();
  if (err) throw new SupabaseConfigError(err);
}

export function handleSupabaseError(error, context = 'Supabase operation') {
  if (!error) return null;
  const message = error.message || `${context} failed`;
  console.error(`[${context}]`, error);

  if (message.toLowerCase().includes('invalid api key')) {
    return new Error(getSupabaseConfigError());
  }
  return new Error(message);
}
