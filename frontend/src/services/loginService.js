import { col, normalizeKeys } from '../lib/supabase/columnMapper';
import { fetchTable } from '../lib/supabase/crud';
import { subscribeToTable, unsubscribeChannel } from '../lib/supabase/realtime';
import api from './authService';

export const LOGIN_TABLE = 'Login';

const LOGIN_SELECT = 'id, Player_Name, email, Role, created_at';

const LOGIN_KEY_MAP = {
  id: ['id'],
  Player_Name: ['Player_Name', 'player_name'],
  email: ['email'],
  Role: ['Role', 'role'],
};

/** Maps UI role + status to Login.Role (paused users store Role as "paused"). */
export function resolveLoginRole(role, status) {
  const normalizedStatus = (status || 'ACTIVE').toUpperCase();
  if (normalizedStatus === 'PAUSED') return 'paused';
  return (role || 'student').toLowerCase();
}

export function formatRoleLabel(role) {
  if (!role) return 'Student';
  const normalized = String(role).toLowerCase();
  if (normalized === 'paused') return 'Paused';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function normalizeLoginRow(row) {
  return normalizeKeys(row, LOGIN_KEY_MAP);
}

/** Maps Login table row → app user shape (email is the account key). */
export function mapLoginToAppUser(row) {
  const n = normalizeLoginRow(row);
  if (!n?.email) return null;

  const roleRaw = (n.Role || 'student').toLowerCase();
  const isPaused = roleRaw === 'paused';

  return {
    id: n.id != null ? String(n.id) : n.email,
    name: n.Player_Name || n.email,
    email: n.email,
    role: isPaused ? 'Student' : formatRoleLabel(n.Role),
    roleRaw: isPaused ? 'student' : roleRaw,
    status: isPaused ? 'PAUSED' : 'ACTIVE',
  };
}

export async function fetchLoginUsers() {
  const rows = await fetchTable(LOGIN_TABLE, {
    select: LOGIN_SELECT,
    orderBy: 'Player_Name',
    ascending: true,
  });
  return rows.map(mapLoginToAppUser).filter(Boolean);
}

export function subscribeToLoginUsers({ onInsert, onUpdate, onDelete, onError }) {
  return subscribeToTable(LOGIN_TABLE, 'public:login-admin', {
    onInsert: (raw) => onInsert?.(mapLoginToAppUser(raw)),
    onUpdate: (raw) => onUpdate?.(mapLoginToAppUser(raw)),
    onDelete: (old) => onDelete?.(col(old, 'email')),
    onError,
  });
}

export { unsubscribeChannel };

/** Secured writes via backend (password hashing). Requires admin JWT. */
export async function createLoginUser(payload) {
  const { data } = await api.post('/admin/login-users', payload);
  return data;
}

export async function updateLoginUser(email, payload) {
  const { data } = await api.put(`/admin/login-users/${encodeURIComponent(email)}`, payload);
  return data;
}

export async function deleteLoginUser(email) {
  await api.delete(`/admin/login-users/${encodeURIComponent(email)}`);
}

export async function pauseLoginUser(email, paused = true) {
  return updateLoginUser(email, { Role: paused ? 'paused' : 'student' });
}
