import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from 'react-icons/fi';

const BOARD_MIN = 300;
const BOARD_MAX = 820;
const HISTORY_WIDTH = 220;
const TOOLBAR_H = 42;
const AREA_PAD = 20;

const NOTATION_STYLE = {
  lineHeight: 1.15,
  fontWeight: 700,
  opacity: 0.95,
};

function isRankAxisSquare(square, orientation) {
  const file = square[0];
  return orientation === 'white' ? file === 'a' : file === 'h';
}

function isFileAxisSquare(square, orientation) {
  const rank = square[1];
  return orientation === 'white' ? rank === '1' : rank === '8';
}

const BoardSquare = forwardRef(function BoardSquare(
  { square, squareColor, style, children, boardOrientation },
  ref
) {
  const rankAxis = isRankAxisSquare(square, boardOrientation);
  const fileAxis = isFileAxisSquare(square, boardOrientation);
  const corner = rankAxis && fileAxis;
  const className = [
    'brilliant-board-square',
    rankAxis && 'brilliant-board-square--rank',
    fileAxis && 'brilliant-board-square--file',
    corner && 'brilliant-board-square--corner',
    `brilliant-board-square--${squareColor}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} style={style} className={className} data-square={square}>
      {children}
    </div>
  );
});

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

function parseUciMove(uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
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
  const areaRef = useRef(null);
  const scrollRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(420);
  const [moveIndex, setMoveIndex] = useState(-1);

  const navMoves = useMemo(() => moveHistory || [], [moveHistory]);
  const pairs = useMemo(() => buildMovePairs(navMoves), [navMoves]);
  const orientation = move?.turn === 'white' ? 'white' : 'black';

  const brilliantIndex = useMemo(
    () => findBrilliantMoveIndex(navMoves, move),
    [navMoves, move]
  );

  const renderSquare = useCallback(
    (props) => <BoardSquare {...props} boardOrientation={orientation} />,
    [orientation]
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
    const area = areaRef.current;
    if (!area) return undefined;

    const updateSize = () => {
      const rect = area.getBoundingClientRect();
      const availableW = rect.width - HISTORY_WIDTH - AREA_PAD * 2 - 12;
      const availableH = rect.height - AREA_PAD * 2 - TOOLBAR_H;
      const size = Math.floor(
        Math.max(BOARD_MIN, Math.min(BOARD_MAX, availableW, availableH))
      );
      setBoardWidth(size);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(area);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    if (moveIndex < 0 || !scrollRef.current) return;
    const active = scrollRef.current.querySelector(`#brilliant-move-${moveIndex}`);
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moveIndex]);

  const currentMove = moveIndex >= 0 ? navMoves[moveIndex] : null;
  const hasNavHistory = navMoves.length > 0;
  const boardFen = !move
    ? null
    : hasNavHistory
      ? moveIndex < 0
        ? navMoves[0]?.before || move.fenBeforeMove || move.fenAfterMove
        : currentMove?.after || move.fenAfterMove
      : move.fenAfterMove || move.fenBeforeMove;

  const boardLastMove =
    hasNavHistory && currentMove?.from && currentMove?.to
      ? { from: currentMove.from, to: currentMove.to }
      : parseUciMove(move?.uciMove);

  const isBrilliantPosition = hasNavHistory
    ? moveIndex === brilliantIndex && brilliantIndex >= 0
    : Boolean(move?.fenAfterMove || move?.fenBeforeMove);

  const lastMoveStyles = useMemo(() => {
    if (!boardLastMove?.from || !boardLastMove?.to) return {};
    if (isBrilliantPosition) {
      return {
        [boardLastMove.from]: { background: 'rgba(212, 167, 44, 0.78)' },
        [boardLastMove.to]: { background: 'rgba(212, 167, 44, 0.95)' },
      };
    }
    return {
      [boardLastMove.from]: { background: 'rgba(235, 236, 59, 0.72)' },
      [boardLastMove.to]: { background: 'rgba(235, 236, 59, 0.85)' },
    };
  }, [boardLastMove?.from, boardLastMove?.to, isBrilliantPosition]);

  if (!move) return null;

  const statusLabel =
    moveIndex < 0
      ? 'Start'
      : `Move ${moveIndex + 1}/${navMoves.length}${isBrilliantPosition ? ' · Brilliant' : ''}`;

  const moveBtnClass = (index) => {
    if (index == null) return 'brilliant-hist-btn brilliant-hist-btn--empty';
    const classes = ['brilliant-hist-btn'];
    if (index === moveIndex) classes.push('brilliant-hist-btn--active');
    if (index === brilliantIndex) classes.push('brilliant-hist-btn--brilliant');
    return classes.join(' ');
  };

  const lineClass = (pair) => {
    const classes = ['brilliant-hist-line'];
    if (pair.whiteIndex === moveIndex || pair.blackIndex === moveIndex) {
      classes.push('brilliant-hist-line--active');
    }
    if (pair.whiteIndex === brilliantIndex || pair.blackIndex === brilliantIndex) {
      classes.push('brilliant-hist-line--brilliant');
    }
    return classes.join(' ');
  };

  const panelHeight = boardWidth + TOOLBAR_H;

  return (
    <div className="brilliant-board-area" ref={areaRef}>
      <div className="brilliant-board-panel" style={{ width: boardWidth }}>
        <div className="brilliant-board-toolbar">
          <span>
            {isBrilliantPosition ? `Brilliant · ${move.sanMove}` : statusLabel}
          </span>
        </div>
        <div className="brilliant-board-frame" style={{ width: boardWidth, height: boardWidth }}>
          {boardFen ? (
            <Chessboard
              id="BrilliantMoveBoard"
              position={boardFen}
              boardOrientation={orientation}
              boardWidth={boardWidth}
              arePiecesDraggable={false}
              showBoardNotation
              customSquare={renderSquare}
              customNotationStyle={NOTATION_STYLE}
              customDarkSquareStyle={{ backgroundColor: '#B58863' }}
              customLightSquareStyle={{ backgroundColor: '#F0D9B5' }}
              customSquareStyles={lastMoveStyles}
              animationDuration={150}
            />
          ) : (
            <p className="brilliant-board-empty">No position available.</p>
          )}
        </div>
      </div>

      <aside className="brilliant-hist" style={{ height: panelHeight }} aria-label="Move history">
        <header className="brilliant-hist-head">
          <span>Moves</span>
          <span className="brilliant-hist-head-meta">{statusLabel}</span>
        </header>
        <div className="brilliant-hist-list" ref={scrollRef}>
          {historyLoading ? (
            <p className="brilliant-hist-empty">Loading…</p>
          ) : !pairs.length ? (
            <p className="brilliant-hist-empty">No moves.</p>
          ) : (
            pairs.map((pair) => (
              <div key={pair.number} className={lineClass(pair)}>
                <span className="brilliant-hist-num">{pair.number}.</span>
                <button
                  type="button"
                  id={`brilliant-move-${pair.whiteIndex}`}
                  className={moveBtnClass(pair.whiteIndex)}
                  onClick={() => goToMove(pair.whiteIndex)}
                >
                  {pair.white?.san || ''}
                </button>
                <button
                  type="button"
                  id={
                    pair.blackIndex != null ? `brilliant-move-${pair.blackIndex}` : undefined
                  }
                  className={moveBtnClass(pair.blackIndex)}
                  onClick={() => pair.blackIndex != null && goToMove(pair.blackIndex)}
                  disabled={pair.blackIndex == null}
                >
                  {pair.black?.san || ''}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="brilliant-hist-footer">
          <div className="brilliant-hist-controls">
            <button type="button" onClick={() => goToMove(-1)} disabled={!navMoves.length || moveIndex < 0} aria-label="Start">
              <FiChevronsLeft />
            </button>
            <button type="button" onClick={() => goToMove(moveIndex - 1)} disabled={!navMoves.length || moveIndex < 0} aria-label="Previous">
              <FiChevronLeft />
            </button>
            <button type="button" onClick={() => goToMove(moveIndex + 1)} disabled={!navMoves.length || moveIndex >= navMoves.length - 1} aria-label="Next">
              <FiChevronRight />
            </button>
            <button type="button" onClick={() => goToMove(navMoves.length - 1)} disabled={!navMoves.length || moveIndex >= navMoves.length - 1} aria-label="End">
              <FiChevronsRight />
            </button>
          </div>
          <div className="brilliant-hist-browse">
            <button type="button" onClick={onPrevGame} disabled={prevGameId == null}>
              Prev game
            </button>
            <span>{gamePositionLabel || ''}</span>
            <button type="button" onClick={onNextGame} disabled={nextGameId == null}>
              Next game
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default BrilliantMoveBoardView;
