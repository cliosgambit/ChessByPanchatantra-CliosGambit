const syncService = require('../services/chessComSyncService');

exports.getYesterdaysGames = async (req, res) => {
  try {
    const timeZone = req.query.tz || 'Asia/Kolkata';
    const dayFilter = req.query.day || 'all';
    const result = await syncService.getTrackedGamesByDay({
      dayFilter,
      timeZone,
      attachPreviewPgn: req.query.previewPgn !== 'false',
    });
    res.json({
      ...result,
      syncInProgress: syncService.isYesterdaysSyncInProgress(),
    });
  } catch (err) {
    console.error('Chess.com tracked games error:', err);
    res.status(500).json({ error: err.message || 'Failed to load games.' });
  }
};

exports.syncYesterdaysGames = async (req, res) => {
  try {
    const started = !syncService.isYesterdaysSyncInProgress();
    if (started) {
      syncService.startYesterdaysSyncInBackground();
    }
    const games = await syncService.getTrackedGamesByDay({
      dayFilter: req.query.day || 'all',
      attachPreviewPgn: true,
    });
    res.json({
      ok: true,
      started,
      syncInProgress: true,
      ...games,
    });
  } catch (err) {
    console.error('Chess.com yesterdays sync error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync yesterday games.' });
  }
};

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

exports.getProfile = async (req, res) => {
  try {
    const summary = await syncService.getProfileSummary(req.params.username);
    res.json(summary);
  } catch (err) {
    console.error('Chess.com profile error:', err);
    res.status(500).json({ error: err.message || 'Failed to load profile.' });
  }
};

exports.getArchives = async (req, res) => {
  try {
    const archives = await syncService.getArchives(req.params.username);
    res.json({ archives });
  } catch (err) {
    console.error('Chess.com archives error:', err);
    res.status(500).json({ error: err.message || 'Failed to load archives.' });
  }
};

