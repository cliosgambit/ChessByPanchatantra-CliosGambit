import { apiFetch } from '../utils/apiFetch';

const API_BASE = '/api/chess-com';

export async function syncChessComPlayer(username, { full = false } = {}) {
  const params = full ? '?full=true' : '?full=false';
  return apiFetch(`${API_BASE}/sync/${encodeURIComponent(username)}${params}`, { method: 'POST' });
}

export async function fetchChessComProfileFromDb(username) {
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/profile`);
}

export async function fetchChessComArchivesFromDb(username) {
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/archives`);
}

export async function fetchChessComClubsFromDb(username) {
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/clubs`);
}

export async function fetchChessComBundle(username, { forceSync = false } = {}) {
  const params = forceSync ? '?forceSync=true' : '';
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/bundle${params}`);
}

export async function fetchChessComGameMovesFromDb(username, uuid) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/moves`
  );
}

export async function fetchChessComGamePgnFromDb(username, uuid) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/pgn`
  );
}

export async function fetchChessComGameFromDb(username, uuid) {
  const data = await apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}`
  );
  return data.game;
}

export async function fetchChessComGamesFromDb(username, limit = 25) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games?limit=${limit}&total=false&previewPgn=true`
  );
}

export async function fetchChessComGamesForRange(
  username,
  { since, all = false, limit = 25, offset = 0 } = {}
) {
  const params = new URLSearchParams({
    limit: String(Math.min(Number(limit) || 25, 200)),
    offset: String(Math.max(Number(offset) || 0, 0)),
    total: 'true',
    previewPgn: 'true',
  });
  const sinceDate = String(since || '').trim().slice(0, 10);
  if (!all && sinceDate) {
    params.set('since', sinceDate);
  }
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games?${params.toString()}`
  );
}

export async function fetchChessComMonthlyGamesFromDb(
  username,
  { months = 12, perMonth = 8, previewPgn = true } = {}
) {
  const params = new URLSearchParams({
    months: String(months),
    perMonth: String(perMonth),
    previewPgn: previewPgn ? 'true' : 'false',
  });
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/monthly-games?${params.toString()}`
  );
}

export async function fetchChessComRatingHistoryFromDb(username, { months = 3, since, all = false } = {}) {
  const sinceDate = String(since || '').trim().slice(0, 10);
  if (sinceDate) {
    return apiFetch(
      `${API_BASE}/${encodeURIComponent(username)}/rating-history?since=${encodeURIComponent(sinceDate)}`
    );
  }
  if (all) {
    return apiFetch(
      `${API_BASE}/${encodeURIComponent(username)}/rating-history?all=true`
    );
  }
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/rating-history?months=${months}`
  );
}

export async function fetchChessComRatingImprovementFromDb(username, { since, all = false } = {}) {
  const sinceDate = String(since || '').trim().slice(0, 10);
  if (all || !sinceDate) {
    return apiFetch(
      `${API_BASE}/${encodeURIComponent(username)}/rating-improvement?all=true`
    );
  }
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/rating-improvement?since=${encodeURIComponent(sinceDate)}`
  );
}

export async function fetchChessComGameStatsForRange(username, { since, all = false } = {}) {
  const sinceDate = String(since || '').trim().slice(0, 10);
  if (all || !sinceDate) {
    return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/game-stats?all=true`);
  }
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/game-stats?since=${encodeURIComponent(sinceDate)}`
  );
}

export async function fetchChessComAchievements(username, { since, all = false } = {}) {
  const sinceDate = String(since || '').trim().slice(0, 10);
  if (all || !sinceDate) {
    return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/achievements?all=true`);
  }
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/achievements?since=${encodeURIComponent(sinceDate)}`
  );
}

export async function fetchChessComWinStreaksFromDb(username, { timeZone = 'Asia/Kolkata' } = {}) {
  const params = new URLSearchParams({ tz: timeZone });
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/win-streaks?${params.toString()}`);
}

export async function fetchChessComPlayerGamesByDayFromDb(
  username,
  { day = 'yesterday', timeZone = 'Asia/Kolkata' } = {}
) {
  const params = new URLSearchParams({ day, tz: timeZone });
  return apiFetch(`${API_BASE}/${encodeURIComponent(username)}/games-by-day?${params.toString()}`);
}

export async function fetchAllGamesFromDb({ day = 'all', previewPgn = true } = {}) {
  const params = new URLSearchParams();
  if (day) params.set('day', day);
  params.set('previewPgn', previewPgn ? 'true' : 'false');
  return apiFetch(`${API_BASE}/yesterdays-games?${params.toString()}`);
}

export async function syncAllGamesFromChessCom() {
  return apiFetch(`${API_BASE}/yesterdays-games/sync`, { method: 'POST' });
}

/** @deprecated Use fetchAllGamesFromDb */
export async function fetchYesterdaysGamesFromDb(options) {
  return fetchAllGamesFromDb(options);
}

/** @deprecated Use syncAllGamesFromChessCom */
export async function syncYesterdaysGamesFromChessCom() {
  return syncAllGamesFromChessCom();
}

export async function runChessComGameBrilliance(username, uuid, { force = false, syncOnly = false } = {}) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/brilliance/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force, syncOnly }),
    }
  );
}

export async function fetchChessComGameBrillianceFromDb(username, uuid) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/brilliance`
  );
}

