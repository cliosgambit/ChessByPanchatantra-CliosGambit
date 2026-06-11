import axios from 'axios';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const REMEMBER_KEY = 'rememberMe';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthHeader(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function persistSession(token, user, rememberMe = false) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(REMEMBER_KEY, rememberMe ? '1' : '0');
  setAuthHeader(token);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  setAuthHeader(null);
}

const storedToken = getStoredToken();
if (storedToken) {
  setAuthHeader(storedToken);
}

export async function loginRequest(email, password, rememberMe = false) {
  const { data } = await api.post('/auth/login', { email, password, rememberMe });
  return data;
}

export async function logoutRequest() {
  try {
    await api.post('/auth/logout');
  } catch {
    /* client session cleared regardless */
  }
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me');
  return data.user;
}

export function getRoleHomePath(role) {
  const r = (role || '').toLowerCase();
  if (r === 'admin') return '/dashboard';
  if (r === 'coach') return '/coach-dashboard';
  if (r === 'student') return '/student-dashboard';
  return '/dashboard';
}

export default api;