exports.getClubs = async (req, res) => {
  try {
    const clubs = await syncService.getClubs(req.params.username);
    res.json({ clubs });
  } catch (err) {
    console.error('Chess.com clubs error:', err);
    res.status(500).json({ error: err.message || 'Failed to load clubs.' });
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

exports.getGamePgn = async (req, res) => {
  try {
    const { username, uuid } = req.params;
    const pgn = await syncService.getGamePgn(username, uuid);
    if (!pgn) {
      return res.status(404).json({ error: 'Game PGN not found.' });
    }
    res.json({ pgn });
  } catch (err) {
    console.error('Chess.com game PGN error:', err);
    res.status(500).json({ error: err.message || 'Failed to load game PGN.' });
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
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const includeTotal = req.query.total !== 'false';
    const since = String(req.query.since || '').trim() || null;
    const result = await syncService.getRecentGames(req.params.username, limit, {
      attachPreviewPgn: req.query.previewPgn === 'true',
      includeTotal,
      since,
      offset,
    });
    res.json(result);
  } catch (err) {
    console.error('Chess.com games list error:', err);
    res.status(500).json({ error: err.message || 'Failed to load games.' });
  }
};

exports.getMonthlyGames = async (req, res) => {
  try {
    // months=0 / all → every archive month; perMonth=0 / all → every game in month
    const monthsRaw = String(req.query.months ?? '12').toLowerCase();
    const perMonthRaw = String(req.query.perMonth ?? '8').toLowerCase();
    const months =
      monthsRaw === 'all' || monthsRaw === '0'
        ? 0
        : Math.min(Math.max(Number(monthsRaw) || 12, 1), 240);
    const perMonth =
      perMonthRaw === 'all' || perMonthRaw === '0'
        ? 0
        : Math.min(Math.max(Number(perMonthRaw) || 8, 1), 5000);
    const monthlyGames = await syncService.getMonthlyGames(
      req.params.username,
      months,
      perMonth,
      { attachPreviewPgn: req.query.previewPgn === 'true' }
    );
    res.json({ monthlyGames });
  } catch (err) {
    console.error('Chess.com monthly games error:', err);
    res.status(500).json({ error: err.message || 'Failed to load monthly games.' });
  }
};

exports.getRatingHistory = async (req, res) => {
  try {
    const since = String(req.query.since || '').trim();
    const all = req.query.all === 'true';
    const months = Math.min(Number(req.query.months) || 3, 12);
    const history = await syncService.getRatingHistory(
      req.params.username,
      since ? { since } : all ? { all: true } : { months }
    );
    res.json(history);
  } catch (err) {
    console.error('Chess.com rating history error:', err);
    res.status(500).json({ error: err.message || 'Failed to load rating history.' });
  }
};

exports.getRatingImprovementSince = async (req, res) => {
  try {
    const since = String(req.query.since || '').trim();
    const all = req.query.all === 'true';
    if (!since && !all) {
      return res.status(400).json({
        error: 'Query param "since" (YYYY-MM-DD) or all=true is required.',
      });
    }
    const data = await syncService.getRatingImprovementSince(
      req.params.username,
      all && !since ? { all: true } : { since }
    );
    res.json(data);
  } catch (err) {
    console.error('Chess.com rating improvement error:', err);
    res.status(500).json({ error: err.message || 'Failed to load rating improvement.' });
  }
};

exports.getGameStatsForRange = async (req, res) => {
  try {
    const since = String(req.query.since || '').trim();
    const all = req.query.all === 'true' || !since;
    const data = await syncService.getGameStatsForRange(
      req.params.username,
      all && !since ? {} : { since }
    );
    res.json(data);
  } catch (err) {
    console.error('Chess.com game stats range error:', err);
    res.status(500).json({ error: err.message || 'Failed to load game stats.' });
  }
};

exports.getPlayerAchievements = async (req, res) => {
  try {
    const since = String(req.query.since || '').trim();
    const all = req.query.all === 'true';
    if (!since && !all) {
      return res.status(400).json({
        error: 'Query param "since" (YYYY-MM-DD) or all=true is required.',
      });
    }
    const data = await syncService.getPlayerAchievements(
      req.params.username,
      all && !since ? { all: true } : { since }
    );
    res.json(data);
  } catch (err) {
    console.error('Chess.com achievements error:', err);
    res.status(500).json({ error: err.message || 'Failed to load achievements.' });
  }
};

exports.getWinStreaks = async (req, res) => {
  try {
    const timeZone = req.query.tz || 'Asia/Kolkata';
    const streaks = await syncService.getPlayerWinStreaks(req.params.username, timeZone);
    res.json(streaks);
  } catch (err) {
    console.error('Chess.com win streaks error:', err);
    res.status(500).json({ error: err.message || 'Failed to load win streaks.' });
  }
};

exports.getPlayerGamesByDay = async (req, res) => {
  try {
    const timeZone = req.query.tz || 'Asia/Kolkata';
    const dayFilter = req.query.day || 'yesterday';
    const result = await syncService.getPlayerGamesByDay(req.params.username, {
      dayFilter,
      timeZone,
    });
    res.json(result);
  } catch (err) {
    console.error('Chess.com player games by day error:', err);
    res.status(500).json({ error: err.message || 'Failed to load games for day.' });
  }
};

exports.getBrilliance = async (req, res) => {
  try {
    const { username, uuid } = req.params;
    const game = await syncService.getGameByUuid(username, uuid);
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    const brillianceService = require('../services/chessComBrillianceService');
    const result = await brillianceService.getBrillianceForChessComGame(uuid);
    res.json(result);
  } catch (err) {
    console.error('Chess.com brilliance load error:', err);
    res.status(500).json({ error: err.message || 'Failed to load brilliance analysis.' });
  }
};

exports.runBrilliance = async (req, res) => {
  try {
    const { username, uuid } = req.params;
    const game = await syncService.getGameByUuid(username, uuid);
    if (!game?.pgn) {
      return res.status(404).json({ error: 'Game not found or missing PGN.' });
    }

    const brillianceService = require('../services/chessComBrillianceService');
    const force = req.body?.force === true || req.query.force === 'true';
    const syncOnly = req.body?.syncOnly === true || req.query.syncOnly === 'true';

    if (syncOnly) {
      const result = await brillianceService.syncBrillianceForChessComGame({
        pgn: game.pgn,
        chessComUuid: uuid,
      });
      return res.json(result);
    }

    const result = await brillianceService.runBrillianceForChessComGame({
      pgn: game.pgn,
      chessComUuid: uuid,
      force,
    });

    res.json(result);
  } catch (err) {
    console.error('Chess.com brilliance error:', err);
    res.status(500).json({ error: err.message || 'Brilliance analysis failed.' });
  }
};

exports.getBrilliantMoves = async (req, res) => {
  try {
    const brillianceService = require('../services/chessComBrillianceService');
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const result = await brillianceService.listBrilliantMoves({ limit });
    res.json(result);
  } catch (err) {
    console.error('Chess.com brilliant moves error:', err);
    res.status(500).json({ error: err.message || 'Failed to load brilliant moves.' });
  }
};

exports.getBrilliancePipelineStats = async (req, res) => {
  try {
    const timeZone = req.query.tz || 'Asia/Kolkata';
    const dayFilter = req.query.day || 'all';
    const stats = await syncService.getBrilliancePipelineStats({ dayFilter, timeZone });
    res.json(stats);
  } catch (err) {
    console.error('Chess.com brilliance pipeline stats error:', err);
    res.status(500).json({ error: err.message || 'Failed to load pipeline stats.' });
  }
};

exports.getBrilliantMove = async (req, res) => {
  try {
    const brillianceService = require('../services/chessComBrillianceService');
    const move = await brillianceService.getBrilliantMoveById(req.params.moveId);
    if (!move) {
      res.status(404).json({ error: 'Brilliant move not found.' });
      return;
    }
    res.json(move);
  } catch (err) {
    console.error('Chess.com brilliant move error:', err);
    res.status(500).json({ error: err.message || 'Failed to load brilliant move.' });
  }
};

exports.getBrilliantPuzzles = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const limit = Math.min(Number(req.query.limit) || 2000, 5000);
    const result = await puzzleService.listSavedPuzzles({ limit });
    res.json(result);
  } catch (err) {
    console.error('Brilliant puzzles list error:', err);
    res.status(500).json({ error: err.message || 'Failed to load puzzles.' });
  }
};

