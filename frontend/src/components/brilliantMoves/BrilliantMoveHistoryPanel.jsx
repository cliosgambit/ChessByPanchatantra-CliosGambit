import React, { useEffect, useMemo, useRef } from 'react';
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from 'react-icons/fi';
import '../userProfile/ChessComGamePage.css';

function buildMovePairs(moves) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      whiteIndex: i,
      white: moves[i] || null,
      blackIndex: i + 1 < moves.length ? i + 1 : null,
      black: moves[i + 1] || null,
    });
  }
  return pairs;
}

function moveButtonClass(index, moveIndex, brilliantIndex) {
  if (index == null) return 'chess-game-move-btn chess-game-move-btn--empty';

  const classes = ['chess-game-move-btn', 'view-brilliant-move-history-san'];
  if (index === moveIndex) classes.push('chess-game-move-btn--active');
  if (index === brilliantIndex) classes.push('view-brilliant-move-history-san--brilliant');
  return classes.join(' ');
}

function BrilliantMoveHistoryPanel({
  moves,
  loading,
  moveIndex,
  brilliantIndex,
  onSelectMove,
  onGoToStart,
  onGoToPrevious,
  onGoToNext,
  onGoToEnd,
  statusLabel,
  canNavigate,
  prevGameDisabled,
  nextGameDisabled,
  gamePositionLabel,
  onPrevGame,
  onNextGame,
}) {
  const scrollRef = useRef(null);
  const pairs = useMemo(() => buildMovePairs(moves || []), [moves]);

  useEffect(() => {
    if (moveIndex < 0 || !scrollRef.current) return;
    const active = scrollRef.current.querySelector(`#brilliant-move-${moveIndex}`);
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moveIndex]);

  return (
    <div className="view-brilliant-move-side-box view-brilliant-move-side-box--history">
      <header className="view-brilliant-move-side-header">Move History</header>
      <div className="view-brilliant-move-history-body">
        <div className="chess-game-moves-panel view-brilliant-move-history-panel">
          <div ref={scrollRef} className="chess-game-moves-scroll view-brilliant-move-history-scroll">
            {loading ? (
              <p className="chess-game-moves-empty">Loading moves...</p>
            ) : !pairs.length ? (
              <p className="chess-game-moves-empty">No moves available.</p>
            ) : (
              pairs.map((pair) => (
                <div key={pair.number} className="chess-game-move-line">
                  <span className="chess-game-move-num">{pair.number}.</span>
                  <button
                    type="button"
                    id={`brilliant-move-${pair.whiteIndex}`}
                    className={moveButtonClass(pair.whiteIndex, moveIndex, brilliantIndex)}
                    onClick={() => onSelectMove(pair.whiteIndex)}
                  >
                    {pair.white?.san || ''}
                  </button>
                  <button
                    type="button"
                    id={pair.blackIndex != null ? `brilliant-move-${pair.blackIndex}` : undefined}
                    className={moveButtonClass(pair.blackIndex, moveIndex, brilliantIndex)}
                    onClick={() => pair.blackIndex != null && onSelectMove(pair.blackIndex)}
                    disabled={pair.blackIndex == null}
                  >
                    {pair.black?.san || ''}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="view-brilliant-move-controls chess-game-controls">
          <button
            type="button"
            className="chess-game-control-btn"
            onClick={onGoToStart}
            disabled={moveIndex < 0 || !canNavigate}
            aria-label="Go to start"
          >
            <FiChevronsLeft />
          </button>
          <button
            type="button"
            className="chess-game-control-btn"
            onClick={onGoToPrevious}
            disabled={moveIndex < 0 || !canNavigate}
            aria-label="Previous move"
          >
            <FiChevronLeft />
          </button>
          <span className="chess-game-control-status view-brilliant-move-control-status">
            {statusLabel}
          </span>
          <button
            type="button"
            className="chess-game-control-btn"
            onClick={onGoToNext}
            disabled={!canNavigate || moveIndex >= moves.length - 1}
            aria-label="Next move"
          >
            <FiChevronRight />
          </button>
          <button
            type="button"
            className="chess-game-control-btn"
            onClick={onGoToEnd}
            disabled={!canNavigate || moveIndex >= moves.length - 1}
            aria-label="Go to end"
          >
            <FiChevronsRight />
          </button>
        </div>

        <div className="view-brilliant-move-game-nav">
          <button
            type="button"
            className="view-brilliant-move-game-nav-btn"
            onClick={onPrevGame}
            disabled={prevGameDisabled}
          >
            Prev Game
          </button>
          {gamePositionLabel && (
            <span className="view-brilliant-move-game-nav-label">{gamePositionLabel}</span>
          )}
          <button
            type="button"
            className="view-brilliant-move-game-nav-btn"
            onClick={onNextGame}
            disabled={nextGameDisabled}
          >
            Next Game
          </button>
        </div>
      </div>
    </div>
  );
}

export default BrilliantMoveHistoryPanel;
