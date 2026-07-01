import React, { useEffect, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Textarea,
  FormErrorMessage,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { createPuzzle } from '../../services/puzzleService';

function PuzzleModal({ isOpen, onClose, principleId, onSuccess }) {
  const [fen, setFen] = useState('');
  const [solution, setSolution] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const reset = () => {
    setFen('');
    setSolution('');
    setError('');
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const saved = await createPuzzle({ principleId, fen, solution });
      toast({ title: 'Puzzle added', status: 'success', duration: 2000 });
      onSuccess?.(saved);
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to save puzzle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Add Puzzle</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={Boolean(error)}>
              <FormLabel fontSize="sm">FEN Position</FormLabel>
              <Textarea
                value={fen}
                onChange={(e) => setFen(e.target.value)}
                placeholder="e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                rows={3}
                resize="vertical"
                fontFamily="mono"
                fontSize="sm"
              />
            </FormControl>

            <FormControl isInvalid={Boolean(error)}>
              <FormLabel fontSize="sm">Solution Moves</FormLabel>
              <Textarea
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                placeholder="e.g. 1. Ne8+ Qxe5 2. Rf8#"
                rows={3}
                resize="vertical"
              />
            </FormControl>

            {error && <FormErrorMessage>{error}</FormErrorMessage>}
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={handleClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button type="submit" colorScheme="gold" isLoading={loading}>
            Save Puzzle
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default PuzzleModal;
