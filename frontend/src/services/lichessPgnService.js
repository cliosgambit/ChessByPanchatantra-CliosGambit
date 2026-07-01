import api from './authService';

export async function importCustomPgn(pgnText, filename = 'custom_game.pgn') {
  const { data } = await api.post('/lichess-pgns/custom/import', {
    pgn_text: pgnText,
    filename,
  });
  return data;
}

export async function runLichessBrilliance(gameId, { force = false } = {}) {
  const { data } = await api.post(`/lichess-pgns/games/${gameId}/brilliance/run`, { force });
  return data;
}

export async function fetchLichessGame(gameId) {
  const { data } = await api.get(`/lichess-pgns/games/${gameId}`);
  return data;
}

export function mapLichessGameForViewer(imported) {
  if (!imported) return null;
  let meta = imported.pgn_metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  meta = meta || {};

  return {
    pgn: imported.clean_pgn,
    white: meta.White || 'White',
    black: meta.Black || 'Black',
    whiteRating: meta.WhiteElo ?? meta.WhiteRating ?? null,
    blackRating: meta.BlackElo ?? meta.BlackRating ?? null,
    moves: imported.move_count,
    timeControl: meta.TimeControl || 'Custom PGN',
    rated: false,
    resultNotation: meta.Result || '*',
    resultType: 'neutral',
    isWhite: true,
  };
}
