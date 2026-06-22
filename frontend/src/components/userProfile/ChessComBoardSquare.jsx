import React, { forwardRef } from 'react';

function isRankAxisSquare(square, orientation) {
  const file = square[0];
  return orientation === 'white' ? file === 'a' : file === 'h';
}

function isFileAxisSquare(square) {
  return square[1] === '1';
}

const ChessComBoardSquare = forwardRef(function ChessComBoardSquare(
  { square, squareColor, style, children, boardOrientation },
  ref
) {
  const rankAxis = isRankAxisSquare(square, boardOrientation);
  const fileAxis = isFileAxisSquare(square);
  const corner = rankAxis && fileAxis;

  const className = [
    'chess-game-board-square',
    rankAxis && 'chess-game-board-square--rank-axis',
    fileAxis && 'chess-game-board-square--file-axis',
    corner && 'chess-game-board-square--corner',
    `chess-game-board-square--${squareColor}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} style={style} className={className} data-square={square}>
      {children}
    </div>
  );
});

export default ChessComBoardSquare;
