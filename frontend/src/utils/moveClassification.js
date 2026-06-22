/**
 * CPL-based move classification (chess_move_classification_report).
 * deltaFromBest is in pawns: 1.0 pawn = 100 centipawns.
 */
export function classifyMoveByCplDelta(deltaFromBestPawns) {
  if (!Number.isFinite(deltaFromBestPawns)) return null;
  if (deltaFromBestPawns <= 0) return 'best';
  if (deltaFromBestPawns < 0.5) return 'excellent';
  if (deltaFromBestPawns < 1.0) return 'good';
  if (deltaFromBestPawns < 3.0) return 'inaccuracy';
  if (deltaFromBestPawns < 5.0) return 'mistake';
  return 'blunder';
}
