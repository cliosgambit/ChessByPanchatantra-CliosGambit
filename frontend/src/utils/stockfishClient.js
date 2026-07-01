const STOCKFISH_API = 'https://stockfish.online/api/s/v2.php';
const DEFAULT_DEPTH = 12;

export async function fetchEvaluationAtDepth(fen, depth = DEFAULT_DEPTH) {
  const url = `${STOCKFISH_API}?fen=${encodeURIComponent(fen)}&depth=${Math.min(depth, 15)}`;
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
  const url = `${STOCKFISH_API}?fen=${encodeURIComponent(currentFen)}&depth=${Math.min(depth, 15)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.success || typeof data.bestmove !== 'string') return null;

    const moveParts = data.bestmove.split(' ');
    if (moveParts.length < 2) return null;

    const uciMove = moveParts[1];
    return {
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length === 5 ? uciMove.slice(4, 5) : undefined,
    };
  } catch {
    return null;
  }
}
