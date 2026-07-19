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

/**
 * Open a Chess.com game.
 * @param {{
 *   viewOnly?: boolean,
 *   focusPly?: number|null,
 *   focusSan?: string|null,
 *   focusPiece?: string|null,
 *   focusMoveNumber?: number|null,
 * }} [options]
 *   viewOnly — board + moves only; skip brilliance / game-review analysis.
 *   focusPly — 0-based ply to jump to / highlight (e.g. pioneer sacrifice).
 */
export function openChessComGame(navigate, userId, game, options = {}) {
  const profileUsername = decodeURIComponent(userId || '');
  const gameId = saveChessComGame(profileUsername, game);
  const viewOnly = Boolean(options.viewOnly);
  const focusPly =
    options.focusPly != null && Number.isFinite(Number(options.focusPly))
      ? Number(options.focusPly)
      : null;
  const params = new URLSearchParams();
  if (viewOnly) params.set('viewOnly', '1');
  if (focusPly != null) params.set('sacPly', String(focusPly));
  if (options.focusSan) params.set('sacSan', String(options.focusSan));
  if (options.focusPiece) params.set('sacPiece', String(options.focusPiece));
  if (options.focusMoveNumber != null && Number.isFinite(Number(options.focusMoveNumber))) {
    params.set('sacMove', String(options.focusMoveNumber));
  }
  const qs = params.toString();
  navigate(`/players/${encodeURIComponent(profileUsername)}/game/${gameId}${qs ? `?${qs}` : ''}`, {
    state: {
      game,
      viewOnly,
      focusPly,
      focusSan: options.focusSan || null,
      focusPiece: options.focusPiece || null,
      focusMoveNumber: options.focusMoveNumber ?? null,
    },
  });
}
