import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchTableList() {
  return apiFetch('/api/tables', { headers: authHeaders() });
}

export async function fetchTablePreview(tableName, limit = 50) {
  const encoded = encodeURIComponent(tableName);
  return apiFetch(`/api/tables/${encoded}?limit=${limit}`, {
    headers: authHeaders(),
  });
}
