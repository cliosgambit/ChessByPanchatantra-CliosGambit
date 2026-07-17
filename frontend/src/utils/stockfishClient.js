import { Chess } from 'chess.js';
import { API_BASE } from '../config/api';

const DEFAULT_DEPTH = 12;
const MAX_DEPTH = 15;

function parseBestMoveUci(bestmove) {
  if (typeof bestmove !== 'string') return null;
  const moveParts = bestmove.split(' ');
  if (moveParts.length < 2) return null;
  return moveParts[1];
}

/** Single best move via backend proxy (avoids browser CORS to stockfish.online). */
export async function fetchBestMoveUci(fen, depth = DEFAULT_DEPTH) {
  const capped = Math.min(depth, MAX_DEPTH);
  const url = `${API_BASE}/api/stockfish/online?fen=${encodeURIComponent(fen)}&depth=${capped}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let message = `Stockfish API error: ${res.status}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error) message = parsed.error;
    } catch {
      if (errorText) message += ` — ${errorText.slice(0, 200)}`;
    }
    throw new Error(message);
  }
  const data = await res.json();
  const uci = parseBestMoveUci(data.bestmove);
  if (!data.success || !uci) {
    throw new Error('Stockfish API did not return a best move.');
  }
  return uci;
}

/**
 * Sequential best moves via backend: get best → apply → opponent best → …
 * Prefer the server sequence endpoint so all online calls stay off the browser.
 */
export async function fetchBestMoveSequence(initialFen, { depth = MAX_DEPTH, ply = 7 } = {}) {
  const res = await fetch(`${API_BASE}/api/stockfish/sequence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: initialFen,
      depth: Math.min(depth, MAX_DEPTH),
      ply,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let message = `Stockfish sequence error: ${res.status}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed?.error) message = parsed.error;
    } catch {
      if (errorText) message += ` — ${errorText.slice(0, 200)}`;
    }
    throw new Error(message);
  }

  const data = await res.json();
  const moves = Array.isArray(data.moves) ? data.moves : [];
  return moves.map((m) => m.uci).filter(Boolean);
}

export function uciSequenceToSans(initialFen, uciMoves) {
  const game = new Chess(initialFen);
  return uciMoves.map((uci) => {
    const result = game.move(uci, { sloppy: true });
    return result ? result.san : `(${uci})`;
  });
}

export async function fetchEvaluationAtDepth(fen, depth = DEFAULT_DEPTH) {
  const url = `${API_BASE}/api/stockfish/online?fen=${encodeURIComponent(fen)}&depth=${Math.min(depth, MAX_DEPTH)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.success && typeof data.evaluation === 'number') {
      return { evaluation: data.evaluation, mate: data.mate };
    }
    return { error: 'No evaluation' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function fetchStockfishMove(currentFen, depth = DEFAULT_DEPTH) {
  try {
    const uciMove = await fetchBestMoveUci(currentFen, depth);
    if (!uciMove) return null;
    return {
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length === 5 ? uciMove.slice(4, 5) : undefined,
    };
  } catch {
    return null;
  }
}
