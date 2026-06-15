const syncService = require('../services/chessComSyncService');

exports.syncPlayer = async (req, res) => {
  try {
    const username = req.params.username;
    if (!username?.trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }
    const forceFull = req.query.full === 'true';
    const result = await syncService.syncPlayerFromChessCom(username, { forceFull });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Chess.com sync error:', err);
    res.status(500).json({ error: err.message || 'Sync failed.' });
  }
};

exports.getBundle = async (req, res) => {
  try {
    const username = req.params.username;
    const forceSync = req.query.forceSync === 'true' || req.query.sync === 'true';
    const bundle = await syncService.getBundle(username, { forceSync });
    res.json(bundle);
  } catch (err) {
    console.error('Chess.com bundle error:', err);
    res.status(500).json({ error: err.message || 'Failed to load profile bundle.' });
  }
};

exports.getGame = async (req, res) => {
  try {
    const { username, uuid } = req.params;
    const game = await syncService.getGameByUuid(username, uuid);
    if (!game) {
      return res.status(404).json({ error: 'Game not found in database.' });
    }
    const moves = await syncService.getMovesForGame(username, uuid);
    res.json({ game: { ...game, moveHistory: moves, moveCount: moves.length } });
  } catch (err) {
    console.error('Chess.com game error:', err);
    res.status(500).json({ error: err.message || 'Failed to load game.' });
  }
};

exports.getGameMoves = async (req, res) => {
  try {
    const { username, uuid } = req.params;
    const moves = await syncService.getMovesForGame(username, uuid);
    res.json({ moves, count: moves.length });
  } catch (err) {
    console.error('Chess.com moves error:', err);
    res.status(500).json({ error: err.message || 'Failed to load moves.' });
  }
};

exports.getGames = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 200);
    const result = await syncService.getRecentGames(req.params.username, limit);
    res.json(result);
  } catch (err) {
    console.error('Chess.com games list error:', err);
    res.status(500).json({ error: err.message || 'Failed to load games.' });
  }
};