export async function fetchBrilliantMovesFromDb({ limit = 500 } = {}) {
  return apiFetch(`${API_BASE}/brilliant-moves?limit=${limit}`);
}

export async function fetchAchievementsFeedFromDb({
  day = 'today',
  timeZone = 'Asia/Kolkata',
} = {}) {
  const params = new URLSearchParams({ day, tz: timeZone });
  return apiFetch(`${API_BASE}/achievements-feed?${params.toString()}`);
}

export async function fetchBrilliancePipelineStatsFromDb({ day = 'all', timeZone = 'Asia/Kolkata' } = {}) {
  const params = new URLSearchParams({ day, tz: timeZone });
  return apiFetch(`${API_BASE}/brilliance-pipeline-stats?${params.toString()}`);
}

export async function fetchBrilliantMoveFromDb(moveId) {
  return apiFetch(`${API_BASE}/brilliant-moves/${encodeURIComponent(moveId)}`);
}

export async function fetchBrilliantPuzzlesFromDb({ limit = 2000 } = {}) {
  return apiFetch(`${API_BASE}/brilliant-puzzles?limit=${limit}`);
}

function mapChessComPuzzleRaw(raw = {}) {
  return {
    title: raw.title || null,
    fen: raw.fen || null,
    // Chess.com API field is `pgn`; we store/expose it as `solution`.
    solution: raw.solution || raw.pgn || null,
    url: raw.url || raw.source_url || null,
    image: raw.image || raw.image_url || null,
    publish_time: raw.publish_time ?? null,
    comments: raw.comments || null,
  };
}

async function persistChessComPuzzle(raw) {
  const saved = await apiFetch(`${API_BASE}/puzzle/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(raw),
  });
  return {
    ...(saved.puzzle || {}),
    created: saved.created,
    url: saved.puzzle?.url || saved.puzzle?.source_url || raw.url,
    image: saved.puzzle?.image || saved.puzzle?.image_url || raw.image,
    fen: saved.puzzle?.fen || raw.fen,
    title: saved.puzzle?.title || raw.title,
    solution: saved.puzzle?.solution || raw.solution || raw.pgn,
    publish_time: saved.puzzle?.publish_time ?? raw.publish_time,
  };
}

export { persistChessComPuzzle };

/**
 * Random puzzle from Chess.com.
 * Returns the API payload immediately — DB ingest is background by default
 * (Chess.com rotates ~every 10s; no need to wait on uniqueness checks).
 * Pass `{ waitForPersist: true }` when a saved DB id is required (e.g. moral assign).
 */
export async function fetchChessComRandomPuzzle({ waitForPersist = false } = {}) {
  let raw = null;
  try {
    // Browser calls to Chess.com can stall because of network/CORS behavior.
    // Use our backend proxy first; it returns the Chess.com payload immediately.
    raw = await apiFetch(`${API_BASE}/puzzle/random`, { cache: 'no-store' });
    if (!raw?.fen) throw new Error('Chess.com puzzle response missing FEN.');
  } catch (proxyErr) {
    try {
      const res = await fetch('https://api.chess.com/pub/puzzle/random', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Chess.com API returned ${res.status}.`);
      }
      raw = await res.json();
      if (!raw?.fen) throw new Error('Chess.com puzzle response missing FEN.');
    } catch {
      throw proxyErr instanceof Error
        ? proxyErr
        : new Error('Failed to fetch Chess.com random puzzle.');
    }
  }

  const puzzle = mapChessComPuzzleRaw(raw);
  const persistPromise = persistChessComPuzzle(raw).catch((err) => {
    console.warn('Chess.com puzzle persist failed:', err);
    return null;
  });
  puzzle.persistPromise = persistPromise;

  if (waitForPersist) {
    const saved = await persistPromise;
    return saved || puzzle;
  }

  return puzzle;
}

export async function fetchSavedChessComPuzzles({ unused = false, q = '', limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (unused) params.set('unused', '1');
  if (q) params.set('q', q);
  if (limit != null) params.set('limit', String(limit));
  return apiFetch(`${API_BASE}/puzzle/saved?${params.toString()}`, {
    cache: 'no-store',
  });
}

export async function fetchBrilliantPuzzleFromDb(puzzleId) {
  return apiFetch(`${API_BASE}/brilliant-puzzles/by-id/${encodeURIComponent(puzzleId)}`);
}

export async function fetchBrilliantPuzzleByMoveFromDb(moveId) {
  return apiFetch(`${API_BASE}/brilliant-puzzles/by-move/${encodeURIComponent(moveId)}`);
}

export async function verifyBrilliantPuzzle(moveId, status) {
  return apiFetch(`${API_BASE}/brilliant-puzzles/${encodeURIComponent(moveId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function saveBrilliantPuzzle(moveId) {
  return apiFetch(`${API_BASE}/brilliant-puzzles/${encodeURIComponent(moveId)}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function unsaveBrilliantPuzzle(moveId) {
  return apiFetch(`${API_BASE}/brilliant-puzzles/${encodeURIComponent(moveId)}/unsave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}
