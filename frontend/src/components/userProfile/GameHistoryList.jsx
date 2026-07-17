import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GameHistoryRow, { GamesTableHeader } from './GameHistoryRow';
import GameRowHoverPreview from './GameRowHoverPreview';
import { fetchChessComGamePgnFromDb } from '../../services/chessComDbService';
import { getChessComGameId } from '../../utils/chessComGameNavigation';

const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;
const PGN_PREFETCH_CONCURRENCY = 6;
const PREVIEW_BOARD_SIZE = 176;
const PREVIEW_GAP = 14;

function GameHistoryList({
  games,
  onSelect,
  showHeader = true,
  profileUsername,
  dateColumnLabel = 'Date',
  extraColumnLabel = null,
  extraColumn = null,
  portalPreview = false,
}) {
  const listRef = useRef(null);
  const hideTimer = useRef(null);
  const pgnCacheRef = useRef(new Map());
  const pgnInflightRef = useRef(new Map());
  const hoverRequestRef = useRef(0);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewInstant, setPreviewInstant] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hoveredGame, setHoveredGame] = useState(null);
  const [previewTop, setPreviewTop] = useState(0);
  const [previewLeft, setPreviewLeft] = useState(0);
  const [previewPgn, setPreviewPgn] = useState(null);

  const showPreview = useCallback((instant = false) => {
    setPreviewInstant(instant);
    setPreviewVisible(true);
  }, []);

  const loadPgnForGame = useCallback(
    (game, requestId) => {
      const gameId = getChessComGameId(game);
      if (!gameId) return Promise.resolve(null);

      const cachedPgn = game.pgn || pgnCacheRef.current.get(gameId);
      if (cachedPgn) return Promise.resolve(cachedPgn);

      const ownerUsername = game.chessComId || profileUsername;
      if (!ownerUsername) return Promise.resolve(null);

      const inflight = pgnInflightRef.current.get(gameId);
      if (inflight) return inflight;

      const promise = fetchChessComGamePgnFromDb(ownerUsername, gameId)
        .then((data) => {
          if (requestId != null && hoverRequestRef.current !== requestId) return null;
          if (!data?.pgn) return null;
          pgnCacheRef.current.set(gameId, data.pgn);
          return data.pgn;
        })
        .finally(() => {
          pgnInflightRef.current.delete(gameId);
        });

      pgnInflightRef.current.set(gameId, promise);
      return promise;
    },
    [profileUsername]
  );

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const updatePreviewPosition = useCallback(
    (rowEl) => {
      if (!rowEl) return;
      const rowRect = rowEl.getBoundingClientRect();

      if (portalPreview) {
        const preferLeft = rowRect.left >= PREVIEW_BOARD_SIZE + PREVIEW_GAP + 16;
        const left = preferLeft
          ? rowRect.left - PREVIEW_BOARD_SIZE - PREVIEW_GAP
          : rowRect.right + PREVIEW_GAP;
        const top = Math.min(
          Math.max(rowRect.top + rowRect.height / 2, PREVIEW_BOARD_SIZE / 2 + 8),
          window.innerHeight - PREVIEW_BOARD_SIZE / 2 - 8
        );
        setPreviewLeft(left);
        setPreviewTop(top);
        return;
      }

      if (!listRef.current) return;
      const listRect = listRef.current.getBoundingClientRect();
      setPreviewTop(rowRect.top - listRect.top + rowRect.height / 2);
    },
    [portalPreview]
  );

  const handleRowHover = useCallback(
    (game, rowEl) => {
      const gameId = getChessComGameId(game);
      if (!gameId) return;

      const requestId = hoverRequestRef.current + 1;
      hoverRequestRef.current = requestId;

      clearTimers();
      updatePreviewPosition(rowEl);
      setHoveredGame(game);
      setPreviewMounted(true);
      setPreviewPgn(null);

      const cachedPgn = game.pgn || pgnCacheRef.current.get(gameId);
      if (cachedPgn) {
        setPreviewLoading(false);
        setPreviewPgn(cachedPgn);
        showPreview(true);
        return;
      }

      setPreviewLoading(true);
      showPreview(true);

      loadPgnForGame(game, requestId)
        .then((pgn) => {
          if (hoverRequestRef.current !== requestId) return;
          if (!pgn) {
            setPreviewLoading(false);
            setPreviewVisible(false);
            setPreviewMounted(false);
            return;
          }
          setPreviewPgn(pgn);
          setPreviewLoading(false);
        })
        .catch(() => {
          if (hoverRequestRef.current !== requestId) return;
          setPreviewLoading(false);
          setPreviewVisible(false);
          setPreviewMounted(false);
        });
    },
    [clearTimers, loadPgnForGame, showPreview, updatePreviewPosition]
  );

  const scheduleHide = useCallback(() => {
    clearTimers();
    hoverRequestRef.current += 1;
    hideTimer.current = setTimeout(() => {
      setPreviewVisible(false);
      setPreviewInstant(false);
      hideTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        setHoveredGame(null);
        setPreviewPgn(null);
        setPreviewLoading(false);
      }, PREVIEW_ANIMATION_MS);
    }, PREVIEW_HIDE_DELAY_MS);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    clearTimers();
    if (hoveredGame) setPreviewVisible(true);
  }, [clearTimers, hoveredGame]);

  useEffect(() => {
    for (const game of games) {
      const gameId = getChessComGameId(game);
      if (gameId && game.pgn) {
        pgnCacheRef.current.set(gameId, game.pgn);
      }
    }
  }, [games]);

  useEffect(() => {
    let cancelled = false;

    async function prefetchVisiblePgns() {
      const pending = games.filter((game) => {
        const gameId = getChessComGameId(game);
        if (!gameId || game.pgn || pgnCacheRef.current.has(gameId)) return false;
        return Boolean(game.chessComId || profileUsername);
      });

      for (let offset = 0; offset < pending.length; offset += PGN_PREFETCH_CONCURRENCY) {
        if (cancelled) return;
        const batch = pending.slice(offset, offset + PGN_PREFETCH_CONCURRENCY);
        await Promise.all(batch.map((game) => loadPgnForGame(game, null).catch(() => null)));
      }
    }

    prefetchVisiblePgns();
    return () => {
      cancelled = true;
    };
  }, [games, loadPgnForGame, profileUsername]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const hoveredId = hoveredGame ? getChessComGameId(hoveredGame) : null;

  const previewNode =
    previewMounted && hoveredGame && (previewLoading || previewPgn) ? (
      <div
        className={`chess-game-hover-preview ${
          portalPreview ? 'chess-game-hover-preview--portal' : 'chess-game-hover-preview--shared'
        }${previewVisible ? ' chess-game-hover-preview--visible' : ''}${
          previewInstant ? ' chess-game-hover-preview--instant' : ''
        }${previewLoading ? ' chess-game-hover-preview--loading' : ''}`}
        style={
          portalPreview
            ? { top: previewTop, left: previewLeft }
            : { top: previewTop }
        }
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        role="presentation"
      >
        {previewLoading && !previewPgn ? (
          <div className="chess-game-hover-preview-loading" aria-label="Loading game preview">
            <span className="chess-game-hover-preview-spinner" />
          </div>
        ) : (
          <GameRowHoverPreview
            pgn={previewPgn}
            orientation={hoveredGame.isWhite ? 'white' : 'black'}
            boardId="chess-game-hover-shared-board"
          />
        )}
      </div>
    ) : null;

  return (
    <div className={`chess-games-table${extraColumn ? ' chess-games-table--with-extra' : ''}`}>
      {showHeader && (
        <GamesTableHeader
          extraColumnLabel={extraColumnLabel}
          dateColumnLabel={dateColumnLabel}
        />
      )}
      <div
        className="chess-games-list"
        ref={listRef}
        onMouseLeave={scheduleHide}
      >
        {games.map((game, index) => (
          <GameHistoryRow
            key={game.uuid || `${game.gameUrl || game.date}-${index}`}
            game={game}
            onSelect={onSelect}
            isHovered={hoveredId === getChessComGameId(game) && previewMounted}
            onRowHover={handleRowHover}
            extraColumn={extraColumn}
          />
        ))}

        {!portalPreview ? previewNode : null}
      </div>
      {portalPreview && previewNode ? createPortal(previewNode, document.body) : null}
    </div>
  );
}

export default GameHistoryList;
