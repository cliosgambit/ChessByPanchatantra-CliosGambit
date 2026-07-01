import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Text,
} from '@chakra-ui/react';
import ChessGame from '../../pages/ChessGame';

function puzzleModalTitle(puzzle) {
  if (!puzzle) return 'Puzzle';
  return (
    puzzle.chess_puzzle_id ||
    puzzle.id ||
    puzzle.chessComId ||
    puzzle.playersLabel ||
    'Puzzle'
  );
}

function ChroniclesPuzzleViewModal({ isOpen, onClose, puzzle }) {
  if (!puzzle) return null;

  const fen = puzzle.fen_with_move || puzzle.fen || puzzle.puzzleFen;
  const solution = puzzle.answer || puzzle.solutionSan || puzzle.solution;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4} maxH="92vh">
        <ModalHeader pb={2}>{puzzleModalTitle(puzzle)}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {solution ? (
            <Text fontSize="sm" color="gray.600" mb={4}>
              Solution: {solution}
            </Text>
          ) : null}
          {fen ? (
            <ChessGame initialFen={fen} maxDepth={12} minDepth={8} />
          ) : (
            <Text fontSize="sm" color="gray.500">
              No board position available.
            </Text>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default ChroniclesPuzzleViewModal;
