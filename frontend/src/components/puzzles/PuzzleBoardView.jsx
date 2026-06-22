import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useNavigate } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
} from 'react-icons/fi';
import '../userProfile/ChessComGamePage.css';

const STOCKFISH_DEPTH = 12;
const MIN_BOARD_SIZE = 280;

function findKingSquare(gameInstance) {
  if (!gameInstance) return null;
  const board = gameInstance.board();
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && piece.type === 'k' && piece.color === gameInstance.turn()) {
        return 'abcdefgh'[c] + (8 - r);
      }
    }
  }
  return null;
}

function checkIsPromotion(gameInstance, from, to) {
  if (!from || !to || !gameInstance) return false;
  const piece = gameInstance.get(from);
  if (!piece || piece.type !== 'p') return false;
  const targetRank = to[1];
  const promotionRank = piece.color === 'w' ? '8' : '1';
  if (targetRank !== promotionRank) return false;
  const moves = gameInstance.moves({ square: from, verbose: true });
  return moves.some((m) => m.to === to && (m.flags.includes('p') || m.promotion));
}

function parseUciMove(uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci.slice(4, 5) : undefined,
  };
}

function OpponentModeToggle({ isStockfishMode, onSelectStockfish, onSelectHuman }) {
  return (
    <div className="view-puzzle-opponent-toggle" role="group" aria-label="Opponent mode">
      <button
        type="button"
        className={`view-puzzle-opponent-toggle-btn${
          isStockfishMode ? ' view-puzzle-opponent-toggle-btn--active' : ''
        }`}
        onClick={onSelectStockfish}
      >
        Stockfish
      </button>
      <button
        type="button"
        className={`view-puzzle-opponent-toggle-btn${
          !isStockfishMode ? ' view-puzzle-opponent-toggle-btn--active' : ''
        }`}
        onClick={onSelectHuman}
      >
        Human
      </button>
    </div>
  );
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

function PlayerBarContent({ username, color, rating }) {
  return (
    <div className="view-brilliant-move-player-bar-main">
      <span className={`view-brilliant-move-player-piece view-brilliant-move-player-piece--${color}`}>
        {color === 'white' ? 'W' : 'B'}
      </span>
      <div className="view-brilliant-move-player-text">
        <span className="view-brilliant-move-player-primary">{username || '—'}</span>
      </div>
      <span className="view-brilliant-move-player-rating">{rating ?? '—'}</span>
    </div>
  );
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function moveButtonClass(index, moveIndex) {
  if (index == null) return 'chess-game-move-btn chess-game-move-btn--empty';

  const classes = ['chess-game-move-btn', 'view-brilliant-move-history-san'];
  if (index === moveIndex) classes.push('chess-game-move-btn--active');
  return classes.join(' ');
}

function buildGameAtIndex(puzzleFen, moves, moveIndex) {
  const nextGame = new Chess(puzzleFen);
  for (let i = 0; i <= moveIndex; i += 1) {
    const move = moves[i];
    if (!move) break;
    nextGame.move(move.san);
  }
  return nextGame;
}

async function fetchStockfishMove(currentFen, depth = STOCKFISH_DEPTH) {
  const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(currentFen)}&depth=${Math.min(depth, 15)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.success || typeof data.bestmove !== 'string') return null;

    const moveParts = data.bestmove.split(' ');
    if (moveParts.length < 2) return null;

    const uciMove = moveParts[1];
    return {
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length === 5 ? uciMove.slice(4, 5) : undefined,
    };
  } catch {
    return null;
  }
}

