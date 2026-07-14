import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders() {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchGmPuzzles({ unused = false, q = '', limit } = {}) {
  const params = new URLSearchParams();
  if (unused) params.set('unused', '1');
  if (q) params.set('q', q);
  if (limit != null) params.set('limit', String(limit));
  const qs = params.toString();
  return apiFetch(`/api/puzzles/gm${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function fetchGmPuzzle(id) {
  return apiFetch(`/api/puzzles/gm/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}
