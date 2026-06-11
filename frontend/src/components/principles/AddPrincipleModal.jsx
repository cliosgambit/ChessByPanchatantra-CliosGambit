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
  Input,
  Textarea,
  FormErrorMessage,
  VStack,
  Spinner,
  useColorModeValue,
} from '@chakra-ui/react';
import { createPrinciple, getNextPrincipleId } from '../../services/principlesService';

function AddPrincipleModal({ isOpen, onClose, onSuccess }) {
  const [generatedId, setGeneratedId] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [principle, setPrinciple] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const readOnlyBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const readOnlyColor = useColorModeValue('gray.600', 'gray.300');

  const reset = () => {
    setGeneratedId('');
    setPrinciple('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;
    setIdLoading(true);
    setError('');

    getNextPrincipleId()
      .then((nextId) => {
        if (!cancelled) setGeneratedId(nextId);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to generate ID');
      })
      .finally(() => {
        if (!cancelled) setIdLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedPrinciple = principle.trim();

    if (!generatedId) {
      setError('ID is still generating. Please wait a moment.');
      return;
    }
    if (!trimmedPrinciple) {
      setError('Principle text is required.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await createPrinciple({ id: generatedId, name: trimmedPrinciple });
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to add principle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Add Principle</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={2}>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm">ID</FormLabel>
              {idLoading ? (
                <Spinner size="sm" color="gold.500" />
              ) : (
                <Input
                  value={generatedId}
                  isReadOnly
                  isDisabled
                  aria-label="Auto-generated principle ID"
                  bg={readOnlyBg}
                  color={readOnlyColor}
                  fontFamily="mono"
                  fontWeight="600"
                  cursor="not-allowed"
                  _disabled={{ opacity: 1, cursor: 'not-allowed' }}
                />
              )}
            </FormControl>

            <FormControl isInvalid={Boolean(error)}>
              <FormLabel fontSize="sm">Principle</FormLabel>
              <Textarea
                value={principle}
                onChange={(e) => setPrinciple(e.target.value)}
                placeholder="Enter the full principle text"
                rows={5}
                resize="vertical"
                w="100%"
              />
              {error && <FormErrorMessage mt={2}>{error}</FormErrorMessage>}
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={handleClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            colorScheme="gold"
            isLoading={loading}
            isDisabled={idLoading || !generatedId}
          >
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddPrincipleModal;
