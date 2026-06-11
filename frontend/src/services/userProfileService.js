import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchTable } from '../lib/supabase/crud';
import { mapLoginToAppUser } from './loginService';
import { fetchChessComBundle } from './chessComApiService';

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

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseActivityTracker(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function countGamesThisMonth(activityTracker) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return Object.entries(activityTracker).reduce((sum, [dateKey, entry]) => {
    if (!dateKey.startsWith(monthPrefix) || typeof entry !== 'object') return sum;
    return sum + (Number(entry.total_games) || 0);
  }, 0);
}

function summarizeActivityTracker(activityTracker) {
  const totals = { Rapid: 0, Blitz: 0, Bullet: 0 };
  Object.values(activityTracker).forEach((entry) => {
    if (!entry?.types) return;
    Object.entries(entry.types).forEach(([type, data]) => {
      const ratings = Array.isArray(data?.ratings) ? data.ratings.length : 0;
      totals[type] = (totals[type] || 0) + ratings;
    });
  });

  const mostActive = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  return {
    gamesThisMonth: countGamesThisMonth(activityTracker),
    mostActiveTimeControl: mostActive?.[1] ? mostActive[0] : null,
  };
}

function buildRatingHistory(activityRows) {
  return (activityRows || [])
    .map((row) => {
      const rapidRatings = parseJsonArray(col(row, 'rapid_rating'));
      const blitzRatings = parseJsonArray(col(row, 'blitz_rating'));
      return {
        date: col(row, 'date'),
        rapid: rapidRatings.length ? Number(rapidRatings[rapidRatings.length - 1]) : null,
        blitz: blitzRatings.length ? Number(blitzRatings[blitzRatings.length - 1]) : null,
      };
    })
    .filter((point) => point.date && (point.rapid != null || point.blitz != null))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function equalsIgnoreCase(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

async function queryLoginByChessId(chessComId) {
  if (!chessComId) return null;
  const select = 'Chess_com_ID, Player_Name, email, Role';

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('Login')
      .select(select)
      .ilike('Chess_com_ID', chessComId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const rows = await fetchTable('Login', { select, orderBy: 'Player_Name' });
  return (rows || []).find((row) => equalsIgnoreCase(col(row, 'Chess_com_ID', 'chess_com_id'), chessComId));
}

async function queryPlayerByChessId(chessComId) {
  if (!chessComId) return null;
  const select =
    'Chess_com_ID, Player_Name, Joining_Date, activity_tracker, rapid_rating, rapid_best, blitz_rating, blitz_best, bullet_rating, bullet_best, puzzle_rush_best, tactics_highest, chess_last_synced_at, chess_profile_url, chess_country_url';

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('players')
      .select(select)
      .ilike('Chess_com_ID', chessComId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const rows = await fetchTable('players', { select, orderBy: 'Player_Name' });
  return (rows || []).find((row) => equalsIgnoreCase(col(row, 'Chess_com_ID', 'chess_com_id'), chessComId));
}

async function queryUserByEmail(email) {
  if (!email) return null;

  try {
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('created_at, is_active, role')
        .ilike('email', email)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    const rows = await fetchTable('users', { select: 'created_at, is_active, role, email' });
    return (rows || []).find(
      (row) => String(col(row, 'email')).toLowerCase() === String(email).toLowerCase()
    );
  } catch (err) {
    console.warn('[userProfileService] users table lookup skipped:', err.message);
    return null;
  }
}

async function queryManyByChessId(table, select, filterKey, chessComId) {
  if (!chessComId) return [];

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from(table).select(select).ilike(filterKey, chessComId);
    if (error) throw error;
    return data || [];
  }

  const rows = await fetchTable(table, { select });
  return (rows || []).filter((row) => equalsIgnoreCase(col(row, filterKey), chessComId));
}

export async function fetchLoginUserByChessId(chessComId) {
  const row = await queryLoginByChessId(chessComId);
  return mapLoginToAppUser(row);
}

export async function fetchPlatformUserProfile(chessComId, email) {
  const [playerRow, userRow, activityRows, gameRows, brilliantRows, modules, chapters, stories, principles, puzzles] =
    await Promise.all([
      chessComId ? queryPlayerByChessId(chessComId) : null,
      email ? queryUserByEmail(email) : null,
      chessComId
        ? queryManyByChessId('players_activity', 'date, rapid_rating, blitz_rating', 'Chess_com_ID', chessComId)
        : [],
      chessComId
        ? queryManyByChessId('player_games', 'game_id, game_date, white_player, black_player', 'chess_com_id', chessComId)
        : [],
      chessComId
        ? queryManyByChessId('brilliant_moves', 'id', 'chess_com_id', chessComId)
        : [],
      fetchTable('module', { select: 'module_id' }).catch(() => []),
      fetchTable('chapter', { select: 'chapter_id' }).catch(() => []),
      fetchTable('story', { select: 'story_id' }).catch(() => []),
      fetchTable('principles', { select: 'id' }).catch(() => []),
      fetchTable('chess_puzzle', { select: 'chess_puzzle_id, isdone' }).catch(() => []),
    ]);

  const activityTracker = parseActivityTracker(col(playerRow, 'activity_tracker'));
  const activitySummary = summarizeActivityTracker(activityTracker);
  const ratingHistory = buildRatingHistory(activityRows);
  const puzzlesSolvedGlobal = (puzzles || []).filter((row) => Number(col(row, 'isdone')) === 1).length;

  const countryUrl = col(playerRow, 'chess_country_url');
  const country = countryUrl ? countryUrl.split('/').pop() : null;

  return {
    account: {
      createdAt: formatDisplayDate(col(userRow, 'created_at')),
      lastLogin: null,
      phone: null,
      country: country || null,
      timezone: null,
      joiningDate: formatDisplayDate(col(playerRow, 'Joining_Date', 'joining_date')),
      lastSyncedAt: formatDisplayDate(col(playerRow, 'chess_last_synced_at')),
    },
    activity: {
      lastOnline: null,
      gamesThisMonth: activitySummary.gamesThisMonth,
      storedGames: (gameRows || []).length,
      brilliantMoves: (brilliantRows || []).length,
      mostActiveTimeControl: activitySummary.mostActiveTimeControl,
    },
    curriculum: {
      modulesTotal: (modules || []).length,
      chaptersTotal: (chapters || []).length,
      storiesTotal: (stories || []).length,
      principlesTotal: (principles || []).length,
      puzzlesTotal: (puzzles || []).length,
      modulesCompleted: 0,
      chaptersCompleted: 0,
      storiesCompleted: 0,
      principlesCompleted: 0,
      puzzlesSolved: puzzlesSolvedGlobal,
    },
    puzzles: {
      attempted: null,
      solved: col(playerRow, 'tactics_highest') ? 1 : 0,
      successRate: null,
      averageSolveTime: null,
      puzzleRushBest: col(playerRow, 'puzzle_rush_best'),
      tacticsHighest: col(playerRow, 'tactics_highest'),
    },
    learning: {
      mostActiveModule: null,
      mostActiveChapter: null,
      mostSolvedCategory: activitySummary.mostActiveTimeControl,
    },
    ratingHistory,
    playerRow,
  };
}

export async function fetchFullUserProfile(chessComId) {
  const user = await fetchLoginUserByChessId(chessComId);
  if (!user) return null;

  const canonicalUsername = user.chessComId || user.id;

  const [platform, chessCom] = await Promise.all([
    fetchPlatformUserProfile(canonicalUsername, user.email),
    fetchChessComBundle(canonicalUsername),
  ]);

  return {
    user,
    platform,
    chessCom,
  };
}