function PuzzleBoardView({
  puzzle,
  prevPuzzleId,
  nextPuzzleId,
  positionLabel,
  onPrevPuzzle,
  onNextPuzzle,
}) {
  const navigate = useNavigate();
  const boardWrapRef = useRef(null);
  const boardStageRef = useRef(null);
  const moveHistoryRef = useRef(null);
  const [boardSize, setBoardSize] = useState(MIN_BOARD_SIZE);

  const [game, setGame] = useState(null);
  const [fen, setFen] = useState(null);
  const [sessionMoves, setSessionMoves] = useState([]);
  const [moveIndex, setMoveIndex] = useState(-1);
  const [displayLastMove, setDisplayLastMove] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [opponentMode, setOpponentMode] = useState('stockfish');

  const humanColor = puzzle?.turn === 'black' ? 'b' : 'w';
  const engineColor = humanColor === 'w' ? 'b' : 'w';
  const orientation = humanColor === 'w' ? 'white' : 'black';
  const whiteOnBottom = orientation === 'white';

  const isLive = moveIndex === sessionMoves.length - 1;

  const updateStatus = useCallback((currentGame) => {
    if (!currentGame) return;
    if (currentGame.isCheckmate()) {
      setStatusText(`${currentGame.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`);
    } else if (currentGame.isStalemate()) {
      setStatusText('Stalemate');
    } else if (currentGame.isDraw()) {
      setStatusText('Draw');
    } else if (currentGame.inCheck()) {
      setStatusText(`${currentGame.turn() === 'w' ? 'White' : 'Black'} is in check`);
    } else {
      setStatusText(`${currentGame.turn() === 'w' ? 'White' : 'Black'} to move`);
    }
  }, []);

  const applyView = useCallback(
    (nextMoves, nextIndex, puzzleFen) => {
      if (!puzzleFen) return;
      try {
        const nextGame =
          nextIndex < 0 ? new Chess(puzzleFen) : buildGameAtIndex(puzzleFen, nextMoves, nextIndex);
        setGame(nextGame);
        setFen(nextGame.fen());
        setDisplayLastMove(
          nextIndex >= 0
            ? { from: nextMoves[nextIndex].from, to: nextMoves[nextIndex].to }
            : puzzle?.previousMoveFrom && puzzle?.previousMoveTo
              ? { from: puzzle.previousMoveFrom, to: puzzle.previousMoveTo }
              : null
        );
        updateStatus(nextGame);
      } catch {
        setGame(null);
        setFen(null);
        setStatusText('Invalid puzzle position.');
      }
    },
    [puzzle?.previousMoveFrom, puzzle?.previousMoveTo, updateStatus]
  );

  const resetPosition = useCallback(() => {
    if (!puzzle?.puzzleFen) return;
    setSessionMoves([]);
    setMoveIndex(-1);
    setSelectedSquare(null);
    setHighlightedSquares([]);
    setPromotionDialogOpen(false);
    setPendingPromotion(null);
    setIsEngineThinking(false);
    setAnswerRevealed(false);
    setOpponentMode('stockfish');
    applyView([], -1, puzzle.puzzleFen);
    setStatusText(`${humanColor === 'w' ? 'White' : 'Black'} to move`);
  }, [puzzle?.puzzleFen, humanColor, applyView]);

  useEffect(() => {
    resetPosition();
  }, [resetPosition, puzzle?.id]);

  useEffect(() => {
    const main = boardStageRef.current?.closest('.view-puzzle-main');
    if (!main) return undefined;

    const updateSize = () => {
      const stage = boardStageRef.current;
      if (!stage) return;

      const mainWidth = main.clientWidth;
      const topBar = main.querySelector('.view-puzzle-top-bar');
      const bottomBar = main.querySelector('.view-brilliant-move-player-bar--bottom');
      const controls = main.querySelector('.view-puzzle-controls');
      const reservedHeight =
        (topBar?.offsetHeight || 0) +
        (bottomBar?.offsetHeight || 0) +
        (controls?.offsetHeight || 0);
      const maxHeight = Math.max(MIN_BOARD_SIZE, main.clientHeight - reservedHeight);
      const fitSize = Math.min(mainWidth, maxHeight);

      setBoardSize(Math.max(MIN_BOARD_SIZE, Math.floor(fitSize)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(main);
    return () => observer.disconnect();
  }, [puzzle?.id, game]);

  useEffect(() => {
    if (moveIndex < 0 || !moveHistoryRef.current) return;
    const active = moveHistoryRef.current.querySelector(`#puzzle-move-${moveIndex}`);
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moveIndex]);

  const goToMove = useCallback(
    (index) => {
      if (!puzzle?.puzzleFen) return;
      const nextIndex =
        index < 0 ? -1 : Math.max(0, Math.min(index, sessionMoves.length - 1));
      if (nextIndex >= 0 && !sessionMoves.length) return;

      setMoveIndex(nextIndex);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setIsEngineThinking(false);
      applyView(sessionMoves, nextIndex, puzzle.puzzleFen);
    },
    [puzzle?.puzzleFen, sessionMoves, applyView]
  );

  const makeMove = useCallback(
    (move) => {
      if (!game || !puzzle?.puzzleFen || game.isGameOver()) return false;

      const tempGame = new Chess(game.fen());
      let moveResult = null;
      try {
        moveResult = tempGame.move(move);
      } catch {
        moveResult = null;
      }

      if (!moveResult) {
        setSelectedSquare(null);
        setHighlightedSquares([]);
        return false;
      }

      const moveRecord = {
        san: moveResult.san,
        from: moveResult.from,
        to: moveResult.to,
        color: moveResult.color,
      };
      const nextMoves = [...sessionMoves.slice(0, moveIndex + 1), moveRecord];
      const nextIndex = nextMoves.length - 1;

      setSessionMoves(nextMoves);
      setMoveIndex(nextIndex);
      setGame(tempGame);
      setFen(tempGame.fen());
      setDisplayLastMove({ from: moveResult.from, to: moveResult.to });
      setSelectedSquare(null);
      setHighlightedSquares([]);
      updateStatus(tempGame);
      return true;
    },
    [game, puzzle?.puzzleFen, sessionMoves, moveIndex, updateStatus]
  );

  const isStockfishMode = opponentMode === 'stockfish';
  const canMoveCurrentSide = isStockfishMode ? game?.turn() === humanColor : true;

  const isDraggablePiece = useCallback(
    ({ piece }) => {
      if (!game || game.isGameOver() || isEngineThinking || !canMoveCurrentSide) return false;
      if (isStockfishMode) return piece[0] === humanColor;
      return piece[0] === game.turn();
    },
    [game, isEngineThinking, canMoveCurrentSide, isStockfishMode, humanColor]
  );

  const onPromotionCheck = useCallback(
    (sourceSquare, targetSquare, piece) => {
      if (!game || !piece || piece[1].toLowerCase() !== 'p') return false;
      return checkIsPromotion(game, sourceSquare, targetSquare);
    },
    [game]
  );

  const handlePromotionPieceSelect = useCallback(
    (piece, promoteFromSquare, promoteToSquare) => {
      if (!game || !piece) {
        setPromotionDialogOpen(false);
        setPendingPromotion(null);
        return false;
      }

      const promotionPiece = piece[1].toLowerCase();
      const fromSq = promoteFromSquare ?? pendingPromotion?.from;
      const toSq = promoteToSquare ?? pendingPromotion?.to;
      if (!promotionPiece || !fromSq || !toSq) {
        setPromotionDialogOpen(false);
        setPendingPromotion(null);
        return false;
      }

      const success = makeMove({ from: fromSq, to: toSq, promotion: promotionPiece });
      setPromotionDialogOpen(false);
      setPendingPromotion(null);
      return success;
    },
    [game, makeMove, pendingPromotion]
  );

  const onPieceDrop = useCallback(
    (sourceSquare, targetSquare, pieceString) => {
      if (!game || game.isGameOver() || isEngineThinking || !canMoveCurrentSide) return false;
      if (isStockfishMode && pieceString[0] !== humanColor) return false;
      if (!isStockfishMode && pieceString[0] !== game.turn()) return false;

      if (checkIsPromotion(game, sourceSquare, targetSquare)) return true;
      return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    },
    [game, isEngineThinking, canMoveCurrentSide, isStockfishMode, humanColor, makeMove]
  );

  const onSquareClick = useCallback(
    (square) => {
      if (!game || game.isGameOver() || promotionDialogOpen || isEngineThinking || !canMoveCurrentSide) return;

      if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          const moves = game.moves({ square, verbose: true });
          if (moves.length > 0) {
            setSelectedSquare(square);
            setHighlightedSquares(moves.map((m) => m.to));
          }
        }
        return;
      }

      if (square === selectedSquare) {
        setSelectedSquare(null);
        setHighlightedSquares([]);
        return;
      }

      if (highlightedSquares.includes(square)) {
        if (checkIsPromotion(game, selectedSquare, square)) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setPromotionDialogOpen(true);
          setSelectedSquare(null);
          setHighlightedSquares([]);
        } else {
          makeMove({ from: selectedSquare, to: square, promotion: 'q' });
        }
        return;
      }

      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        const moves = game.moves({ square, verbose: true });
        if (moves.length > 0) {
          setSelectedSquare(square);
          setHighlightedSquares(moves.map((m) => m.to));
        } else {
          setSelectedSquare(null);
          setHighlightedSquares([]);
        }
      } else {
        setSelectedSquare(null);
        setHighlightedSquares([]);
      }
    },
    [
      game,
      selectedSquare,
      highlightedSquares,
      promotionDialogOpen,
      isEngineThinking,
      canMoveCurrentSide,
      makeMove,
    ]
  );

  useEffect(() => {
    if (!isStockfishMode) {
      setIsEngineThinking(false);
      return;
    }
    if (!game || !isLive || game.isGameOver()) {
      setIsEngineThinking(false);
      return;
    }
    if (game.turn() !== engineColor) {
      setIsEngineThinking(false);
      return;
    }

    const currentFen = game.fen();
    setIsEngineThinking(true);
    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      const bestMove = await fetchStockfishMove(currentFen);
      if (!cancelled && bestMove && game?.fen() === currentFen && !game?.isGameOver()) {
        makeMove(bestMove);
      }
      if (!cancelled) setIsEngineThinking(false);
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fen, game, engineColor, makeMove, isLive, isStockfishMode]);

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

  const solutionMove = useMemo(() => parseUciMove(puzzle?.solutionUci), [puzzle?.solutionUci]);

  const customSquareStyles = useMemo(() => {
    const styles = {};
    if (!game) return styles;

    highlightedSquares.forEach((sq) => {
      const pieceOnTarget = game.get(sq);
      if (pieceOnTarget && pieceOnTarget.color !== game.turn()) {
        styles[sq] = { backgroundColor: 'rgba(255, 99, 71, 0.4)' };
      } else {
        styles[sq] = { background: 'radial-gradient(circle, rgba(0,0,0,0.2) 25%, transparent 30%)' };
      }
    });

    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(34, 139, 34, 0.5)' };
    }

    if (displayLastMove?.from && displayLastMove?.to) {
      styles[displayLastMove.from] = { background: 'rgba(235, 236, 59, 0.72)' };
      styles[displayLastMove.to] = { background: 'rgba(235, 236, 59, 0.85)' };
    }

    if (answerRevealed && solutionMove && moveIndex < 0 && sessionMoves.length === 0) {
      styles[solutionMove.from] = { background: 'rgba(212, 167, 44, 0.78)' };
      styles[solutionMove.to] = { background: 'rgba(212, 167, 44, 0.95)' };
    }

    const kingSquare = findKingSquare(game);
    if (game.inCheck() && kingSquare) {
      styles[kingSquare] = { backgroundColor: 'rgba(220, 20, 60, 0.7)' };
    }

    return styles;
  }, [
    game,
    highlightedSquares,
    selectedSquare,
    displayLastMove,
    answerRevealed,
    solutionMove,
    moveIndex,
    sessionMoves.length,
  ]);

  const movePairs = useMemo(() => buildMovePairs(sessionMoves), [sessionMoves]);

  const navStatusLabel =
    moveIndex < 0
      ? 'Start position'
      : `Move ${moveIndex + 1} of ${sessionMoves.length}${isLive ? ' · Live' : ''}`;

  if (!puzzle) return null;

  const humanUsername = humanColor === 'w' ? puzzle.whiteUsername : puzzle.blackUsername;
  const opponentUsername = humanColor === 'w' ? puzzle.blackUsername : puzzle.whiteUsername;
  const humanRating = humanColor === 'w' ? puzzle.whiteRating : puzzle.blackRating;
  const opponentRating = humanColor === 'w' ? puzzle.blackRating : puzzle.whiteRating;

  const topPlayer = whiteOnBottom
    ? {
        color: 'black',
        username: humanColor === 'b' ? humanUsername : opponentUsername,
        rating: humanColor === 'b' ? humanRating : opponentRating,
      }
    : {
        color: 'white',
        username: humanColor === 'w' ? humanUsername : opponentUsername,
        rating: humanColor === 'w' ? humanRating : opponentRating,
      };

  const bottomPlayer = whiteOnBottom
    ? {
        color: 'white',
        username: humanColor === 'w' ? humanUsername : opponentUsername,
        rating: humanColor === 'w' ? humanRating : opponentRating,
      }
    : {
        color: 'black',
        username: humanColor === 'b' ? humanUsername : opponentUsername,
        rating: humanColor === 'b' ? humanRating : opponentRating,
      };

  const statusMeta = isEngineThinking ? 'Engine thinking…' : statusText;

  return (
    <div className="view-brilliant-move-layout view-puzzle-layout view-puzzle-layout--play">
      <div className="view-brilliant-move-main view-puzzle-main">
        <div className="view-brilliant-move-player-bar view-brilliant-move-player-bar--top view-puzzle-top-bar">
          <PlayerBarContent {...topPlayer} />
          <span className="view-puzzle-top-bar-status">{statusMeta}</span>
          <OpponentModeToggle
            isStockfishMode={isStockfishMode}
            onSelectStockfish={() => setOpponentMode('stockfish')}
            onSelectHuman={() => setOpponentMode('human')}
          />
        </div>

        <div
          className="view-brilliant-move-board-stage view-puzzle-board-stage"
          ref={boardStageRef}
          style={{ width: boardSize, height: boardSize }}
        >
          {puzzle.puzzleFen && game ? (
            <div
              className="view-puzzle-board-wrap"
              ref={boardWrapRef}
              style={{ width: boardSize, height: boardSize }}
            >
              <Chessboard
                id="view-puzzle-play-board"
                position={fen}
                boardOrientation={orientation}
                boardWidth={boardSize}
                arePiecesDraggable={false}
                isDraggablePiece={isDraggablePiece}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                onPromotionCheck={onPromotionCheck}
                onPromotionPieceSelect={handlePromotionPieceSelect}
                showPromotionDialog={promotionDialogOpen}
                promotionToSquare={pendingPromotion?.to ?? null}
                promotionDialogVariant="modal"
                showBoardNotation
                customDarkSquareStyle={{ backgroundColor: '#779556' }}
                customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
                customSquareStyles={customSquareStyles}
                animationDuration={200}
              />
            </div>
          ) : (
            <p className="view-brilliant-move-no-fen">No puzzle position available.</p>
          )}
        </div>

        <div className="view-brilliant-move-player-bar view-brilliant-move-player-bar--bottom">
          <PlayerBarContent {...bottomPlayer} />
          <span className="view-brilliant-move-bar-meta">{puzzle.timeControl}</span>
        </div>

        <div className="view-puzzle-controls">
          <button
            type="button"
            className="view-puzzle-control-btn view-puzzle-control-btn--primary"
            onClick={() => setAnswerRevealed((prev) => !prev)}
          >
            {answerRevealed ? 'Hide Answer' : 'Show Answer'}
          </button>
          <button type="button" className="view-puzzle-control-btn" onClick={resetPosition}>
            Reset Position
          </button>
          {answerRevealed && puzzle.solutionSan && (
            <span className="view-puzzle-answer">
              Answer: <strong>{puzzle.solutionSan}</strong>
            </span>
          )}
        </div>
      </div>

      <aside className="view-brilliant-move-side-box view-brilliant-move-side-box--history view-puzzle-history-box">
        <header className="view-brilliant-move-side-header">Move History</header>
        <div className="view-brilliant-move-history-body">
          <div className="chess-game-moves-panel view-brilliant-move-history-panel">
            <div ref={moveHistoryRef} className="chess-game-moves-scroll view-brilliant-move-history-scroll">
              {!sessionMoves.length ? (
                <p className="chess-game-moves-empty">
                  Play a move to start.
                  {isStockfishMode ? ' Stockfish will reply.' : ''}
                </p>
              ) : (
                movePairs.map((pair) => (
                  <div key={pair.number} className="chess-game-move-line">
                    <span className="chess-game-move-num">{pair.number}.</span>
                    <button
                      type="button"
                      id={`puzzle-move-${pair.whiteIndex}`}
                      className={moveButtonClass(pair.whiteIndex, moveIndex)}
                      onClick={() => goToMove(pair.whiteIndex)}
                    >
                      {pair.white?.san || ''}
                    </button>
                    <button
                      type="button"
                      id={pair.blackIndex != null ? `puzzle-move-${pair.blackIndex}` : undefined}
                      className={moveButtonClass(pair.blackIndex, moveIndex)}
                      onClick={() => pair.blackIndex != null && goToMove(pair.blackIndex)}
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
              onClick={() => goToMove(-1)}
              disabled={moveIndex < 0 || !sessionMoves.length}
              aria-label="Go to start"
            >
              <FiChevronsLeft />
            </button>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(moveIndex - 1)}
              disabled={moveIndex < 0 || !sessionMoves.length}
              aria-label="Previous move"
            >
              <FiChevronLeft />
            </button>
            <span className="chess-game-control-status view-brilliant-move-control-status">
              {navStatusLabel}
            </span>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(moveIndex + 1)}
              disabled={!sessionMoves.length || moveIndex >= sessionMoves.length - 1}
              aria-label="Next move"
            >
              <FiChevronRight />
            </button>
            <button
              type="button"
              className="chess-game-control-btn"
              onClick={() => goToMove(sessionMoves.length - 1)}
              disabled={!sessionMoves.length || moveIndex >= sessionMoves.length - 1}
              aria-label="Go to end"
            >
              <FiChevronsRight />
            </button>
          </div>

          <div className="view-brilliant-move-game-nav view-puzzle-game-nav">
            <button
              type="button"
              className="view-brilliant-move-game-nav-btn"
              onClick={onPrevPuzzle}
              disabled={prevPuzzleId == null}
            >
              Prev Puzzle
            </button>
            {positionLabel && (
              <span className="view-brilliant-move-game-nav-label">{positionLabel}</span>
            )}
            <button
              type="button"
              className="view-brilliant-move-game-nav-btn"
              onClick={onNextPuzzle}
              disabled={nextPuzzleId == null}
            >
              Next Puzzle
            </button>
          </div>

          {puzzle.stage4MoveId != null && (
            <button
              type="button"
              className="view-brilliant-move-game-link view-puzzle-brilliant-link"
              onClick={() => navigate(`/brilliant-moves/${puzzle.stage4MoveId}`)}
            >
              View brilliant move
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

export default PuzzleBoardView;
