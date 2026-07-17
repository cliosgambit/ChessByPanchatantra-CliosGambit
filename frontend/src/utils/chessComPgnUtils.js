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

/** Strip PGN headers / results / move numbers → displayable solution move text. */
export function solutionTextFromChessCom(solution) {
  if (!solution) return '';
  return String(solution)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\r/g, '')
    .replace(/\s*(?:\*|1-0|0-1|1\/2-1\/2)\s*$/i, '')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Chess.com stored `solution` (PGN) into SAN moves.
 * Prefers chess.js validation when a FEN is available.
 */
export function solutionSansFromChessCom(solution, fen = null) {
  if (!solution) return [];

  const cleaned = sanitizeChessComPgn(solution);
  try {
    if (/\[FEN\s+"/i.test(cleaned) || /\[SetUp\s+"/i.test(cleaned)) {
      const chess = new Chess();
      chess.loadPgn(cleaned);
      const history = chess.history();
      if (history.length) return history;
    }
  } catch {
    // fall through
  }

  const tokens = solutionTextFromChessCom(solution).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  if (fen) {
    try {
      const chess = new Chess(fen);
      const sans = [];
      for (const token of tokens) {
        const moved = chess.move(token, { strict: false });
        if (!moved) break;
        sans.push(moved.san);
      }
      if (sans.length) return sans;
    } catch {
      // fall through to raw tokens
    }
  }

  return tokens;
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
