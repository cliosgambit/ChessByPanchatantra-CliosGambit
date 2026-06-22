const GAME_STORAGE_PREFIX = 'chesscom-game:';

export function getChessComGameId(game) {
  if (game?.uuid) return game.uuid;
  if (game?.gameUrl) {
    const match = String(game.gameUrl).match(/\/(\d+)$/);
    if (match) return match[1];
  }
  return encodeURIComponent(`${game?.date}-${game?.white}-${game?.black}`);
}

export function saveChessComGame(userId, game) {
  const gameId = getChessComGameId(game);
  const key = `${GAME_STORAGE_PREFIX}${userId}:${gameId}`;
  try {
    sessionStorage.setItem(key, JSON.stringify(game));
  } catch (err) {
    console.warn('Could not cache game in sessionStorage', err);
  }
  return gameId;
}

export function loadChessComGame(userId, gameId) {
  const key = `${GAME_STORAGE_PREFIX}${userId}:${gameId}`;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function openChessComGame(navigate, userId, game) {
  const profileUsername = decodeURIComponent(userId || '');
  const gameId = saveChessComGame(profileUsername, game);
  navigate(`/players/${encodeURIComponent(profileUsername)}/game/${gameId}`, { state: { game } });
}
