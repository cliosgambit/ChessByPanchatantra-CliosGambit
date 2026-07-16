import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { fetchStockfishMove } from '../../utils/stockfishClient';
import {
  playResetBoardSounds,
  playSoundForSanMove,
  playSoundForVerboseMove,
  playUndoSounds,
  preloadChessSounds,
} from '../../utils/chessSound';

const MORAL_NOTATION_STYLE = {
  lineHeight: 1.15,
  fontWeight: 700,
  opacity: 0.95,
};

function isRankAxisSquare(square, orientation) {
  const file = square[0];
  return orientation === 'white' ? file === 'a' : file === 'h';
}

function isFileAxisSquare(square) {
  return square[1] === '1';
}

const MoralBoardSquare = forwardRef(function MoralBoardSquare(
  { square, squareColor, style, children, boardOrientation },
  ref
) {
  const rankAxis = isRankAxisSquare(square, boardOrientation);
  const fileAxis = isFileAxisSquare(square);
  const corner = rankAxis && fileAxis;
  const className = [
    'moral-zone-board-square',
    rankAxis && 'moral-zone-board-square--rank-axis',
    fileAxis && 'moral-zone-board-square--file-axis',
    corner && 'moral-zone-board-square--corner',
    `moral-zone-board-square--${squareColor}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} style={style} className={className} data-square={square}>
      {children}
    </div>
  );
});

function findKingSquare(game) {
  if (!game) return null;
  const board = game.board();
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.type === 'k' && piece.color === game.turn()) {
        return 'abcdefgh'[col] + (8 - row);
      }
    }
  }
  return null;
}

function rebuildFromSans(initialFen, sans) {
  const nextGame = new Chess(initialFen);
  for (const san of sans) {
    if (!nextGame.move(san)) break;
  }
  return nextGame;
}

const BOARD_SESSION_PREFIX = 'chroniclesPuzzleBoardSession';

function getBoardSessionKey(initialFen, resetKey) {
  return `${BOARD_SESSION_PREFIX}_${resetKey}_${initialFen}`;
}

function loadBoardSession(initialFen, resetKey) {
  if (!initialFen) return null;
  try {
    const raw = localStorage.getItem(getBoardSessionKey(initialFen, resetKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.history)) return null;

    const history = parsed.history.filter((san) => typeof san === 'string' && san.trim());
    const rawRedo = Array.isArray(parsed.redo) ? parsed.redo : [];
    const redoStack = rawRedo.length
      ? rawRedo.map((entry) =>
          Array.isArray(entry)
            ? entry.filter((san) => typeof san === 'string' && san.trim())
            : typeof entry === 'string' && entry.trim()
              ? [entry.trim()]
              : []
        ).filter((batch) => batch.length)
      : [];

    const game = rebuildFromSans(initialFen, history);
    return { game, fen: game.fen(), moveHistory: history, redoStack };
  } catch {
    try {
      localStorage.removeItem(getBoardSessionKey(initialFen, resetKey));
    } catch {
      // ignore
    }
    return null;
  }
}

function saveBoardSession(initialFen, resetKey, history, redo) {
  if (!initialFen) return;
  try {
    localStorage.setItem(
      getBoardSessionKey(initialFen, resetKey),
      JSON.stringify({ history, redo })
    );
  } catch {
    // ignore quota / privacy errors
  }
}

function clearBoardSession(initialFen, resetKey) {
  if (!initialFen) return;
  try {
    localStorage.removeItem(getBoardSessionKey(initialFen, resetKey));
  } catch {
    // ignore
  }
}

const MORAL_BOARD_MIN = 280;
const MORAL_HEIGHT_RATIO = 0.9;
const MORAL_ZONE_RATIO = 0.9;
const MORAL_EDGE_PAD = 4;
const MORAL_TOOLBAR_RESERVE = 44;
const MORAL_CLIP_SAFETY = 12;
const MORAL_SIDEBAR_WIDTH = 132;
const MORAL_HISTORY_GAP = 8;

const MORAL_ZONE_TOOLBAR_RESERVE = 40;
const MORAL_ZONE_BORDER_RESERVE = 16;
const MORAL_ZONE_SIDE_STRIP = 200;

function computeMoralZoneBoardLayout(stageEl) {
  const zoneEl = stageEl?.closest('.moral-puzzles-zone--board') || stageEl;
  if (!zoneEl) {
    const fallback = window.innerHeight * MORAL_ZONE_RATIO * 0.5;
    return { size: Math.floor(Math.max(MORAL_BOARD_MIN, fallback)) };
  }

  const rect = zoneEl.getBoundingClientRect();
  const boardFromHeight = rect.height * MORAL_ZONE_RATIO - MORAL_ZONE_TOOLBAR_RESERVE;
  const boardFromWidth = rect.width * MORAL_ZONE_RATIO - MORAL_ZONE_SIDE_STRIP;
  const size = Math.min(boardFromHeight, boardFromWidth);
  return { size: Math.floor(Math.max(MORAL_BOARD_MIN, size)) };
}

function computeMoralBoardLayout(stageEl) {
  const narrowViewport = window.matchMedia('(max-width: 900px)').matches;

  if (!stageEl) {
    const fallback = window.innerHeight * MORAL_HEIGHT_RATIO - MORAL_TOOLBAR_RESERVE - MORAL_CLIP_SAFETY;
    return {
      size: Math.floor(Math.max(MORAL_BOARD_MIN, fallback)),
      stacked: narrowViewport,
    };
  }

  const rightPanel = stageEl.closest('.moral-puzzles-right--play');
  const panelRect = rightPanel?.getBoundingClientRect();
  const containerWidth = panelRect?.width ?? window.innerWidth * 0.55;
  const panelTop = panelRect?.top ?? 0;

  const sidebarW = narrowViewport ? 0 : MORAL_SIDEBAR_WIDTH;
  const gap = narrowViewport ? 0 : MORAL_HISTORY_GAP;
  const widthCap = containerWidth - sidebarW - gap - MORAL_EDGE_PAD;

  const availableHeight = window.innerHeight - panelTop - MORAL_TOOLBAR_RESERVE - MORAL_CLIP_SAFETY;
  const viewportHeightCap =
    window.innerHeight * MORAL_HEIGHT_RATIO - MORAL_TOOLBAR_RESERVE - MORAL_CLIP_SAFETY;
  const heightCap = Math.min(availableHeight, viewportHeightCap);

  const size = Math.min(widthCap, heightCap);

  return {
    size: Math.floor(Math.max(MORAL_BOARD_MIN, size)),
    stacked: narrowViewport,
  };
}

const ChroniclesPuzzleBoard = forwardRef(function ChroniclesPuzzleBoard(
  {
    initialFen,
    onMoveHistoryChange,
    onControlsChange,
    resetKey = 0,
    layout = 'default',
  },
  ref
) {
  const [game, setGame] = useState(null);
  const [fen, setFen] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [boardWidth, setBoardWidth] = useState(() => {
    if (layout === 'moral-zone') {
      return Math.floor(Math.max(MORAL_BOARD_MIN, window.innerHeight * MORAL_ZONE_RATIO * 0.5));
    }
    if (layout === 'moral') {
      return Math.floor(
        Math.max(
          MORAL_BOARD_MIN,
          window.innerHeight * MORAL_HEIGHT_RATIO - MORAL_TOOLBAR_RESERVE - MORAL_CLIP_SAFETY
        )
      );
    }
    return 480;
  });
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const moveHistoryRef = useRef([]);
  const redoStackRef = useRef([]);
  const [moralStacked, setMoralStacked] = useState(false);
  const [playMode, setPlayMode] = useState('stockfish');
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [statusText, setStatusText] = useState('');

  const humanColor = useMemo(() => {
    if (!initialFen) return 'w';
    try {
      return new Chess(initialFen).turn();
    } catch {
      return 'w';
    }
  }, [initialFen, resetKey]);

  const engineColor = humanColor === 'w' ? 'b' : 'w';
  const boardOrientation = humanColor === 'w' ? 'white' : 'black';
  const isStockfishMode = playMode === 'stockfish';
  const isMoral = layout === 'moral';
  const isMoralZone = layout === 'moral-zone';
  const isMoralStyle = isMoral || isMoralZone;

  const customNotationStyle = useMemo(() => MORAL_NOTATION_STYLE, []);

  const renderMoralSquare = useCallback(
    (props) => <MoralBoardSquare {...props} boardOrientation={boardOrientation} />,
    [boardOrientation]
  );

  const updateStatus = useCallback((currentGame) => {
    if (!currentGame) {
      setStatusText('');
      return;
    }
    if (currentGame.isCheckmate()) {
      setStatusText(`${currentGame.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`);
    } else if (currentGame.isStalemate()) {
      setStatusText('Stalemate');
    } else if (currentGame.isDraw()) {
      setStatusText('Draw');
    } else if (currentGame.inCheck()) {
      setStatusText(`${currentGame.turn() === 'w' ? 'White' : 'Black'} is in check`);
    } else {
      setStatusText(`${currentGame.turn() === 'w' ? "White's" : "Black's"} Turn`);
    }
  }, []);

  useEffect(() => {
    preloadChessSounds();
  }, []);

  useEffect(() => {
    if (!isMoral && !isMoralZone) {
      const handleResize = () => {
        setBoardWidth(Math.min(560, Math.max(320, window.innerWidth - 520)));
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const updateSize = () => {
      if (!stageRef.current) return;
      if (isMoralZone) {
        const frameEl = frameRef.current;
        const frameSize = frameEl
          ? Math.min(frameEl.clientWidth, frameEl.clientHeight)
          : 0;
        if (frameSize > 0) {
          setBoardWidth(frameSize);
          return;
        }
        const { size } = computeMoralZoneBoardLayout(stageRef.current);
        setBoardWidth(size);
        return;
      }
      const { size, stacked } = computeMoralBoardLayout(stageRef.current);
      setBoardWidth(size);
      setMoralStacked(stacked);
    };

    updateSize();

    const stageEl = stageRef.current;
    if (!stageEl) return undefined;

    const ro = new ResizeObserver(updateSize);
    if (isMoralZone) {
      const zoneEl = stageEl.closest('.moral-puzzles-zone--board');
      if (zoneEl) ro.observe(zoneEl);
      if (frameRef.current) ro.observe(frameRef.current);
    } else {
      const rightPanel = stageEl.closest('.moral-puzzles-right--play');
      const wrap = stageEl.closest('.moral-puzzles-board-wrap--play');
      if (rightPanel) ro.observe(rightPanel);
      if (wrap) ro.observe(wrap);
    }
    ro.observe(stageEl);

    window.addEventListener('resize', updateSize);
    const mq = window.matchMedia('(max-width: 900px)');
    mq.addEventListener('change', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      mq.removeEventListener('change', updateSize);
    };
  }, [isMoral, isMoralZone, game]);

  useEffect(() => {
    if (!initialFen) return;
    try {
      const restored = loadBoardSession(initialFen, resetKey);
      if (restored) {
        moveHistoryRef.current = restored.moveHistory;
        redoStackRef.current = restored.redoStack;
        setGame(restored.game);
        setFen(restored.fen);
        setMoveHistory(restored.moveHistory);
        setRedoStack(restored.redoStack);
      } else {
        const nextGame = new Chess(initialFen);
        moveHistoryRef.current = [];
        redoStackRef.current = [];
        setGame(nextGame);
        setFen(nextGame.fen());
        setMoveHistory([]);
        setRedoStack([]);
      }
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setPlayMode('stockfish');
      setIsEngineThinking(false);
      updateStatus(restored?.game ?? new Chess(initialFen));
    } catch {
      setGame(null);
      setFen('');
      setMoveHistory([]);
      setRedoStack([]);
      setStatusText('Invalid puzzle position.');
    }
  }, [initialFen, resetKey, updateStatus]);

  useEffect(() => {
    if (!initialFen || !game) return;
    saveBoardSession(initialFen, resetKey, moveHistory, redoStack);
  }, [initialFen, resetKey, moveHistory, redoStack, game]);

  useEffect(() => {
    moveHistoryRef.current = moveHistory;
  }, [moveHistory]);

  useEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    onMoveHistoryChange?.(moveHistory);
  }, [moveHistory, onMoveHistoryChange]);

  useEffect(() => {
    onControlsChange?.({
      canUndo: moveHistory.length > 0 && !isEngineThinking,
      canRedo: redoStack.length > 0 && !isEngineThinking,
      isEngineThinking,
    });
  }, [moveHistory.length, redoStack.length, isEngineThinking, onControlsChange]);

  const applyMove = useCallback(
    (from, to, promotion = 'q') => {
      if (!game || game.isGameOver()) return false;
      const workingGame = new Chess(game.fen());
      try {
        const result = workingGame.move({ from, to, promotion });
        if (!result) return false;
        setGame(workingGame);
        setFen(workingGame.fen());
        const nextHistory = [...moveHistoryRef.current, result.san];
        moveHistoryRef.current = nextHistory;
        redoStackRef.current = [];
        setMoveHistory(nextHistory);
        setRedoStack([]);
        setSelectedSquare(null);
        setHighlightedSquares([]);
        updateStatus(workingGame);
        playSoundForVerboseMove(result, workingGame);
        return true;
      } catch {
        return false;
      }
    },
    [game, updateStatus]
  );

  const makeMove = useCallback(
    (move) => applyMove(move.from, move.to, move.promotion || 'q'),
    [applyMove]
  );

  const canMoveCurrentSide = isStockfishMode ? game?.turn() === humanColor : true;

  const isDraggablePiece = useCallback(
    ({ piece }) => {
      if (!game || game.isGameOver() || isEngineThinking || !canMoveCurrentSide) return false;
      if (isStockfishMode) return piece[0] === humanColor;
      return piece[0] === game.turn();
    },
    [game, isEngineThinking, canMoveCurrentSide, isStockfishMode, humanColor]
  );

  const onSquareClick = useCallback(
    (square) => {
      if (!game || game.isGameOver() || isEngineThinking || !canMoveCurrentSide) return;

      if (selectedSquare) {
        if (applyMove(selectedSquare, square)) return;
      }

      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        setHighlightedSquares(game.moves({ square, verbose: true }).map((move) => move.to));
        return;
      }

      setSelectedSquare(null);
      setHighlightedSquares([]);
    },
    [applyMove, game, selectedSquare, isEngineThinking, canMoveCurrentSide]
  );

  const onPieceDrop = useCallback(
    (sourceSquare, targetSquare, pieceString) => {
      if (!game || game.isGameOver() || isEngineThinking || !canMoveCurrentSide) return false;
      if (isStockfishMode && pieceString[0] !== humanColor) return false;
      if (!isStockfishMode && pieceString[0] !== game.turn()) return false;
      return applyMove(sourceSquare, targetSquare);
    },
    [applyMove, game, isEngineThinking, canMoveCurrentSide, isStockfishMode, humanColor]
  );

  useEffect(() => {
    if (!isStockfishMode) {
      setIsEngineThinking(false);
      return;
    }
    if (!game || game.isGameOver()) {
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
  }, [fen, game, engineColor, makeMove, isStockfishMode]);

  const handleResetBoard = useCallback(() => {
    if (!initialFen) return;
    try {
      const historyCount = moveHistory.length;
      if (historyCount) {
        playResetBoardSounds(historyCount);
      }
      clearBoardSession(initialFen, resetKey);
      moveHistoryRef.current = [];
      redoStackRef.current = [];
      const nextGame = new Chess(initialFen);
      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory([]);
      setRedoStack([]);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setIsEngineThinking(false);
      updateStatus(nextGame);
    } catch {
      setStatusText('Invalid puzzle position.');
    }
  }, [initialFen, resetKey, moveHistory.length, updateStatus]);

  const handleUndo = useCallback(() => {
    if (!initialFen || isEngineThinking) return;

    const prevHistory = moveHistoryRef.current;
    if (!prevHistory.length) return;

    let nextHistory = [...prevHistory];
    const undone = [];

    const undoOne = () => {
      if (!nextHistory.length) return false;
      undone.unshift(nextHistory.pop());
      return true;
    };

    if (!undoOne()) return;

    if (isStockfishMode) {
      let probe = rebuildFromSans(initialFen, nextHistory);
      while (nextHistory.length > 0 && probe.turn() !== humanColor) {
        if (!undoOne()) break;
        probe = rebuildFromSans(initialFen, nextHistory);
      }
    }

    try {
      const nextGame = rebuildFromSans(initialFen, nextHistory);
      const nextRedo = [[...undone], ...redoStackRef.current];

      moveHistoryRef.current = nextHistory;
      redoStackRef.current = nextRedo;

      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory(nextHistory);
      setRedoStack(nextRedo);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      updateStatus(nextGame);
      playUndoSounds(undone.length);
    } catch {
      // ignore invalid replay
    }
  }, [initialFen, isEngineThinking, isStockfishMode, humanColor, updateStatus]);

  const handleRedo = useCallback(() => {
    if (!initialFen || isEngineThinking) return;

    const prevHistory = moveHistoryRef.current;
    const prevRedo = redoStackRef.current;
    if (!prevRedo.length) return;

    const redoBatch = prevRedo[0];
    const remainingRedo = prevRedo.slice(1);
    if (!redoBatch?.length) return;

    try {
      const nextHistory = [...prevHistory, ...redoBatch];
      const nextGame = rebuildFromSans(initialFen, nextHistory);

      moveHistoryRef.current = nextHistory;
      redoStackRef.current = remainingRedo;

      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory(nextHistory);
      setRedoStack(remainingRedo);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      updateStatus(nextGame);
      redoBatch.forEach((san, index) => {
        const historyBefore = prevHistory.concat(redoBatch.slice(0, index));
        window.setTimeout(() => {
          playSoundForSanMove(initialFen, historyBefore, san);
        }, index * 80);
      });
    } catch {
      // ignore invalid replay
    }
  }, [initialFen, isEngineThinking, updateStatus]);

  useImperativeHandle(
    ref,
    () => ({
      undo: handleUndo,
      redo: handleRedo,
      reset: handleResetBoard,
    }),
    [handleUndo, handleRedo, handleResetBoard]
  );

  const customSquareStyles = useMemo(() => {
    const styles = {};
    if (!game) return styles;

    highlightedSquares.forEach((square) => {
      const pieceOnTarget = game.get(square);
      if (pieceOnTarget && pieceOnTarget.color !== game.turn()) {
        styles[square] = { backgroundColor: 'rgba(255, 99, 71, 0.35)' };
      } else {
        styles[square] = {
          background: 'radial-gradient(circle, rgba(0,0,0,0.18) 25%, transparent 30%)',
        };
      }
    });

    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(34, 139, 34, 0.45)' };
    }

    if (game.inCheck()) {
      const kingSquare = findKingSquare(game);
      if (kingSquare) {
        styles[kingSquare] = { backgroundColor: 'rgba(220, 20, 60, 0.65)' };
      }
    }

    return styles;
  }, [game, highlightedSquares, selectedSquare]);

  const movePairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: moveHistory[i] || '',
        black: moveHistory[i + 1] || '',
      });
    }
    return pairs;
  }, [moveHistory]);

  const turnLabel = useMemo(() => {
    if (!game) return '';
    if (isEngineThinking) return 'Stockfish thinking…';
    if (game.isCheckmate()) {
      return `${game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`;
    }
    if (game.isStalemate()) return 'Stalemate';
    if (game.isDraw()) return 'Draw';
    if (game.inCheck()) {
      return `${game.turn() === 'w' ? 'White' : 'Black'} to play · Check!`;
    }
    return game.turn() === 'w' ? 'White to play' : 'Black to play';
  }, [game, isEngineThinking]);

  if (!game || !fen) {
    return <div className="chronicles-puzzle-board-empty">No valid board position.</div>;
  }

  const statusMeta = isEngineThinking ? 'Stockfish thinking…' : statusText;
  const aiLabel = `vs AI (${humanColor === 'w' ? 'Black' : 'White'})`;

  const board = (
    <Chessboard
      id={isMoralStyle ? 'MoralPuzzleBoard' : 'ChroniclesPuzzleBoard'}
      position={fen}
      boardOrientation={boardOrientation}
      boardWidth={boardWidth}
      isDraggablePiece={isDraggablePiece}
      onSquareClick={onSquareClick}
      onPieceDrop={onPieceDrop}
      customSquare={isMoralStyle ? renderMoralSquare : undefined}
      customSquareStyles={customSquareStyles}
      customNotationStyle={isMoralStyle ? customNotationStyle : undefined}
      customDarkSquareStyle={{ backgroundColor: isMoralStyle ? '#B58863' : '#A98A6E' }}
      customLightSquareStyle={{ backgroundColor: isMoralStyle ? '#F0D9B5' : '#F2E1CD' }}
      animationDuration={150}
      showBoardNotation
    />
  );

  if (isMoralZone) {
    return (
      <div className="moral-zone-board-stage" ref={stageRef}>
        <div className="moral-zone-board-stack">
          <div className="moral-zone-board-body">
            <div className="moral-zone-board-main">
              <div className="moral-zone-board-toolbar">
                <span className="moral-zone-board-turn">{turnLabel}</span>
                <label className="moral-play-ai-toggle">
                  <span>{aiLabel}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isStockfishMode}
                    aria-label={isStockfishMode ? 'Disable AI opponent' : 'Enable AI opponent'}
                    className={`moral-play-switch${isStockfishMode ? ' is-on' : ''}`}
                    onClick={() => setPlayMode(isStockfishMode ? 'human' : 'stockfish')}
                  >
                    <span className="moral-play-switch-knob" />
                  </button>
                </label>
              </div>
              <div className="moral-zone-board-frame" ref={frameRef}>
                {board}
              </div>
            </div>
            <aside className="moral-zone-board-side-strip" aria-label="Move history">
              <header className="moral-zone-side-history-header">Move History</header>
              <div className="moral-zone-side-history-panel">
                <div className="moral-zone-side-history-body">
                  {!movePairs.length ? (
                    <p className="moral-zone-side-history-empty">No moves yet.</p>
                  ) : (
                    movePairs.map((pair) => (
                      <div key={pair.number} className="moral-zone-side-move-line">
                        <span className="moral-zone-side-move-num">{pair.number}.</span>
                        <span>{pair.white}</span>
                        <span>{pair.black}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="moral-zone-side-history-controls">
                  <div className="moral-zone-side-history-controls-row">
                    <button
                      type="button"
                      className="moral-zone-side-history-ctrl-btn"
                      disabled={!moveHistory.length || isEngineThinking}
                      onClick={handleUndo}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      className="moral-zone-side-history-ctrl-btn"
                      disabled={!redoStack.length || isEngineThinking}
                      onClick={handleRedo}
                    >
                      Redo
                    </button>
                  </div>
                  <button
                    type="button"
                    className="moral-zone-side-history-reset-btn"
                    onClick={handleResetBoard}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (isMoral) {
    return (
      <div
        className={[
          'moral-play-board-stage',
          moralStacked ? 'moral-play-board-stage--stacked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        ref={stageRef}
      >
        <div className="moral-play-board-main">
          <div
            className="moral-play-board-frame"
            style={{ width: boardWidth, maxWidth: '100%' }}
          >
            {board}
          </div>
          <div className="moral-play-board-toolbar">
            <span className="moral-play-board-status">{statusMeta}</span>
            <label className="moral-play-ai-toggle">
              <span>{aiLabel}</span>
              <button
                type="button"
                role="switch"
                aria-checked={isStockfishMode}
                className={`moral-play-switch${isStockfishMode ? ' is-on' : ''}`}
                onClick={() => setPlayMode(isStockfishMode ? 'human' : 'stockfish')}
              >
                <span className="moral-play-switch-knob" />
              </button>
            </label>
          </div>
        </div>

        <aside className="moral-play-side">
          <header className="moral-play-side-header">Move History</header>
          <div className="moral-play-history-body">
            {!movePairs.length ? (
              <p className="moral-play-history-empty">No moves yet.</p>
            ) : (
              movePairs.map((pair) => (
                <div key={pair.number} className="moral-play-move-line">
                  <span className="moral-play-move-num">{pair.number}.</span>
                  <span>{pair.white}</span>
                  <span>{pair.black}</span>
                </div>
              ))
            )}
          </div>
          <div className="moral-play-controls">
            <p className="moral-play-controls-label">Controls</p>
            <div className="moral-play-controls-row">
              <button
                type="button"
                className="moral-play-ctrl-btn"
                disabled={!moveHistory.length || isEngineThinking}
                onClick={handleUndo}
              >
                Undo
              </button>
              <button
                type="button"
                className="moral-play-ctrl-btn"
                disabled={!redoStack.length || isEngineThinking}
                onClick={handleRedo}
              >
                Redo
              </button>
            </div>
            <button type="button" className="moral-play-reset-btn" onClick={handleResetBoard}>
              Reset Game
            </button>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="chronicles-puzzle-board-wrap">
      <div className="chronicles-puzzle-board-toolbar">
        <span className="chronicles-puzzle-board-status">{statusMeta}</span>
        <div className="chronicles-puzzle-mode-toggle" role="group" aria-label="Play mode">
          <button
            type="button"
            className={`chronicles-puzzle-mode-btn${
              isStockfishMode ? ' chronicles-puzzle-mode-btn--active' : ''
            }`}
            aria-pressed={isStockfishMode}
            onClick={() => setPlayMode('stockfish')}
          >
            vs Stockfish
          </button>
          <button
            type="button"
            className={`chronicles-puzzle-mode-btn${
              !isStockfishMode ? ' chronicles-puzzle-mode-btn--active' : ''
            }`}
            aria-pressed={!isStockfishMode}
            onClick={() => setPlayMode('human')}
          >
            Human vs Human
          </button>
        </div>
      </div>

      {board}

      <div className="chronicles-puzzle-board-footer">
        <span className="chronicles-puzzle-board-mode-label">
          {isStockfishMode
            ? `You play ${humanColor === 'w' ? 'White' : 'Black'} · Stockfish replies`
            : 'Both sides — pass & play'}
        </span>
        <div className="chronicles-puzzle-board-footer-actions">
          <button
            type="button"
            className="chronicles-puzzle-board-reset"
            disabled={!moveHistory.length || isEngineThinking}
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="chronicles-puzzle-board-reset"
            disabled={!redoStack.length || isEngineThinking}
            onClick={handleRedo}
          >
            Redo
          </button>
          <button type="button" className="chronicles-puzzle-board-reset" onClick={handleResetBoard}>
            Reset board
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChroniclesPuzzleBoard;
