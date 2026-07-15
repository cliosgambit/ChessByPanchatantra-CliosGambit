import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { fetchStockfishMove } from '../../utils/stockfishClient';

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

function ChroniclesPuzzleBoard({
  initialFen,
  onMoveHistoryChange,
  resetKey = 0,
  layout = 'default',
}) {
  const [game, setGame] = useState(null);
  const [fen, setFen] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [boardWidth, setBoardWidth] = useState(layout === 'moral' ? 420 : 480);
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
    const handleResize = () => {
      if (isMoral) {
        setBoardWidth(Math.min(460, Math.max(280, window.innerWidth - 720)));
      } else {
        setBoardWidth(Math.min(560, Math.max(320, window.innerWidth - 520)));
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMoral]);

  useEffect(() => {
    if (!initialFen) return;
    try {
      const nextGame = new Chess(initialFen);
      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory([]);
      setRedoStack([]);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setPlayMode('stockfish');
      setIsEngineThinking(false);
      updateStatus(nextGame);
    } catch {
      setGame(null);
      setFen('');
      setMoveHistory([]);
      setRedoStack([]);
      setStatusText('Invalid puzzle position.');
    }
  }, [initialFen, resetKey, updateStatus]);

  useEffect(() => {
    onMoveHistoryChange?.(moveHistory);
  }, [moveHistory, onMoveHistoryChange]);

  const applyMove = useCallback(
    (from, to, promotion = 'q') => {
      if (!game || game.isGameOver()) return false;
      const workingGame = new Chess(game.fen());
      try {
        const result = workingGame.move({ from, to, promotion });
        if (!result) return false;
        setGame(workingGame);
        setFen(workingGame.fen());
        setMoveHistory((prev) => [...prev, result.san]);
        setRedoStack([]);
        setSelectedSquare(null);
        setHighlightedSquares([]);
        updateStatus(workingGame);
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

  const handleResetBoard = () => {
    if (!initialFen) return;
    try {
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
  };

  const handleUndo = () => {
    if (!initialFen || !moveHistory.length || isEngineThinking) return;
    try {
      let nextHistory = [...moveHistory];
      const undone = [];

      const undoOne = () => {
        if (!nextHistory.length) return false;
        undone.unshift(nextHistory.pop());
        return true;
      };

      // Always undo at least one ply
      if (!undoOne()) return;

      // vs AI: keep undoing until it is the human's turn to move
      if (isStockfishMode) {
        let probe = rebuildFromSans(initialFen, nextHistory);
        while (nextHistory.length > 0 && probe.turn() !== humanColor) {
          if (!undoOne()) break;
          probe = rebuildFromSans(initialFen, nextHistory);
        }
      }

      const nextGame = rebuildFromSans(initialFen, nextHistory);
      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory(nextHistory);
      setRedoStack((prev) => [...undone, ...prev]);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      updateStatus(nextGame);
    } catch {
      // ignore
    }
  };

  const handleRedo = () => {
    if (!initialFen || !redoStack.length || isEngineThinking) return;
    const [nextSan, ...rest] = redoStack;
    try {
      const nextHistory = [...moveHistory, nextSan];
      const nextGame = rebuildFromSans(initialFen, nextHistory);
      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory(nextHistory);
      setRedoStack(rest);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      updateStatus(nextGame);
    } catch {
      // ignore
    }
  };

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

  if (!game || !fen) {
    return <div className="chronicles-puzzle-board-empty">No valid board position.</div>;
  }

  const statusMeta = isEngineThinking ? 'Stockfish thinking…' : statusText;
  const aiLabel = `vs AI (${humanColor === 'w' ? 'Black' : 'White'})`;

  const board = (
    <Chessboard
      id={isMoral ? 'MoralPuzzleBoard' : 'ChroniclesPuzzleBoard'}
      position={fen}
      boardOrientation={boardOrientation}
      boardWidth={boardWidth}
      isDraggablePiece={isDraggablePiece}
      onSquareClick={onSquareClick}
      onPieceDrop={onPieceDrop}
      customSquareStyles={customSquareStyles}
      customDarkSquareStyle={{ backgroundColor: isMoral ? '#B58863' : '#A98A6E' }}
      customLightSquareStyle={{ backgroundColor: isMoral ? '#F0D9B5' : '#F2E1CD' }}
      animationDuration={150}
      showBoardNotation
    />
  );

  if (isMoral) {
    return (
      <div className="moral-play-board-stage">
        <div className="moral-play-board-main">
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
          <div className="moral-play-board-frame" style={{ width: boardWidth, height: boardWidth }}>
            {board}
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
}

export default ChroniclesPuzzleBoard;
