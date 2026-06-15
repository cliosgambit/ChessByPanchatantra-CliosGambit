import React, { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { getGameEndStateFromPgn } from '../../utils/chessComPgnUtils';

const BOARD_SIZE = 168;

function GameRowHoverPreview({ pgn, orientation, boardId }) {
  const { fen, lastMove } = useMemo(() => getGameEndStateFromPgn(pgn), [pgn]);

  const lastMoveSquareStyles = useMemo(() => {
    if (!lastMove) return {};
    return {
      [lastMove.from]: { background: 'rgba(235, 236, 59, 0.72)' },
      [lastMove.to]: { background: 'rgba(235, 236, 59, 0.85)' },
    };
  }, [lastMove]);

  if (!fen) return null;

  return (
    <div className="chess-game-hover-preview-board">
      <Chessboard
        id={boardId}
        position={fen}
        boardOrientation={orientation}
        boardWidth={BOARD_SIZE}
        arePiecesDraggable={false}
        showBoardNotation={false}
        customDarkSquareStyle={{ backgroundColor: '#779556' }}
        customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
        customSquareStyles={lastMoveSquareStyles}
        animationDuration={0}
      />
    </div>
  );
}

export default GameRowHoverPreview;
