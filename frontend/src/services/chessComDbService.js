const API_BASE = '/api/chess-com';

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function syncChessComPlayer(username) {
  const response = await fetch(`${API_BASE}/sync/${encodeURIComponent(username)}`, {
    method: 'POST',
  });
  return parseJson(response);
}

export async function fetchChessComBundle(username, { forceSync = false } = {}) {
  const params = forceSync ? '?forceSync=true' : '';
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(username)}/bundle${params}`
  );
  return parseJson(response);
}

export async function fetchChessComGameMovesFromDb(username, uuid) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}/moves`
  );
  return parseJson(response);
}

export async function fetchChessComGameFromDb(username, uuid) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(username)}/games/${encodeURIComponent(uuid)}`
  );
  const data = await parseJson(response);
  return data.game;
}

export async function fetchChessComGamesFromDb(username, limit = 25) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(username)}/games?limit=${limit}`
  );
  return parseJson(response);
}
