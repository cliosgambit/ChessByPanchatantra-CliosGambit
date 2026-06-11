import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchTable } from '../lib/supabase/crud';
import {
  fetchLoginUsers,
  subscribeToLoginUsers,
  unsubscribeChannel,
  createLoginUser,
  updateLoginUser,
  deleteLoginUser,
  pauseLoginUser,
  formatRoleLabel,
  resolveLoginRole,
} from './loginService';

export { formatRoleLabel, resolveLoginRole };

function col(row, ...keys) {
  if (!row) return null;
  for (const key of keys) {
    if (row[key] != null) return row[key];
  }
  return null;
}

function formatDisplayDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Loads supplemental profile fields for the user details drawer. */
export async function fetchUserProfileDetails(chessComId, email) {
  const empty = {
    createdAt: null,
    lastLogin: null,
    phone: null,
    joiningDate: null,
    rapidRating: null,
    blitzRating: null,
    bulletRating: null,
    lastSyncedAt: null,
  };

  if (!chessComId && !email) return empty;

  try {
    let playerRow = null;
    let userRow = null;

    if (isSupabaseConfigured() && supabase) {
      const requests = [];

      if (chessComId) {
        requests.push(
          supabase
            .from('players')
            .select(
              'Joining_Date, rapid_rating, blitz_rating, bullet_rating, chess_last_synced_at'
            )
            .ilike('Chess_com_ID', chessComId)
            .maybeSingle()
        );
      } else {
        requests.push(Promise.resolve({ data: null }));
      }

      if (email) {
        requests.push(
          supabase
            .from('users')
            .select('created_at, is_active')
            .ilike('email', email)
            .maybeSingle()
            .then((res) => res)
            .catch(() => ({ data: null }))
        );
      } else {
        requests.push(Promise.resolve({ data: null }));
      }

      const [playerRes, userRes] = await Promise.all(requests);
      playerRow = playerRes.data;
      userRow = userRes.data;
    } else {
      const players = chessComId ? await fetchTable('players').catch(() => []) : [];
      let users = [];
      if (email) {
        try {
          users = await fetchTable('users');
        } catch {
          users = [];
        }
      }

      playerRow = (players || []).find((row) =>
        String(col(row, 'Chess_com_ID', 'chess_com_id')).toLowerCase() === String(chessComId).toLowerCase()
      );
      userRow = (users || []).find(
        (row) => String(col(row, 'email')).toLowerCase() === String(email).toLowerCase()
      );
    }

    return {
      createdAt: formatDisplayDate(col(userRow, 'created_at')),
      lastLogin: null,
      phone: null,
      joiningDate: formatDisplayDate(col(playerRow, 'Joining_Date', 'joining_date')),
      rapidRating: col(playerRow, 'rapid_rating') ?? null,
      blitzRating: col(playerRow, 'blitz_rating') ?? null,
      bulletRating: col(playerRow, 'bullet_rating') ?? null,
      lastSyncedAt: formatDateTime(col(playerRow, 'chess_last_synced_at')),
    };
  } catch (err) {
    console.warn('[usersService] fetchUserProfileDetails failed:', err.message);
    return empty;
  }
}

/** @typedef {import('../types').AppUser} AppUser */

export async function fetchUsers() {
  return fetchLoginUsers();
}

export function subscribeToUsers(callbacks) {
  return subscribeToLoginUsers(callbacks);
}

export { unsubscribeChannel, createLoginUser, updateLoginUser, deleteLoginUser, pauseLoginUser };
