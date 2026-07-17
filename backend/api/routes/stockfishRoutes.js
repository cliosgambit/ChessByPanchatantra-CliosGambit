const express = require('express');
const { Chess } = require('chess.js');
const { analyzePosition, getBestMove } = require('../services/stockfishService');

const router = express.Router();

const STOCKFISH_ONLINE_API = 'https://stockfish.online/api/s/v2.php';
const HOSTED_STOCKFISH_API = 'https://stockfish-cbp.onrender.com';
const MAX_ONLINE_DEPTH = 15;
const fetch = (...args) => import('node-fetch').then((mod) => mod.default(...args));

function parseBestMoveUci(bestmove) {
  if (typeof bestmove !== 'string') return null;
  const parts = bestmove.split(/\s+/);
  // Accept both "bestmove e2e4 ponder …" and bare "e2e4"
  if (parts[0] === 'bestmove') {
    if (parts.length < 2 || parts[1] === '(none)') return null;
    return parts[1];
  }
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(parts[0])) return parts[0];
  return null;
}

async function fetchOnlineStockfish(fen, depth = 12) {
  const cappedDepth = Math.min(Math.max(1, Number(depth) || 12), MAX_ONLINE_DEPTH);
  const url = `${STOCKFISH_ONLINE_API}?fen=${encodeURIComponent(fen)}&depth=${cappedDepth}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Online Stockfish HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data || data.success === false) {
    throw new Error('Online Stockfish did not return a successful response.');
  }
  return { ...data, source: 'online' };
}

async function fetchHostedStockfish(fen, depth = 12) {
  const cappedDepth = Math.min(Math.max(1, Number(depth) || 12), 25);
  const res = await fetch(`${HOSTED_STOCKFISH_API}/bestmove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen, depth: cappedDepth }),
  });
  if (!res.ok) {
    const err = new Error(`Hosted Stockfish HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const uci = data?.bestmove;
  if (!uci) {
    throw new Error('Hosted Stockfish did not return a best move.');
  }
  return {
    success: true,
    bestmove: `bestmove ${uci}${data.ponder ? ` ponder ${data.ponder}` : ''}`,
    evaluation: typeof data.cp === 'number' ? data.cp / 100 : null,
    mate: data.mate ?? null,
    source: 'hosted',
    depth: data.depth || cappedDepth,
  };
}

/**
 * Prefer online → hosted → local. Online often 429s under load.
 */
async function resolveBestMove(fen, depth = 15) {
  try {
    return await fetchOnlineStockfish(fen, depth);
  } catch (onlineErr) {
    console.warn(`[STOCKFISH] online failed (${onlineErr.status || onlineErr.message}); trying hosted…`);
    try {
      return await fetchHostedStockfish(fen, depth);
    } catch (hostedErr) {
      console.warn(`[STOCKFISH] hosted failed (${hostedErr.message}); falling back to local…`);
      return await getBestMove(fen, depth);
    }
  }
}

router.post('/analyze', async (req, res) => {
  const body = req.body || {};
  const { depth, movetime, current_fen, previous_fen, multipv } = body;
  const currentFen = current_fen || body.fen || previous_fen;
  const previousFen = previous_fen || body.fen || current_fen;

  if (!currentFen || !previousFen) {
    res.status(400).json({ error: 'Both current_fen and previous_fen are required' });
    return;
  }

  try {
    const response = await analyzePosition({
      currentFen,
      previousFen,
      depth,
      movetime,
      multipv,
    });
    res.json(response);
  } catch (e) {
    console.error('[ANALYZE][ERR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Best move for a FEN — online with hosted/local fallback (avoids CORS + 429). */
router.get('/stockfish/online', async (req, res) => {
  const fen = String(req.query.fen || '').trim();
  const depth = req.query.depth;
  if (!fen) {
    res.status(400).json({ error: 'fen is required' });
    return;
  }
  try {
    const data = await resolveBestMove(fen, depth);
    res.json(data);
  } catch (e) {
    console.error('[STOCKFISH][BESTMOVE][ERR]', e.message);
    res.status(502).json({ error: e.message });
  }
});

/**
 * Sequential best-move line:
 * get best move → apply → get opponent best move → … for `ply` plies.
 */
router.post('/stockfish/sequence', async (req, res) => {
  const body = req.body || {};
  const fen = String(body.fen || '').trim();
  const depth = Math.min(Math.max(1, Number(body.depth) || MAX_ONLINE_DEPTH), MAX_ONLINE_DEPTH);
  const ply = Math.min(Math.max(1, Number(body.ply) || 7), 28);

  if (!fen) {
    res.status(400).json({ error: 'fen is required' });
    return;
  }

  try {
    const game = new Chess(fen);
    const moves = [];

    for (let i = 0; i < ply; i++) {
      if (game.isGameOver()) break;

      const data = await resolveBestMove(game.fen(), depth);
      const uci = parseBestMoveUci(data.bestmove);
      if (!uci) {
        throw new Error(`No best move on ply ${i + 1}`);
      }

      const result = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length >= 5 ? uci[4] : undefined,
      });
      if (!result) {
        throw new Error(`Invalid move '${uci}' on ply ${i + 1}`);
      }

      moves.push({
        uci,
        san: result.san,
        fen: game.fen(),
        source: data.source || null,
      });
    }

    res.json({ fen, depth, ply: moves.length, moves });
  } catch (e) {
    console.error('[STOCKFISH][SEQUENCE][ERR]', e.message);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
