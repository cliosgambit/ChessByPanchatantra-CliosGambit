import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders(json = true) {
  const token = getStoredToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchLichessPuzzles({ unused = false, q = '', limit } = {}) {
  const params = new URLSearchParams();
  if (unused) params.set('unused', '1');
  if (q) params.set('q', q);
  if (limit != null) params.set('limit', String(limit));
  const qs = params.toString();
  return apiFetch(`/api/puzzles/lichess${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function fetchLichessPuzzle(id) {
  return apiFetch(`/api/puzzles/lichess/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

/** Upload Excel/CSV of Lichess puzzles. */
export async function uploadLichessPuzzlesFile(file) {
  if (!file) throw new Error('No file selected.');
  const body = new FormData();
  body.append('file', file, file.name || 'lichess-puzzles.xlsx');
  return apiFetch('/api/puzzles/lichess/upload', {
    method: 'POST',
    headers: authHeaders(false),
    body,
  });
}
