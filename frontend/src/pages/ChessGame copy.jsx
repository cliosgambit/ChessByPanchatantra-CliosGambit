import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  Box,
  Text,
  VStack,
  Button,
  HStack,
  Divider,
  useColorModeValue,
  Flex,
  Switch,
  Spinner,
} from "@chakra-ui/react";

// --- Local Storage Key ---
const LOCAL_STORAGE_KEY = 'chessGameMoveHistory';
const getStorageKey = (fen) => fen ? `${LOCAL_STORAGE_KEY}_${fen}` : LOCAL_STORAGE_KEY;

// --- Sound File Paths (relative to public folder) ---
const soundFiles = {
    move: '/sounds/move.mp3',
    capture: '/sounds/capture.mp3',
    check: '/sounds/check.mp3',
    castle: '/sounds/castle.mp3',
    promote: '/sounds/promote.mp3',
    gameEnd: '/sounds/game-end.mp3'
};

// --- Sound Playing Utility ---
const playSound = (soundType) => {
  const audioSrc = soundFiles[soundType];
  if (audioSrc) {
    const audio = new Audio(audioSrc);
    audio.play().catch(e => {
      console.error("Error playing sound:", soundType, e);
    });
  } else {
    console.warn("Sound type not found:", soundType);
  }
};


// --- Helper Functions (Logical - Unchanged) ---
const findKingSquareFn = (gameInstance) => {
    if (!gameInstance) return null;
    const board = gameInstance.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === "k" && piece.color === gameInstance.turn()) {
          return "abcdefgh"[c] + (8 - r);
        }
      }
    }
    return null;
};
const checkIsPromotionFn = (gameInstance, from, to) => {
    if (!from || !to || !gameInstance) return false;
    const piece = gameInstance.get(from);
    if (!piece || piece.type !== 'p') return false;
    const targetRank = to[1];
    const promotionRank = (piece.color === 'w') ? '8' : '1';
    if (targetRank !== promotionRank) return false;
    const moves = gameInstance.moves({ square: from, verbose: true });
    return moves.some(m => m.to === to && (m.flags.includes('p') || m.promotion));
};


