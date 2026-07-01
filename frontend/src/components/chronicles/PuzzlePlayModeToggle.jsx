import React from 'react';

function PuzzlePlayModeToggle({ playMode, onSelectStockfish, onSelectHuman }) {
  const isStockfishMode = playMode === 'stockfish';

  return (
    <div className="chronicles-puzzle-mode-toggle" role="group" aria-label="Play mode">
      <button
        type="button"
        className={`chronicles-puzzle-mode-btn${
          isStockfishMode ? ' chronicles-puzzle-mode-btn--active' : ''
        }`}
        aria-pressed={isStockfishMode}
        onClick={onSelectStockfish}
      >
        vs Stockfish
      </button>
      <button
        type="button"
        className={`chronicles-puzzle-mode-btn${
          !isStockfishMode ? ' chronicles-puzzle-mode-btn--active' : ''
        }`}
        aria-pressed={!isStockfishMode}
        onClick={onSelectHuman}
      >
        Human vs Human
      </button>
    </div>
  );
}

export default PuzzlePlayModeToggle;
