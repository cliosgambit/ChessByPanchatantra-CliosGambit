const { Chess } = require('chess.js');

function sanitizeChessComPgn(pgn) {
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

function parsePgnToMoves(pgn) {
  if (!pgn?.trim()) return [];

  const chess = new Chess();
  try {
    chess.loadPgn(sanitizeChessComPgn(pgn));
  } catch {
    return [];
  }

  const verbose = chess.history({ verbose: true });
  return verbose.map((move, index) => {
    const ply = index + 1;
    const san = move.san || '';
    return {
      ply,
      move_number: Math.ceil(ply / 2),
      color: move.color,
      san,
      uci: `${move.from}${move.to}${move.promotion || ''}`,
      from_square: move.from,
      to_square: move.to,
      piece: move.piece,
      captured: move.captured || null,
      promotion: move.promotion || null,
      fen_before: move.before || null,
      fen_after: move.after || null,
      is_check: san.includes('+') && !san.includes('#'),
      is_mate: san.includes('#'),
      is_capture: Boolean(move.captured),
      is_castle: san === 'O-O' || san === 'O-O-O' || san === '0-0' || san === '0-0-0',
      is_en_passant: Boolean(String(move.flags || '').includes('e')),
      is_promotion: Boolean(move.promotion),
    };
  });
}

module.exports = {
  sanitizeChessComPgn,
  parsePgnToMoves,
};
