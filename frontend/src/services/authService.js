import axios from 'axios';
import { BACKEND_UNAVAILABLE_MSG } from '../utils/apiFetch';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const REMEMBER_KEY = 'rememberMe';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    if (!error.response) {
      error.message = BACKEND_UNAVAILABLE_MSG;
    } else if (error.response.status === 503 && data?.code === 'BACKEND_UNAVAILABLE') {
      error.message = data.error || BACKEND_UNAVAILABLE_MSG;
    } else if (data?.error) {
      error.message = data.error;
    } else if (data?.message) {
      error.message = data.message;
    }
    return Promise.reject(error);
  }
);

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

export async function sendPasswordResetOtp(email) {
  const { data } = await api.post('/auth/send-otp', { email });
  return data;
}

export async function resetPasswordWithOtp(email, otp, password) {
  const { data } = await api.post('/auth/verify-set-password', { email, otp, password });
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

export function getRoleHomePath(_role) {
  return '/modules';
}

export default api;
