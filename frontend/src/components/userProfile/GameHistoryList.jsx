import React, { useCallback, useEffect, useRef, useState } from 'react';
import GameHistoryRow, { GamesTableHeader } from './GameHistoryRow';
import GameRowHoverPreview from './GameRowHoverPreview';
import { getChessComGameId } from '../../utils/chessComGameNavigation';

const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

function GameHistoryList({ games, onSelect, showHeader = true }) {
  const listRef = useRef(null);
  const hideTimer = useRef(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [hoveredGame, setHoveredGame] = useState(null);
  const [previewTop, setPreviewTop] = useState(0);

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const updatePreviewPosition = useCallback((rowEl) => {
    if (!listRef.current || !rowEl) return;
    const listRect = listRef.current.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    setPreviewTop(rowRect.top - listRect.top + rowRect.height / 2);
  }, []);

  const handleRowHover = useCallback(
    (game, rowEl) => {
      if (!game?.pgn) return;
      clearTimers();
      updatePreviewPosition(rowEl);
      setHoveredGame(game);
      setPreviewMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPreviewVisible(true));
      });
    },
    [clearTimers, updatePreviewPosition]
  );

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      setPreviewVisible(false);
      hideTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        setHoveredGame(null);
      }, PREVIEW_ANIMATION_MS);
    }, PREVIEW_HIDE_DELAY_MS);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    clearTimers();
    if (hoveredGame) setPreviewVisible(true);
  }, [clearTimers, hoveredGame]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const hoveredId = hoveredGame ? getChessComGameId(hoveredGame) : null;

  return (
    <div className="chess-games-table">
      {showHeader && <GamesTableHeader />}
      <div
        className="chess-games-list"
        ref={listRef}
        onMouseLeave={scheduleHide}
      >
      {games.map((game, index) => (
        <GameHistoryRow
          key={`${game.gameUrl || game.date}-${index}`}
          game={game}
          onSelect={onSelect}
          isHovered={previewVisible && hoveredId === getChessComGameId(game)}
          onRowHover={handleRowHover}
        />
      ))}

      {previewMounted && hoveredGame && (
        <div
          className={`chess-game-hover-preview chess-game-hover-preview--shared${
            previewVisible ? ' chess-game-hover-preview--visible' : ''
          }`}
          style={{ top: previewTop }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          role="presentation"
        >
          <GameRowHoverPreview
            pgn={hoveredGame.pgn}
            orientation={hoveredGame.isWhite ? 'white' : 'black'}
            boardId="chess-game-hover-shared-board"
          />
        </div>
      )}
      </div>
    </div>
  );
}

export default GameHistoryList;
