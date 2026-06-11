// frontend/src/components/GameViewer.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
    Box, VStack, HStack, Button, Text, Heading, Tag, useColorModeValue,
    Divider, Flex
} from '@chakra-ui/react';
import { ArrowLeftIcon, ArrowRightIcon, ArrowBackIcon, ArrowForwardIcon, RepeatIcon } from '@chakra-ui/icons';

const pieceNames = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

const GameViewer = ({ gameData, filteredMovesData }) => {
  // --- State ---
  const [game, setGame] = useState(new Chess());
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [currentFilteredIndex, setCurrentFilteredIndex] = useState(-1);
  const moveHistoryRef = useRef(null);

  // --- Memos for Derived Data ---
  const history = useMemo(() => {
    const newGame = new Chess();
    try {
      const fullPgn = `[White "${gameData.white_player}"]\n[Black "${gameData.black_player}"]\n\n${gameData.pgn_moves}`;
      newGame.loadPgn(fullPgn);
      return newGame.history({ verbose: true });
    } catch (e) {
      console.error("Error loading PGN for history:", e);
      return [];
    }
  }, [gameData]);

  const fen = useMemo(() => {
    const tempGame = new Chess();
    history.slice(0, currentHistoryIndex + 1).forEach(move => {
      tempGame.move(move.san);
    });
    return tempGame.fen();
  }, [currentHistoryIndex, history]);

  const currentMove = history[currentHistoryIndex];
  const currentFilteredMoveData = filteredMovesData[currentFilteredIndex];

  // --- Effects ---
  useEffect(() => {
    setCurrentHistoryIndex(-1);
    setCurrentFilteredIndex(-1);
  }, [gameData]);

  useEffect(() => {
    // Auto-scroll the move history list
    const activeMoveElement = document.getElementById(`move-${currentHistoryIndex}`);
    if (activeMoveElement && moveHistoryRef.current) {
        moveHistoryRef.current.scrollTop = activeMoveElement.offsetTop - (moveHistoryRef.current.offsetHeight / 2);
    }
  }, [currentHistoryIndex]);

  // --- Navigation Handlers ---
  const navigateToMove = (historyIndex) => {
    if (historyIndex >= -1 && historyIndex < history.length) {
      setCurrentHistoryIndex(historyIndex);
      // If we land on a filtered move, update the filtered index
      const newFilteredIndex = filteredMovesData.findIndex(fm => fm.moveIndex === historyIndex);
      setCurrentFilteredIndex(newFilteredIndex);
    }
  };

  const goToNextFiltered = () => {
    const nextIndex = currentFilteredIndex + 1;
    if (nextIndex < filteredMovesData.length) {
      setCurrentFilteredIndex(nextIndex);
      navigateToMove(filteredMovesData[nextIndex].moveIndex);
    }
  };

  const goToPrevFiltered = () => {
    const prevIndex = currentFilteredIndex - 1;
    if (prevIndex >= 0) {
      setCurrentFilteredIndex(prevIndex);
      navigateToMove(filteredMovesData[prevIndex].moveIndex);
    } else {
        setCurrentFilteredIndex(-1);
        navigateToMove(-1);
    }
  };

  return (
    <VStack spacing={6} align="stretch" p={4} borderWidth="1px" borderRadius="lg" bg={useColorModeValue('white', 'gray.700')}>
        <Heading size="md" textAlign="center">{gameData.white_player} vs {gameData.black_player}</Heading>
      
        <HStack spacing={6} align="start" justify="center">
            {/* Chessboard */}
            <Box w={{ base: '100%', md: '400px', lg: '500px' }}>
                <Chessboard position={fen} arePiecesDraggable={false} />
            </Box>

            {/* Controls and History Sidebar */}
            <VStack spacing={5} align="stretch" w="300px">
                
                {/* Filtered Move Controls */}
                <VStack align="stretch" p={4} bg={useColorModeValue('blue.50', 'blue.900')} borderRadius="md">
                    <Text fontWeight="bold">Filtered Moves</Text>
                    <HStack>
                        <Button onClick={goToPrevFiltered} isDisabled={currentFilteredIndex <= -1} leftIcon={<ArrowBackIcon />}>Prev</Button>
                        <Button onClick={goToNextFiltered} isDisabled={currentFilteredIndex >= filteredMovesData.length - 1} rightIcon={<ArrowForwardIcon />}>Next</Button>
                    </HStack>
                    <Box p={2} bg={useColorModeValue('blue.100', 'blue.800')} borderRadius="sm">
                        <Text fontSize="sm">
                            {filteredMovesData.length > 0 ? `Showing filtered move ${currentFilteredIndex + 1} of ${filteredMovesData.length}` : 'No hanging pieces found.'}
                        </Text>
                    </Box>
                    {currentFilteredMoveData && (
                        <Box>
                            <Text fontWeight="bold" fontSize="sm">Reason for Filter:</Text>
                            <Tag colorScheme="red" size="md">
                                Hanging Piece: {pieceNames[currentFilteredMoveData.hangingPiece.type]} on {currentFilteredMoveData.hangingPiece.square}
                            </Tag>
                        </Box>
                    )}
                </VStack>

                <Divider />

                {/* All Move Controls & History */}
                <VStack align="stretch">
                    <Text fontWeight="bold">Game Navigation</Text>
                    <HStack>
                        <Button onClick={() => navigateToMove(-1)} isDisabled={currentHistoryIndex === -1} leftIcon={<RepeatIcon />}>Start</Button>
                        <Button onClick={() => navigateToMove(currentHistoryIndex - 1)} isDisabled={currentHistoryIndex < 0} leftIcon={<ArrowLeftIcon />}>Prev</Button>
                        <Button onClick={() => navigateToMove(currentHistoryIndex + 1)} isDisabled={currentHistoryIndex >= history.length - 1} rightIcon={<ArrowRightIcon />}>Next</Button>
                    </HStack>
                    <Box ref={moveHistoryRef} h="300px" overflowY="auto" p={2} borderWidth="1px" borderRadius="md" bg={useColorModeValue('gray.50', 'gray.800')}>
                        {history.length === 0 ? <Text>No moves.</Text> : (
                            history.map((move, index) => {
                                if(index % 2 === 0) { // Start of a move pair
                                    const moveNumber = Math.floor(index / 2) + 1;
                                    const blackMove = history[index + 1];
                                    return (
                                        <Flex key={moveNumber} id={`move-pair-${moveNumber}`} direction="row" align="baseline" >
                                            <Text fontWeight="bold" w="30px" textAlign="right" mr={2}>{moveNumber}.</Text>
                                            <Text id={`move-${index}`} w="80px" px={2} borderRadius="sm" bg={currentHistoryIndex === index ? 'teal.200' : 'transparent'}>{move.san}</Text>
                                            {blackMove && <Text id={`move-${index+1}`} w="80px" px={2} borderRadius="sm" bg={currentHistoryIndex === index+1 ? 'teal.200' : 'transparent'}>{blackMove.san}</Text>}
                                        </Flex>
                                    )
                                }
                                return null;
                            })
                        )}
                    </Box>
                </VStack>
            </VStack>
        </HStack>
    </VStack>
  );
};

export default GameViewer;