import { Chess } from 'chess.js';

export function moveToUci(move) {
  if (move?.uci) return move.uci;
  if (!move?.from || !move?.to) return null;
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export function buildGameTimeline(history, moveHistory) {
  const chess = new Chess();
  const timeline = [{ fen: chess.fen(), turn: 'w' }];

  for (let i = 0; i < history.length; i++) {
    const stored = moveHistory?.[i];
    const fenAfter = stored?.fen_after || stored?.after;
    if (fenAfter) {
      chess.load(fenAfter);
    } else {
      chess.move(history[i]);
    }
    const fen = chess.fen();
    timeline.push({ fen, turn: fen.split(' ')[1] });
  }

  return timeline;
}

export function countLegalMovesAtPly(timeline, navIndex) {
  if (navIndex <= 0 || navIndex > timeline.length) return 0;
  const prev = timeline[navIndex - 1];
  if (!prev?.fen) return 0;
  try {
    const chess = new Chess(prev.fen);
    return chess.moves().length;
  } catch {
    return 0;
  }
}

export function enrichHistoryWithUci(history) {
  return history.map((move) => ({
    ...move,
    uci: moveToUci(move),
  }));
}
