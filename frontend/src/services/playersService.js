import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchTable } from '../lib/supabase/crud';

export function formatRoleLabel(role) {
  if (!role) return 'Student';
  const normalized = String(role).toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const PLAYERS_SELECT =
  'Chess_com_ID, Player_Name, Joining_Date, activity_tracker, current_elo, rapid_rating, rapid_best, blitz_rating, blitz_best, bullet_rating, bullet_best, chess_last_synced_at, puzzle_rush_best, tactics_highest';

const LOGIN_SELECT = 'Chess_com_ID, email, Role';

/** Reads a column whether PostgREST returns PascalCase or lowercase keys. */
function col(row, ...keys) {
  if (!row) return null;
  for (const key of keys) {
    if (row[key] != null) return row[key];
  }
  return null;
}

function normalizePlayerRow(row) {
  if (!row) return null;
  return {
    Chess_com_ID: col(row, 'Chess_com_ID', 'chess_com_id'),
    Player_Name: col(row, 'Player_Name', 'player_name'),
    Joining_Date: col(row, 'Joining_Date', 'joining_date'),
    activity_tracker: col(row, 'activity_tracker'),
    current_elo: col(row, 'current_elo'),
    rapid_rating: col(row, 'rapid_rating'),
    rapid_best: col(row, 'rapid_best'),
    blitz_rating: col(row, 'blitz_rating'),
    blitz_best: col(row, 'blitz_best'),
    bullet_rating: col(row, 'bullet_rating'),
    bullet_best: col(row, 'bullet_best'),
    chess_last_synced_at: col(row, 'chess_last_synced_at'),
    puzzle_rush_best: col(row, 'puzzle_rush_best'),
    tactics_highest: col(row, 'tactics_highest'),
  };
}

function normalizeLoginRow(row) {
  if (!row) return null;
  return {
    Chess_com_ID: col(row, 'Chess_com_ID', 'chess_com_id'),
    email: col(row, 'email'),
    Role: col(row, 'Role', 'role'),
  };
}


function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDisplayDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatSyncTimestamp(value) {
  if (!value) return 'Not synced';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deriveSyncChange(row) {
  if (row.puzzle_rush_best != null) return `+${row.puzzle_rush_best}P`;
  if (row.tactics_highest != null) return `+${row.tactics_highest}P`;

  const tracker = row.activity_tracker;
  if (!tracker) return '—';

  try {
    const data = typeof tracker === 'string' ? JSON.parse(tracker) : tracker;
    if (Array.isArray(data) && data.length > 0) {
      const last = data[data.length - 1];
      if (last?.points != null) return `+${last.points}P`;
      if (last?.puzzle_points != null) return `+${last.puzzle_points}P`;
    }
  } catch {
    /* ignore malformed tracker JSON */
  }

  return '—';
}

function calcMaxElo(row) {
  const values = [
    row.current_elo,
    row.rapid_best,
    row.blitz_best,
    row.bullet_best,
    row.rapid_rating,
    row.blitz_rating,
    row.bullet_rating,
  ]
    .map(toNumber)
    .filter((n) => n != null);

  if (values.length === 0) return '—';
  return Math.max(...values);
}

/**
 * Maps a Supabase `players` row to the Player Details table shape.
 */
export function mapDbPlayerToAppPlayer(row) {
  const normalized = normalizePlayerRow(row);
  if (!normalized) return null;

  const chessId = normalized.Chess_com_ID;
  if (!chessId) return null;

  return {
    id: chessId,
    chessId,
    name: normalized.Player_Name || chessId,
    ratings: {
      rapid: toNumber(normalized.rapid_rating),
      blitz: toNumber(normalized.blitz_rating),
      bullet: toNumber(normalized.bullet_rating),
    },
    best: {
      rapid: toNumber(normalized.rapid_best),
      blitz: toNumber(normalized.blitz_best),
      bullet: toNumber(normalized.bullet_best),
    },
    maxElo: calcMaxElo(normalized),
    joined: formatDisplayDate(normalized.Joining_Date),
    sync: {
      change: deriveSyncChange(normalized),
      timestamp: formatSyncTimestamp(normalized.chess_last_synced_at),
    },
  };
}

/**
 * Maps a `players` row (+ optional `Login` row) to the Users table shape.
 */
export function mapDbPlayerToAppUser(row, loginRow) {
  const normalized = normalizePlayerRow(row);
  const player = mapDbPlayerToAppPlayer(normalized);
  if (!player) return null;

  const login = normalizeLoginRow(loginRow);
  const email =
    login?.email ||
    (player.chessId ? `${player.chessId}@chess.com` : '—');
  const role = formatRoleLabel(login?.Role || 'student');

  return {
    id: player.id,
    name: player.name,
    email,
    role,
    status: 'ACTIVE',
    created_at: normalized.Joining_Date || null,
  };
}

/** Fetches all rows from public.players, ordered by player name. */
export async function fetchPlayers() {
  const data = await fetchTable('players', { select: PLAYERS_SELECT, orderBy: 'Player_Name' });

  return (data || [])
    .map(mapDbPlayerToAppPlayer)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fetches Login rows keyed by Chess_com_ID for email/role on the Users page. */
export async function fetchLoginByChessId() {
  try {
    const data = await fetchTable('Login', { select: LOGIN_SELECT });
    return Object.fromEntries(
    (data || [])
      .map(normalizeLoginRow)
      .filter((row) => row?.Chess_com_ID)
      .map((row) => [row.Chess_com_ID, row])
    );
  } catch (err) {
    console.warn('[playersService] fetchLoginByChessId failed:', err.message);
    return {};
  }
}

/** Fetches players merged with Login data for the Users admin page. */
export async function fetchUsersFromPlayers() {
  const [players, loginMap] = await Promise.all([
    fetchTable('players', { select: PLAYERS_SELECT, orderBy: 'Player_Name' }),
    fetchLoginByChessId(),
  ]);

  return (players || [])
    .map((row) => {
      const normalized = normalizePlayerRow(row);
      return mapDbPlayerToAppUser(normalized, loginMap[normalized?.Chess_com_ID]);
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Subscribes to INSERT / UPDATE / DELETE on public.players.
 * Returns the channel instance — caller must remove it on unmount.
 */
export function subscribeToPlayers({ onInsert, onUpdate, onDelete, onError }) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const channel = supabase
    .channel('public:players-admin')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'players' },
      (payload) => {
        onInsert?.(mapDbPlayerToAppPlayer(payload.new));
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'players' },
      (payload) => {
        onUpdate?.(mapDbPlayerToAppPlayer(payload.new));
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'players' },
      (payload) => {
        onDelete?.(payload.old?.Chess_com_ID);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[playersService] realtime subscribed to players');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[playersService] realtime channel error:', status, err);
        onError?.(new Error(`Realtime subscription failed: ${status}`));
      }
    });

  return channel;
}

/** Removes a realtime channel and prevents memory leaks. */
export async function unsubscribeChannel(channel) {
  if (!channel || !supabase) return;
  await supabase.removeChannel(channel);
}
