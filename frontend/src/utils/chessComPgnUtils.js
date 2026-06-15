import { Chess } from 'chess.js';

export function sanitizeChessComPgn(pgn) {
  if (!pgn) return '';
  const headerLines = [];
  const bodyLines = [];
  let inHeaders = true;

  for (const line of pgn.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      inHeaders = false;
      continue;
    }
    if (inHeaders && trimmed.startsWith('[')) {
      headerLines.push(trimmed);
    } else {
      inHeaders = false;
      bodyLines.push(trimmed);
    }
  }

  const cleanMoves = bodyLines
    .join(' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!headerLines.length) return cleanMoves;
  return `${headerLines.join('\n')}\n\n${cleanMoves}`;
}

export function getFinalFenFromPgn(pgn) {
  return getGameEndStateFromPgn(pgn).fen;
}

export function getGameEndStateFromPgn(pgn) {
  if (!pgn) return { fen: null, lastMove: null };
  const chess = new Chess();
  try {
    chess.loadPgn(sanitizeChessComPgn(pgn));
    const history = chess.history({ verbose: true });
    const lastMove = history.length ? history[history.length - 1] : null;
    return { fen: chess.fen(), lastMove };
  } catch {
    return { fen: null, lastMove: null };
  }
}
