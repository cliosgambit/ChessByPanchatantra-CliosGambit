import { Chess } from 'chess.js';

/** Parse space-separated UCI move string into parts. */
export function parseLichessMoves(movesStr) {
  return String(movesStr || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function applyUci(game, uci) {
  if (!uci || uci.length < 4) return null;
  return game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length >= 5 ? uci[4] : undefined,
  });
}

/**
 * Lichess DB FEN is the position *before* the opponent’s setup move.
 * Returns the playable start FEN (after that move), opponent UCI, and solution UCIs.
 */
export function resolveLichessPuzzlePosition(fen, movesStr) {
  const moves = parseLichessMoves(movesStr);
  if (!fen) {
    return {
      displayFen: null,
      playFen: null,
      opponentUci: null,
      solutionUcis: [],
      solutionSans: [],
      orientation: 'white',
    };
  }

  try {
    const base = new Chess(fen);
    if (!moves.length) {
      const turn = base.turn();
      return {
        displayFen: fen,
        playFen: fen,
        opponentUci: null,
        solutionUcis: [],
        solutionSans: [],
        orientation: turn === 'b' ? 'black' : 'white',
      };
    }

    const opponentUci = moves[0];
    const afterOpp = new Chess(fen);
    const oppResult = applyUci(afterOpp, opponentUci);
    if (!oppResult) {
      const turn = base.turn();
      return {
        displayFen: fen,
        playFen: fen,
        opponentUci: null,
        solutionUcis: moves,
        solutionSans: [],
        orientation: turn === 'b' ? 'black' : 'white',
      };
    }

    const solutionUcis = moves.slice(1);
    const solutionSans = [];
    const line = new Chess(afterOpp.fen());
    for (const uci of solutionUcis) {
      const result = applyUci(line, uci);
      if (!result) break;
      solutionSans.push(result.san);
    }

    const turn = afterOpp.turn();
    return {
      displayFen: afterOpp.fen(),
      playFen: afterOpp.fen(),
      opponentUci,
      solutionUcis,
      solutionSans,
      orientation: turn === 'b' ? 'black' : 'white',
      lastMove: { from: oppResult.from, to: oppResult.to },
    };
  } catch {
    return {
      displayFen: fen,
      playFen: fen,
      opponentUci: null,
      solutionUcis: parseLichessMoves(movesStr),
      solutionSans: [],
      orientation: 'white',
    };
  }
}
