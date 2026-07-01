import { Chess } from 'chess.js';
import { fetchEvaluationAtDepth } from './stockfishClient';

export function shuffleArray(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { fetchEvaluationAtDepth };

export async function buildPollOptionsForPuzzle(fen) {
  const chess = new Chess(fen);
  const legalMoves = chess.moves();

  if (legalMoves.length < 2) {
    throw new Error('Not enough legal moves to build a poll.');
  }

  const evalResults = await Promise.all(
    legalMoves.map(async (move) => {
      const chessCopy = new Chess(fen);
      chessCopy.move(move);
      const evalResult = await fetchEvaluationAtDepth(chessCopy.fen(), 12);
      return {
        move,
        evaluation: evalResult.evaluation,
        mate: evalResult.mate,
        error: evalResult.error,
      };
    })
  );

  const ranked = evalResults
    .filter((row) => row.evaluation !== undefined)
    .sort((a, b) => {
      const isWhite = chess.turn() === 'w';
      return isWhite ? b.evaluation - a.evaluation : a.evaluation - b.evaluation;
    });

  const topMoves = ranked.slice(0, 4).map((row, index) => ({
    move: row.move,
    evaluation: row.evaluation,
    mate: row.mate,
    isAnswer: index === 0,
    rank: index + 1,
  }));

  if (topMoves.length < 4) {
    const used = new Set(topMoves.map((row) => row.move));
    for (const move of legalMoves) {
      if (topMoves.length >= 4) break;
      if (!used.has(move)) {
        topMoves.push({
          move,
          evaluation: null,
          mate: null,
          isAnswer: false,
          rank: topMoves.length + 1,
        });
        used.add(move);
      }
    }
  }

  if (topMoves.length < 2) {
    throw new Error('Could not rank enough moves for a poll.');
  }

  return shuffleArray(topMoves.slice(0, 4));
}
