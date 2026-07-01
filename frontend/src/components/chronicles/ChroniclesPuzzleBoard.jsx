import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { fetchStockfishMove } from '../../utils/stockfishClient';
import PuzzlePlayModeToggle from './PuzzlePlayModeToggle';

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

function ChroniclesPuzzleBoard({ initialFen, onMoveHistoryChange, resetKey = 0 }) {
  const [game, setGame] = useState(null);
  const [fen, setFen] = useState('');
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [boardWidth, setBoardWidth] = useState(480);
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
      setStatusText(`${currentGame.turn() === 'w' ? 'White' : 'Black'} to move`);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const width = Math.min(560, Math.max(320, window.innerWidth - 520));
      setBoardWidth(width);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!initialFen) return;
    try {
      const nextGame = new Chess(initialFen);
      setGame(nextGame);
      setFen(nextGame.fen());
      setMoveHistory([]);
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setPlayMode('stockfish');
      setIsEngineThinking(false);
      updateStatus(nextGame);
    } catch {
      setGame(null);
      setFen('');
      setMoveHistory([]);
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
      setSelectedSquare(null);
      setHighlightedSquares([]);
      setIsEngineThinking(false);
      updateStatus(nextGame);
    } catch {
      setStatusText('Invalid puzzle position.');
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

  if (!game || !fen) {
    return <div className="chronicles-puzzle-board-empty">No valid board position.</div>;
  }

  const statusMeta = isEngineThinking ? 'Stockfish thinking…' : statusText;

  return (
    <div className="chronicles-puzzle-board-wrap">
      <div className="chronicles-puzzle-board-toolbar">
        <span className="chronicles-puzzle-board-status">{statusMeta}</span>
        <PuzzlePlayModeToggle
          playMode={playMode}
          onSelectStockfish={() => setPlayMode('stockfish')}
          onSelectHuman={() => setPlayMode('human')}
        />
      </div>

      <Chessboard
        id="ChroniclesPuzzleBoard"
        position={fen}
        boardOrientation={boardOrientation}
        boardWidth={boardWidth}
        isDraggablePiece={isDraggablePiece}
        onSquareClick={onSquareClick}
        onPieceDrop={onPieceDrop}
        customSquareStyles={customSquareStyles}
        customDarkSquareStyle={{ backgroundColor: '#A98A6E' }}
        customLightSquareStyle={{ backgroundColor: '#F2E1CD' }}
        animationDuration={150}
        showBoardNotation
      />

      <div className="chronicles-puzzle-board-footer">
        <span className="chronicles-puzzle-board-mode-label">
          {isStockfishMode
            ? `You play ${humanColor === 'w' ? 'White' : 'Black'} · Stockfish replies`
            : 'Both sides — pass & play'}
        </span>
        <button type="button" className="chronicles-puzzle-board-reset" onClick={handleResetBoard}>
          Reset board
        </button>
      </div>
    </div>
  );
}

export default ChroniclesPuzzleBoard;
