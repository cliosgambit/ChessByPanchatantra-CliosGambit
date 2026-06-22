import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FenHoverPreview from '../userProfile/FenHoverPreview';
import BrilliantMoveHistoryPanel from './BrilliantMoveHistoryPanel';
import '../userProfile/ChessComGamePage.css';

const MAX_BOARD_SIZE = 440;

function formatAccuracy(value) {
  if (value == null) return '—';
  return `${value}%`;
}

function formatPlayerLine(name, username) {
  const primary = name || username || '—';
  const secondary =
    name && username && name.toLowerCase() !== String(username).toLowerCase()
      ? username
      : null;

  return { primary, secondary };
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function findBrilliantMoveIndex(moves, brilliantMove) {
  if (!moves?.length || !brilliantMove) return -1;

  if (Number.isInteger(brilliantMove.plyIndex) && brilliantMove.plyIndex >= 0) {
    const byChessComPly = moves.findIndex((m) => m.ply === brilliantMove.plyIndex + 1);
    if (byChessComPly >= 0) return byChessComPly;
    if (brilliantMove.plyIndex < moves.length) return brilliantMove.plyIndex;
  }

  if (!brilliantMove.sanMove) return -1;

  const targetColor = brilliantMove.turn === 'white' ? 'w' : 'b';
  return moves.findIndex((m) => m.san === brilliantMove.sanMove && m.color === targetColor);
}

function PlayerBarContent({ name, username, rating, color }) {
  const { primary, secondary } = formatPlayerLine(name, username);

  return (
    <div className="view-brilliant-move-player-bar-main">
      <span className={`view-brilliant-move-player-piece view-brilliant-move-player-piece--${color}`}>
        {color === 'white' ? 'W' : 'B'}
      </span>
      <div className="view-brilliant-move-player-text">
        <span className="view-brilliant-move-player-primary">{primary}</span>
        {secondary && <span className="view-brilliant-move-player-secondary">{secondary}</span>}
      </div>
      <span className="view-brilliant-move-player-rating">{rating ?? '—'}</span>
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="view-brilliant-move-info-row">
      <span className="view-brilliant-move-info-label">{label}</span>
      <span
        className={`view-brilliant-move-info-value${
          highlight ? ' view-brilliant-move-info-value--move' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function BrilliantMoveBoardView({
  move,
  moveHistory,
  historyLoading,
  prevGameId,
  nextGameId,
  gamePositionLabel,
  onPrevGame,
  onNextGame,
}) {
  const boardWrapRef = useRef(null);
  const [boardSize, setBoardSize] = useState(MAX_BOARD_SIZE);
  const [moveIndex, setMoveIndex] = useState(-1);

  const navMoves = useMemo(() => moveHistory || [], [moveHistory]);

  const brilliantIndex = useMemo(
    () => findBrilliantMoveIndex(navMoves, move),
    [navMoves, move]
  );

  useEffect(() => {
    if (!navMoves.length) {
      setMoveIndex(-1);
      return;
    }
    if (brilliantIndex >= 0) {
      setMoveIndex(brilliantIndex);
      return;
    }
    setMoveIndex(navMoves.length - 1);
  }, [move?.id, navMoves, brilliantIndex]);

  const goToMove = useCallback(
    (index) => {
      if (!navMoves.length) return;
      setMoveIndex(Math.max(-1, Math.min(index, navMoves.length - 1)));
    },
    [navMoves.length]
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToMove(moveIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToMove(moveIndex + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moveIndex, goToMove]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return undefined;

    const updateSize = () => {
      const width = el.getBoundingClientRect().width;
      setBoardSize(Math.min(MAX_BOARD_SIZE, Math.floor(width)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!move) return null;

  const orientation = move.turn === 'white' ? 'white' : 'black';
  const whiteOnBottom = orientation === 'white';
  const currentMove = moveIndex >= 0 ? navMoves[moveIndex] : null;
  const hasNavHistory = navMoves.length > 0;
  const boardFen = hasNavHistory
    ? moveIndex < 0
      ? navMoves[0]?.before || move.fenBeforeMove || move.fenAfterMove
      : currentMove?.after || move.fenAfterMove
    : move.fenAfterMove || move.fenBeforeMove;
  const boardLastMove =
    hasNavHistory && currentMove?.from && currentMove?.to
      ? { from: currentMove.from, to: currentMove.to }
      : null;
  const isBrilliantPosition = hasNavHistory
    ? moveIndex === brilliantIndex && brilliantIndex >= 0
    : Boolean(move.fenAfterMove || move.fenBeforeMove);

  const topPlayer = whiteOnBottom
    ? {
        color: 'black',
        name: move.blackName,
        username: move.blackUsername,
        rating: move.blackRating ?? (move.turn === 'black' ? move.playerRating : null),
      }
    : {
        color: 'white',
        name: move.whiteName,
        username: move.whiteUsername,
        rating: move.whiteRating ?? (move.turn === 'white' ? move.playerRating : null),
      };

  const bottomPlayer = whiteOnBottom
    ? {
        color: 'white',
        name: move.whiteName,
        username: move.whiteUsername,
        rating: move.whiteRating ?? (move.turn === 'white' ? move.playerRating : null),
      }
    : {
        color: 'black',
        name: move.blackName,
        username: move.blackUsername,
        rating: move.blackRating ?? (move.turn === 'black' ? move.playerRating : null),
      };

  const gameAccuracy =
    move.whiteAccuracy != null || move.blackAccuracy != null
      ? `W ${formatAccuracy(move.whiteAccuracy)} · B ${formatAccuracy(move.blackAccuracy)}`
      : '—';

  const statusLabel =
    moveIndex < 0
      ? 'Start'
      : `Move ${moveIndex + 1} of ${navMoves.length}${
          isBrilliantPosition ? ' · Brilliant move' : ''
        }`;

  return (
    <div className="view-brilliant-move-layout">
      <aside className="view-brilliant-move-side-box view-brilliant-move-side-box--info">
        <header className="view-brilliant-move-side-header">Move Info</header>
        <div className="view-brilliant-move-info-list">
          <InfoRow label="Move" value={move.sanMove} highlight />
          <InfoRow label="Class" value={move.classification} />
          <InfoRow label="Type" value={move.sacType} />
          <InfoRow label="Turn" value={move.turn === 'white' ? 'White' : 'Black'} />
          <InfoRow label="Match" value={move.players} />
          <InfoRow label="Player Accuracy" value={formatAccuracy(move.playerAccuracy)} />
          <InfoRow label="Game Accuracy" value={gameAccuracy} />
          <InfoRow label="Brilliant" value={move.isBrilliant ? 'Yes' : 'No'} />
        </div>
        {move.gameUrl && (
          <a
            href={move.gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="view-brilliant-move-game-link"
          >
            Open game on Chess.com
          </a>
        )}
      </aside>

      <div className="view-brilliant-move-main">
        <div className="view-brilliant-move-player-bar view-brilliant-move-player-bar--top">
          <PlayerBarContent {...topPlayer} />
          <span className="view-brilliant-move-bar-meta">{move.playedDate}</span>
        </div>

        <div className="view-brilliant-move-board-stage">
          {boardFen ? (
            <div className="view-brilliant-move-board-wrap" ref={boardWrapRef}>
              <FenHoverPreview
                fen={boardFen}
                uciMove={!hasNavHistory ? move.uciMove : undefined}
                lastMove={boardLastMove}
                orientation={orientation}
                boardId="view-brilliant-move-board"
                boardSize={boardSize}
                brilliantHighlight={isBrilliantPosition}
                showBoardNotation
              />
            </div>
          ) : (
            <p className="view-brilliant-move-no-fen">No position available for this move.</p>
          )}
        </div>

        <div className="view-brilliant-move-player-bar view-brilliant-move-player-bar--bottom">
          <PlayerBarContent {...bottomPlayer} />
          <span className="view-brilliant-move-bar-meta">{move.timeControl}</span>
        </div>
      </div>

      <BrilliantMoveHistoryPanel
        moves={navMoves}
        loading={historyLoading}
        moveIndex={moveIndex}
        brilliantIndex={brilliantIndex}
        onSelectMove={goToMove}
        onGoToStart={() => goToMove(-1)}
        onGoToPrevious={() => goToMove(moveIndex - 1)}
        onGoToNext={() => goToMove(moveIndex + 1)}
        onGoToEnd={() => goToMove(navMoves.length - 1)}
        statusLabel={statusLabel}
        canNavigate={navMoves.length > 0}
        prevGameDisabled={prevGameId == null}
        nextGameDisabled={nextGameId == null}
        gamePositionLabel={gamePositionLabel}
        onPrevGame={onPrevGame}
        onNextGame={onNextGame}
      />
    </div>
  );
}

export default BrilliantMoveBoardView;
