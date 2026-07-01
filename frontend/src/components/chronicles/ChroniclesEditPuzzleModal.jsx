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
  Select,
  FormErrorMessage,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { fetchPrinciples } from '../../services/principlesService';

const INITIAL_FORM = {
  principleId: '',
  fen: '',
  solution: '',
};

function ChroniclesEditPuzzleModal({
  isOpen,
  onClose,
  puzzle,
  onSave,
  saving = false,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [principles, setPrinciples] = useState([]);
  const [error, setError] = useState('');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  useEffect(() => {
    if (!isOpen || !puzzle) return;
    setForm({
      principleId: puzzle.principle_id || '',
      fen: puzzle.fen_with_move || '',
      solution: puzzle.answer || '',
    });
    setError('');
    fetchPrinciples()
      .then(setPrinciples)
      .catch(() => setPrinciples([]));
  }, [isOpen, puzzle]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onSave({
        principleId: form.principleId || null,
        fen: form.fen,
        solution: form.solution,
      });
    } catch (err) {
      setError(err.message || 'Failed to update puzzle.');
    }
  };

  const canSubmit = form.fen.trim() && form.solution.trim() && !saving;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4} as="form" onSubmit={handleSubmit}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Edit Puzzle {puzzle?.chess_puzzle_id || ''}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Link to principle (optional)
              </FormLabel>
              <Select
                value={form.principleId}
                onChange={handleChange('principleId')}
                placeholder="No principle"
                borderColor={borderColor}
                borderRadius="md"
              >
                {principles.map((principle) => (
                  <option key={principle.id} value={principle.id}>
                    {principle.name || principle.id}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired isInvalid={Boolean(error)}>
              <FormLabel fontSize="sm" fontWeight="600">
                FEN position
              </FormLabel>
              <Textarea
                value={form.fen}
                onChange={handleChange('fen')}
                rows={3}
                fontFamily="mono"
                fontSize="sm"
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Solution moves
              </FormLabel>
              <Textarea
                value={form.solution}
                onChange={handleChange('solution')}
                rows={2}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>

            {error ? <FormErrorMessage>{error}</FormErrorMessage> : null}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" onClick={onClose} borderRadius="lg" isDisabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            bg="#ea580c"
            color="white"
            _hover={{ bg: '#c2410c' }}
            borderRadius="lg"
            fontWeight="700"
            isDisabled={!canSubmit}
            isLoading={saving}
          >
            Save Changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default ChroniclesEditPuzzleModal;