// --- Main Component ---
const ChessGame = ({ initialFen, maxDepth = 15, minDepth = 10 }) => {
  // --- State ---
  const [game, setGame] = useState(null);
  const [fen, setFen] = useState(initialFen || "start");
  const [moveHistory, setMoveHistory] = useState([]);
  const [forwardMoves, setForwardMoves] = useState([]);
  const [humanPlayerColor, setHumanPlayerColor] = useState("white");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pauseAi, setPauseAi] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [statusText, setStatusText] = useState("Loading Game...");
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [pendingManualPromotion, setPendingManualPromotion] = useState(null);
  const [isGameLoading, setIsGameLoading] = useState(true);
  const [startedWithBlackMove, setStartedWithBlackMove] = useState(false);

  // --- Refs (Unchanged) ---
  const moveHistoryRef = useRef(null);

  // --- UI Styling Values ---
  const boardContainerBg = useColorModeValue("white", "gray.700");
  const historyBg = useColorModeValue("white", "gray.700");
  const scrollbarTrackBg = useColorModeValue("gray.100", "gray.600");
  const scrollbarThumbBg = useColorModeValue("gray.400", "gray.400");
  const scrollbarThumbHoverBg = useColorModeValue("gray.500", "gray.300");
  const boardBorderColor = useColorModeValue("gray.300", "gray.600");
  const historyBorderColor = useColorModeValue("gray.200", "gray.600");
  const statusTextColor = useColorModeValue("gray.800", "gray.50");
  const controlsTextColor = useColorModeValue("gray.700", "gray.200");
  const historyTextColor = useColorModeValue("gray.500", "gray.400");
  const historyMoveNumColor = useColorModeValue("gray.600", "gray.400");
  const lastMoveColor = useColorModeValue('black','white');
  const defaultMoveColor = useColorModeValue("gray.700", "gray.300");
  const placeholderMoveColor = useColorModeValue("gray.500", "gray.400");
  const customDarkSquareStyle = useColorModeValue( { backgroundColor: '#A98A6E' }, { backgroundColor: '#6E5B4B' } );
  const customLightSquareStyle = useColorModeValue( { backgroundColor: '#F2E1CD' }, { backgroundColor: '#B3A18F' } );
  const selectedSquareColor = useColorModeValue( "rgba(34, 139, 34, 0.5)", "rgba(46, 160, 67, 0.5)" );
  const legalMoveDotColor = useColorModeValue( "rgba(0, 0, 0, 0.2)", "rgba(255, 255, 255, 0.25)" );
  const captureSquareColor = useColorModeValue( "rgba(255, 99, 71, 0.4)", "rgba(255, 127, 80, 0.45)" );
  const checkHighlightColor = useColorModeValue( "rgba(220, 20, 60, 0.7)", "rgba(255, 69, 0, 0.7)" );
  const [boardWidth, setBoardWidth] = useState(420);

  // --- Utility Functions (Unchanged) ---
  const checkIsPromotion = useCallback((from, to) => checkIsPromotionFn(game, from, to), [game]);
  const updateGameStatus = useCallback((currentGame) => {
    if (!currentGame) { setStatusText("Game not loaded"); return; }
    let status = "";
    if (currentGame.isCheckmate()) status = `${currentGame.turn() === "w" ? "Black" : "White"} wins by Checkmate!`;
    else if (currentGame.isStalemate()) status = "Stalemate!";
    else if (currentGame.isThreefoldRepetition()) status = "Draw by Threefold Repetition";
    else if (currentGame.isInsufficientMaterial()) status = "Draw by Insufficient Material";
    else if (currentGame.isDraw()) status = "Draw by 50-move rule";
    else if (currentGame.inCheck()) status = `${currentGame.turn() === "w" ? "White" : "Black"} is in Check!`;
    else status = `${currentGame.turn() === "w" ? "White's" : "Black's"} Turn`;
    setStatusText(status);
  }, []);

  // --- Window Resize Effect ---
  const [windowSize, setWindowSize] = useState({ innerWidth: window.innerWidth, innerHeight: window.innerHeight});
  useEffect(() => {
     const handleResize = () => {
        const newSize = {
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
        };
        setWindowSize(newSize);
        let bw=newSize.innerWidth/2;
        while (bw > newSize.innerHeight / 1.4 ){
              bw = bw - 20;
        }
        setBoardWidth(bw);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => { window.removeEventListener("resize", handleResize); };
  }, []);


  // --- Load Game on Mount ---
  useEffect(() => {
    let loadedGame = null;
    let loadedHistory = [];
    const storageKey = getStorageKey(initialFen);
    let blackToMoveInitially = false;

    if (initialFen) {
      try {
        loadedGame = new Chess(initialFen);
        if (!loadedGame || !loadedGame.fen()) throw new Error("Invalid FEN");
        blackToMoveInitially = loadedGame.turn() === 'b';
        loadedHistory = [];
        try { localStorage.removeItem(storageKey); } catch (e) { console.error("Failed to clear storage:", e); }
      } catch (fenError) {
        loadedGame = new Chess(); loadedHistory = [];
        blackToMoveInitially = false;
      }
    } else {
      try {
        const storedHistoryString = localStorage.getItem(storageKey);
        if (storedHistoryString) {
          const parsedHistory = JSON.parse(storedHistoryString);
          if (Array.isArray(parsedHistory)) {
            loadedGame = new Chess();
            try {
              parsedHistory.forEach(san => loadedGame.move(san));
              loadedHistory = parsedHistory;
            } catch (replayError) {
              localStorage.removeItem(storageKey); loadedGame = new Chess(); loadedHistory = [];
            }
          } else { localStorage.removeItem(storageKey); loadedGame = new Chess(); loadedHistory = []; }
        } else { loadedGame = new Chess(); loadedHistory = []; }
      } catch (parseError) { localStorage.removeItem(storageKey); loadedGame = new Chess(); loadedHistory = []; }
    }

    setGame(loadedGame);
    setFen(loadedGame.fen());
    setMoveHistory(loadedHistory);
    updateGameStatus(loadedGame);

    const currentTurn = loadedGame.turn();
    const playerColor = currentTurn === 'w' ? 'white' : 'black';
    setHumanPlayerColor(playerColor);

    setStartedWithBlackMove(blackToMoveInitially);
    setIsGameLoading(false);
  }, [initialFen, updateGameStatus]);


  // --- Core Game Logic ---
  const makeMove = useCallback((move) => {
    if (!game) return false;
    let moveResult = null;
    let success = false;
    const tempGame = new Chess(game.fen());

    try {
      moveResult = tempGame.move(move);
    } catch (e) {
      moveResult = null;
    }

    if (moveResult) {
      if (tempGame.isCheckmate() || tempGame.isStalemate() || tempGame.isDraw()) playSound('gameEnd');
      else if (tempGame.inCheck()) playSound('check');
      else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) playSound('castle');
      else if (moveResult.flags.includes('p')) playSound('promote');
      else if (moveResult.flags.includes('c')) playSound('capture');
      else playSound('move');
      
      setGame(tempGame);
      setFen(tempGame.fen());
      setMoveHistory((prev) => {
          const nextHistory = [...prev, moveResult.san];
          const storageKey = getStorageKey(initialFen);
          try { localStorage.setItem(storageKey, JSON.stringify(nextHistory)); } catch (e) { console.error("Failed to save history:", e); }
          return nextHistory;
      });
      setForwardMoves([]);
      updateGameStatus(tempGame);
      if (aiEnabled) setPauseAi(false);
      success = true;
    }

    setSelectedSquare(null);
    setHighlightedSquares([]);
    return success;
  }, [game, updateGameStatus, aiEnabled, initialFen]);


  // --- react-chessboard Callbacks ---
  const isDraggablePiece = useCallback(({ piece }) => {
     if (!game || game.isGameOver() || isGameLoading) return false;
    const pieceColor = piece[0];
    const pieceOwnerTurn = pieceColor === 'w' ? 'white' : 'black';
    if (aiEnabled) {
        const isHumanTurn = game.turn() === humanPlayerColor.charAt(0);
        const isHumanPiece = pieceOwnerTurn === humanPlayerColor;
        return isHumanTurn && isHumanPiece;
    } else { return game.turn() === pieceColor; }
  }, [game, aiEnabled, isGameLoading, humanPlayerColor]);

  const onPromotionCheck = useCallback((sourceSquare, targetSquare, piece) => {
     if (!game || isGameLoading || !piece || piece[1].toLowerCase() !== 'p') return false;
    return checkIsPromotion(sourceSquare, targetSquare);
  }, [checkIsPromotion, game, isGameLoading]);

  const handlePromotionPieceSelect = useCallback((piece, promoteFromSquare, promoteToSquare) => {
     if (!game || isGameLoading || !piece) { if (promotionDialogOpen) { setPromotionDialogOpen(false); setPendingManualPromotion(null); } return false; }
    const promotionPiece = piece[1].toLowerCase();
    const fromSq = promoteFromSquare ?? pendingManualPromotion?.from;
    const toSq = promoteToSquare ?? pendingManualPromotion?.to;
    if (!promotionPiece || !fromSq || !toSq) { if (promotionDialogOpen) { setPromotionDialogOpen(false); setPendingManualPromotion(null); } return false; }
    const success = makeMove({ from: fromSq, to: toSq, promotion: promotionPiece });
    if (promotionDialogOpen) { setPromotionDialogOpen(false); setPendingManualPromotion(null); } return success;
  }, [makeMove, promotionDialogOpen, pendingManualPromotion, game, isGameLoading]);

  const onPieceDrop = useCallback((sourceSquare, targetSquare, pieceString) => {
     if (!game || isGameLoading || game.isGameOver()) return false;
    const pieceColor = pieceString[0];
    const isHumanTurn = game.turn() === humanPlayerColor.charAt(0);
    if (aiEnabled && !isHumanTurn) return false;
    if (!aiEnabled && game.turn() !== pieceColor) return false;
    const isPromo = checkIsPromotion(sourceSquare, targetSquare);
    if (isPromo) return true;
    else return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  }, [game, humanPlayerColor, aiEnabled, checkIsPromotion, makeMove, isGameLoading]);

  const onSquareClick = useCallback((square) => {
     if (!game || game.isGameOver() || promotionDialogOpen || isGameLoading) return;
    if (aiEnabled && game.turn() !== humanPlayerColor.charAt(0)) return;

    if (!selectedSquare) {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            const moves = game.moves({ square: square, verbose: true });
            if (moves.length > 0) { setSelectedSquare(square); setHighlightedSquares(moves.map((m) => m.to)); }
        }
    } else {
        if (square === selectedSquare) { setSelectedSquare(null); setHighlightedSquares([]); return; }
        if (highlightedSquares.includes(square)) {
            const isPromo = checkIsPromotion(selectedSquare, square);
            if (isPromo) {
                setPendingManualPromotion({ from: selectedSquare, to: square }); setPromotionDialogOpen(true);
                setSelectedSquare(null); setHighlightedSquares([]);
            } else { makeMove({ from: selectedSquare, to: square, promotion: 'q' }); }
        } else {
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                const moves = game.moves({ square: square, verbose: true });
                if (moves.length > 0) { setSelectedSquare(square); setHighlightedSquares(moves.map((m) => m.to)); }
                else { setSelectedSquare(null); setHighlightedSquares([]); }
            } else { setSelectedSquare(null); setHighlightedSquares([]); }
        }
    }
  }, [game, selectedSquare, highlightedSquares, humanPlayerColor, aiEnabled, checkIsPromotion, makeMove, promotionDialogOpen, isGameLoading]);


  // --- Control Button Functions ---
  const resetGame = useCallback(() => {
    const newGame = initialFen ? new Chess(initialFen) : new Chess();
    setGame(newGame); setFen(newGame.fen()); setMoveHistory([]); setForwardMoves([]);
    setPauseAi(false); setIsAiThinking(false);
    updateGameStatus(newGame);
    setStartedWithBlackMove(newGame.turn() === 'b');
    const storageKey = getStorageKey(initialFen);
    try { localStorage.removeItem(storageKey); } catch (e) { console.error("Failed to clear storage:", e); }
  }, [updateGameStatus, initialFen]);

  const undoMove = useCallback(() => {
      if (!game || isGameLoading || isAiThinking || moveHistory.length < 1) return;
    const movesToUndo = aiEnabled ? (moveHistory.length === 1 ? 1 : 2) : 1;
    if (moveHistory.length < movesToUndo || game.isGameOver()) return;
    const newHistory = moveHistory.slice(0, moveHistory.length - movesToUndo);
    const undoneMoves = moveHistory.slice(moveHistory.length - movesToUndo);
    setForwardMoves((prev) => [...undoneMoves, ...prev]);
    const baseGame = initialFen ? new Chess(initialFen) : new Chess();
    try { newHistory.forEach((san) => baseGame.move(san)); } catch (e) { resetGame(); return; }
    setGame(baseGame); setFen(baseGame.fen()); setMoveHistory(newHistory);
    const storageKey = getStorageKey(initialFen);
    try { localStorage.setItem(storageKey, JSON.stringify(newHistory)); } catch (e) { console.error("Failed to save history:", e); }
    if (aiEnabled) setPauseAi(true); setIsAiThinking(false); updateGameStatus(baseGame);
  }, [aiEnabled, moveHistory, game, resetGame, updateGameStatus, isGameLoading, isAiThinking, initialFen]);

  const forwardMove = useCallback(() => {
      if (!game || isGameLoading || isAiThinking || forwardMoves.length < 1) return;
    const movesToRedo = aiEnabled ? (forwardMoves.length === 1 ? 1 : 2) : 1;
    if (forwardMoves.length < movesToRedo || game.isGameOver()) return;
    const redoSANs = forwardMoves.slice(0, movesToRedo);
    const remainingForwardMoves = forwardMoves.slice(movesToRedo);
    const tempGame = new Chess(game.fen());
    try { redoSANs.forEach(san => tempGame.move(san)); } catch(e) { setForwardMoves([]); return; }
    const nextHistory = [...moveHistory, ...redoSANs];
    setGame(tempGame); setFen(tempGame.fen()); setMoveHistory(nextHistory);
    const storageKey = getStorageKey(initialFen);
    try { localStorage.setItem(storageKey, JSON.stringify(nextHistory)); } catch (e) { console.error("Failed to save history:", e); }
    setForwardMoves(remainingForwardMoves); updateGameStatus(tempGame);
    if (aiEnabled) setPauseAi(false);
  }, [aiEnabled, forwardMoves, game, updateGameStatus, moveHistory, isGameLoading, isAiThinking, initialFen]);


  // --- [MODIFIED AND CORRECTED] AI Logic ---
  const fetchBestMove = useCallback(async (currentFen) => {
    // API allows depth up to 15.
    const depth = Math.min(maxDepth, 15);
    console.log(`[ChessGame] AI Fetch (Online API @ Depth: ${depth})`);

    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(currentFen)}&depth=${depth}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API error: ${res.status} - ${errorText}`);
      }

      const data = await res.json();

      if (data.success && data.bestmove && typeof data.bestmove === 'string') {
        // The API returns a string like "bestmove e2e4 ponder e7e5". We need the second part.
        const moveParts = data.bestmove.split(' ');
        if (moveParts.length < 2) {
          console.error("[fetchBestMove] Invalid bestmove format from API:", data.bestmove);
          return null;
        }

        const uciMove = moveParts[1]; // e.g., "e2e4" or "a7a8q"
        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion = uciMove.length === 5 ? uciMove.slice(4, 5) : undefined;
        
        return { from, to, promotion };

      } else {
        console.error("[fetchBestMove] Invalid or unsuccessful response from online API:", data);
        return null;
      }
    } catch (err) {
      console.error("[fetchBestMove] Network/API fetch error:", err.message);
      return null;
    }
  }, [maxDepth]);

  useEffect(() => {
    if (!game || game.isGameOver() || isGameLoading) return;
    const isAITurn = game.turn() !== humanPlayerColor.charAt(0);
    let timeoutId = null;
    if (aiEnabled && !pauseAi && isAITurn) {
      const currentFen = game.fen();
      setIsAiThinking(true);
      timeoutId = setTimeout(async () => {
        const stillValidToFetch = aiEnabled && !pauseAi && game?.fen() === currentFen && !game?.isGameOver();
        if (stillValidToFetch) {
          const bestMove = await fetchBestMove(currentFen);
          const stillValidToApply = aiEnabled && !pauseAi && game?.fen() === currentFen && !game?.isGameOver();
          if (bestMove && stillValidToApply) { makeMove(bestMove); }
        }
        setIsAiThinking(false);
      }, 1000);
    } else if (isAiThinking) {
      setIsAiThinking(false);
    }
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [fen, game, aiEnabled, pauseAi, humanPlayerColor, fetchBestMove, makeMove, isGameLoading]);


  // --- Auto-scroll & Style Functions (Unchanged) ---
  useEffect(() => {
    if (moveHistoryRef.current) { moveHistoryRef.current.scrollTop = moveHistoryRef.current.scrollHeight; }
  }, [moveHistory]);

  const getCustomSquareStyles = useCallback(() => {
    const styles = {}; if (!game) return styles; const kingSquare = findKingSquareFn(game); const isInCheck = game.inCheck();
    highlightedSquares.forEach((sq) => { const pieceOnTarget = game.get(sq); if (pieceOnTarget && pieceOnTarget.color !== game.turn()) { styles[sq] = { backgroundColor: captureSquareColor }; } else { styles[sq] = { background: `radial-gradient(circle, ${legalMoveDotColor} 25%, transparent 30%)` }; } });
    if (selectedSquare) { styles[selectedSquare] = { backgroundColor: selectedSquareColor }; }
    if (isInCheck && kingSquare) { styles[kingSquare] = { backgroundColor: checkHighlightColor }; } return styles;
  }, [ game, selectedSquare, highlightedSquares, selectedSquareColor, legalMoveDotColor, captureSquareColor, checkHighlightColor ]);


  // --- Render (Unchanged) ---
  return (
    <HStack align="start" spacing={6} p={5}>
      <Box borderRadius="lg" p={4} bg={boardContainerBg} boxShadow="xl" border="1px" borderColor={boardBorderColor}>
        <Flex justify="space-between" align="center" mb={3} px={1}>
          <Flex align="center" minH="28px" flexShrink={1} overflow="hidden" mr={3}>
            {(isGameLoading || isAiThinking) && <Spinner color="teal.500" size="sm" mr={2} />}
            <Text fontSize="xl" fontWeight="bold" noOfLines={1} title={statusText} color={statusTextColor}>
              {isGameLoading ? "Loading Game..." : statusText}
            </Text>
          </Flex>
          <HStack spacing={3} align="center" flexShrink={0}>
            <Text fontSize="sm" fontWeight="medium" color={useColorModeValue("gray.600", "gray.300")}>
              {aiEnabled ? `vs AI (${humanPlayerColor === 'white' ? 'Black' : 'White'})` : "Pass & Play"}
            </Text>
            <Switch id="ai-switch" colorScheme="teal" isChecked={aiEnabled} onChange={(e) => { setAiEnabled(e.target.checked); if (e.target.checked) setPauseAi(false); else setIsAiThinking(false); }} isDisabled={isGameLoading || game?.isGameOver() || isAiThinking} size="md"/>
          </HStack>
        </Flex>
        {isGameLoading ? (
            <Box width={`${boardWidth}px`} height={`${boardWidth}px`} display="flex" alignItems="center" justifyContent="center">
                <Text color={statusTextColor}>Loading Board...</Text>
            </Box>
        ) : (
            <Chessboard id="PlayerVsAiBoard" position={fen} isDraggablePiece={isDraggablePiece} onPieceDrop={onPieceDrop} onSquareClick={onSquareClick} onPromotionCheck={onPromotionCheck} onPromotionPieceSelect={handlePromotionPieceSelect} showPromotionDialog={promotionDialogOpen} promotionToSquare={pendingManualPromotion?.to ?? null} promotionDialogVariant="modal"
              boardOrientation={humanPlayerColor} boardWidth={boardWidth} customSquareStyles={getCustomSquareStyles()} customDarkSquareStyle={customDarkSquareStyle} customLightSquareStyle={customLightSquareStyle} snapToCursor={true} animationDuration={150} />
        )}
      </Box>

      <VStack align="stretch" spacing={5} width="220px" pt={1}>
        <Divider />
         <VStack align="stretch" spacing={2}>
             <Text fontSize="lg" fontWeight="bold" color={controlsTextColor}>Move History</Text>
            <Box
              ref={moveHistoryRef}
              h={Math.min(windowSize.innerHeight/2,windowSize.innerWidth/3)}
              w={Math.min(windowSize.innerWidth/4, windowSize.innerHeight/3.7)}
              overflowY="auto"
              bg={historyBg} p={3} borderRadius="md" boxShadow="md"  border="1px" borderColor={historyBorderColor}
              sx={{ '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-track': { background: scrollbarTrackBg }, '&::-webkit-scrollbar-thumb': { background: scrollbarThumbBg }, '&::-webkit-scrollbar-thumb:hover': { background: scrollbarThumbHoverBg } }}
            >
              {isGameLoading ? (
                  <Flex justify="center" align="center" h="100%"> <Text color={historyTextColor} fontStyle="italic">Loading history...</Text> </Flex>
              ) :
                (moveHistory.length === 0 && !startedWithBlackMove) ? (
                  <Flex justify="center" align="center" h="100%"> <Text color={historyTextColor} fontStyle="italic">No moves yet.</Text> </Flex>
                ) : (
                 <VStack spacing={1} align="stretch">
                    {(() => {
                        const pairs = [];
                        if (startedWithBlackMove) {
                            pairs.push({ moveNumber: 1, white: "...", black: moveHistory.length > 0 ? moveHistory[0] : undefined, isWhiteLast: false, isBlackLast: moveHistory.length === 1, usePlaceholderStyle: true });
                            for (let i = 1; i < moveHistory.length; i += 2) pairs.push({ moveNumber: Math.floor(i / 2) + 2, white: moveHistory[i], black: moveHistory[i + 1], isWhiteLast: i === moveHistory.length - 1, isBlackLast: (i + 1) === moveHistory.length - 1 });
                        } else {
                            for (let i = 0; i < moveHistory.length; i += 2) pairs.push({ moveNumber: (i / 2) + 1, white: moveHistory[i], black: moveHistory[i + 1], isWhiteLast: i === moveHistory.length - 1, isBlackLast: (i + 1) === moveHistory.length - 1 });
                        }
                        if (startedWithBlackMove && moveHistory.length === 0 && pairs.length === 0) {
                           pairs.push({ moveNumber: 1, white: "...", black: undefined, isWhiteLast: false, isBlackLast: false, usePlaceholderStyle: true });
                        }

                        return pairs.map((item) => (
                            <Flex key={item.moveNumber} justify="start" align="center" fontSize="sm" py="2px" wrap="nowrap" >
                                <Text fontWeight="bold" minW="30px" textAlign="right" mr={2} color={historyMoveNumColor}>{item.moveNumber}.</Text>
                                <Text minW="55px" px={1} fontWeight={item.isWhiteLast ? 'extrabold': 'normal'} color={item.usePlaceholderStyle ? placeholderMoveColor : (item.isWhiteLast ? lastMoveColor : defaultMoveColor)} visibility={item.white ? 'visible' : 'hidden'}>{item.white ?? ""}</Text>
                                <Text minW="55px" px={1} fontWeight={item.isBlackLast ? 'extrabold': 'normal'} color={item.isBlackLast ? lastMoveColor : defaultMoveColor} visibility={item.black ? 'visible' : 'hidden'}>{item.black ?? ""}</Text>
                            </Flex>
                        ));
                    })()}
                 </VStack>
              )}
            </Box>
         </VStack>
         <VStack align="stretch" spacing={3}>
             <Text fontSize="lg" fontWeight="bold" color={controlsTextColor}>Controls</Text>
             <HStack spacing={3}>
               <Button colorScheme="orange" variant="outline" onClick={undoMove} isDisabled={isGameLoading || isAiThinking || moveHistory.length < 1 || game?.isGameOver()} size="sm" flexGrow={1}> Undo </Button>
               <Button colorScheme="cyan" variant="outline" onClick={forwardMove} isDisabled={isGameLoading || isAiThinking || forwardMoves.length < 1 || game?.isGameOver()} size="sm" flexGrow={1}> Redo </Button>
             </HStack>
             <Button colorScheme="red" variant="solid" onClick={resetGame} isDisabled={isGameLoading || isAiThinking} size="sm" width="100%"> Reset Game </Button>
        </VStack>
      </VStack>
    </HStack>
  );
};

export default ChessGame;