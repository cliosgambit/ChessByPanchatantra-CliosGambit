import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders(json = true) {
  const token = getStoredToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchBatches({ q = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const qs = params.toString();
  return apiFetch(`/api/batches${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function fetchBatch(id) {
  return apiFetch(`/api/batches/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createBatch(payload) {
  return apiFetch('/api/batches', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateBatch(id, payload) {
  return apiFetch(`/api/batches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteBatch(id) {
  return apiFetch(`/api/batches/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function addStudentsToBatch(batchId, studentIds) {
  return apiFetch(`/api/batches/${encodeURIComponent(batchId)}/students`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ student_ids: studentIds }),
  });
}

export async function removeStudentFromBatch(batchId, studentId) {
  return apiFetch(
    `/api/batches/${encodeURIComponent(batchId)}/students/${encodeURIComponent(studentId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
}
