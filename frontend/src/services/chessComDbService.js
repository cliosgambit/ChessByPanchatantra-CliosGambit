import { apiFetch } from '../utils/apiFetch';

const API_BASE = '/api/chess-com';

export async function syncChessComPlayer(username) {
  return apiFetch(`${API_BASE}/sync/${encodeURIComponent(username)}`, { method: 'POST' });
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

export async function fetchChessComMonthlyGamesFromDb(username, { months = 12, perMonth = 8 } = {}) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/monthly-games?months=${months}&perMonth=${perMonth}&previewPgn=true`
  );
}

export async function fetchChessComRatingHistoryFromDb(username, { months = 3 } = {}) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/rating-history?months=${months}`
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

export async function runChessComGameBrilliance(username, uuid, { force = false } = {}) {
  return apiFetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/brilliance/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }
  );
}

export async function fetchBrilliantMovesFromDb({ limit = 500 } = {}) {
  return apiFetch(`${API_BASE}/brilliant-moves?limit=${limit}`);
}

export async function fetchBrilliantMoveFromDb(moveId) {
  return apiFetch(`${API_BASE}/brilliant-moves/${encodeURIComponent(moveId)}`);
}

export async function fetchBrilliantPuzzlesFromDb({ limit = 2000 } = {}) {
  return apiFetch(`${API_BASE}/brilliant-puzzles?limit=${limit}`);
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