exports.getBrilliantPuzzleByMove = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const puzzle = await puzzleService.getPuzzleByMoveId(req.params.moveId);
    res.json({ puzzle });
  } catch (err) {
    console.error('Brilliant puzzle lookup error:', err);
    res.status(500).json({ error: err.message || 'Failed to load puzzle status.' });
  }
};

exports.getBrilliantPuzzleById = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const puzzle = await puzzleService.getPuzzleById(req.params.puzzleId);
    if (!puzzle) {
      res.status(404).json({ error: 'Puzzle not found.' });
      return;
    }
    res.json(puzzle);
  } catch (err) {
    console.error('Brilliant puzzle detail error:', err);
    res.status(500).json({ error: err.message || 'Failed to load puzzle.' });
  }
};

exports.verifyBrilliantPuzzle = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const verifiedBy = req.body?.verifiedBy || req.user?.username || null;
    const puzzle = await puzzleService.verifyBrilliantMove(req.params.moveId, {
      status: req.body?.status,
      verifiedBy,
    });
    res.json({ puzzle });
  } catch (err) {
    console.error('Brilliant puzzle verify error:', err);
    res.status(400).json({ error: err.message || 'Failed to verify brilliant move.' });
  }
};

exports.saveBrilliantPuzzle = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const verifiedBy = req.body?.verifiedBy || req.user?.username || null;
    const puzzle = await puzzleService.saveBrilliantPuzzle(req.params.moveId, { verifiedBy });
    res.json({ puzzle });
  } catch (err) {
    console.error('Brilliant puzzle save error:', err);
    res.status(400).json({ error: err.message || 'Failed to save puzzle.' });
  }
};

exports.unsaveBrilliantPuzzle = async (req, res) => {
  try {
    const puzzleService = require('../services/brilliantMovePuzzleService');
    const puzzle = await puzzleService.unsaveBrilliantPuzzle(req.params.moveId);
    res.json({ puzzle });
  } catch (err) {
    console.error('Brilliant puzzle unsave error:', err);
    res.status(400).json({ error: err.message || 'Failed to remove puzzle.' });
  }
};

/** Proxy Chess.com public random puzzle: https://api.chess.com/pub/puzzle/random
 *  Returns Chess.com payload immediately; persists to DB in the background.
 */
exports.getRandomDailyPuzzle = async (_req, res) => {
  try {
    const { upsertChesscomRandomPuzzle } = require('../services/moralPuzzleService');
    const response = await fetch('https://api.chess.com/pub/puzzle/random', {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CLIO-ChessAcademy/1.0',
      },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: `Chess.com API returned ${response.status}.` });
      return;
    }
    const data = await response.json();
    if (!data?.fen) {
      res.status(502).json({ error: 'Chess.com puzzle response missing FEN.' });
      return;
    }
    // Do not block the client on DB uniqueness / insert.
    res.json(data);
    upsertChesscomRandomPuzzle(data).catch((err) => {
      console.warn('Chess.com puzzle background persist failed:', err.message || err);
    });
  } catch (err) {
    console.error('Chess.com random puzzle error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch Chess.com puzzle.' });
  }
};

/** Persist a Chess.com puzzle payload (unique by FEN). Used after browser-side fetch. */
exports.ingestRandomPuzzle = async (req, res) => {
  try {
    const { upsertChesscomRandomPuzzle } = require('../services/moralPuzzleService');
    const { puzzle, created } = await upsertChesscomRandomPuzzle(req.body || {});
    res.status(created ? 201 : 200).json({
      puzzle: {
        ...puzzle,
        url: puzzle.source_url,
        image: puzzle.image_url,
      },
      created,
    });
  } catch (err) {
    console.error('Chess.com puzzle ingest error:', err);
    res.status(400).json({ error: err.message || 'Failed to save Chess.com puzzle.' });
  }
};

exports.listChesscomRandomPuzzles = async (req, res) => {
  try {
    const db = require('../config/database');
    const unusedOnly = String(req.query.unused || '') === '1' || req.query.unused === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const q = String(req.query.q || '').trim();
    const params = [];
    let sql = `SELECT * FROM chesscom_random_puzzles WHERE 1=1`;
    if (unusedOnly) sql += ` AND is_used = 0`;
    if (q) {
      const like = `%${q}%`;
      params.push(like);
      const a = params.length;
      params.push(like);
      const b = params.length;
      sql += ` AND (fen LIKE $${a} OR IFNULL(title,'') LIKE $${b})`;
    }
    params.push(limit);
    sql += ` ORDER BY id DESC LIMIT $${params.length}`;
    const { rows } = await db.query(sql, params);
    const { mapChesscomRow } = require('../services/moralPuzzleService');
    res.json({ puzzles: rows.map(mapChesscomRow), count: rows.length });
  } catch (err) {
    console.error('Chess.com random list error:', err);
    res.status(500).json({ error: err.message || 'Failed to list puzzles.' });
  }
};
