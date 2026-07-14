import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders(json = true) {
  const token = getStoredToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchStudents({ q = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const qs = params.toString();
  return apiFetch(`/api/students${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function fetchStudent(id) {
  return apiFetch(`/api/students/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createStudent(payload) {
  return apiFetch('/api/students', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateStudent(id, payload) {
  return apiFetch(`/api/students/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateStudentPassword(id, password) {
  return apiFetch(`/api/students/${encodeURIComponent(id)}/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password }),
  });
}

export async function syncAllStudentsChessCom() {
  return apiFetch('/api/students/sync-all', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function deleteStudent(id) {
  return apiFetch(`/api/students/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
