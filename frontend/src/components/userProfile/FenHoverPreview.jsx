import React, { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';

const DEFAULT_BOARD_SIZE = 168;

function parseUciMove(uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function FenHoverPreview({
  fen,
  uciMove,
  lastMove,
  orientation,
  boardId,
  boardSize = DEFAULT_BOARD_SIZE,
  brilliantHighlight = false,
  showBoardNotation = false,
}) {
  const parsedLastMove = useMemo(() => {
    if (lastMove?.from && lastMove?.to) return lastMove;
    return parseUciMove(uciMove);
  }, [lastMove, uciMove]);

  const lastMoveSquareStyles = useMemo(() => {
    if (!parsedLastMove) return {};
    if (brilliantHighlight) {
      return {
        [parsedLastMove.from]: { background: 'rgba(212, 167, 44, 0.78)' },
        [parsedLastMove.to]: { background: 'rgba(212, 167, 44, 0.95)' },
      };
    }
    return {
      [parsedLastMove.from]: { background: 'rgba(235, 236, 59, 0.72)' },
      [parsedLastMove.to]: { background: 'rgba(235, 236, 59, 0.85)' },
    };
  }, [parsedLastMove, brilliantHighlight]);

  if (!fen) return null;

  return (
    <div
      className="chess-game-hover-preview-board"
      style={{ width: boardSize, height: boardSize }}
    >
      <Chessboard
        id={boardId}
        position={fen}
        boardOrientation={orientation}
        boardWidth={boardSize}
        arePiecesDraggable={false}
        showBoardNotation={showBoardNotation}
        customDarkSquareStyle={{ backgroundColor: '#779556' }}
        customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
        customSquareStyles={lastMoveSquareStyles}
        animationDuration={150}
      />
    </div>
  );
}

export default FenHoverPreview;
