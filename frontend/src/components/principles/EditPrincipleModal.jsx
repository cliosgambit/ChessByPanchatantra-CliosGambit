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
  Text,
} from '@chakra-ui/react';
import { updatePrinciple } from '../../services/principlesService';

function EditPrincipleModal({ isOpen, onClose, principle, onSuccess }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (principle) {
      setName(principle.principle || principle.name || '');
      setError('');
    }
  }, [principle]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!principle?.id) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Principle text is required.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await updatePrinciple(principle.id, { name: trimmed });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update principle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Edit Principle</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isDisabled>
              <FormLabel fontSize="sm">ID</FormLabel>
              <Input value={principle?.id || ''} />
            </FormControl>
            <FormControl isInvalid={Boolean(error)}>
              <FormLabel fontSize="sm">Principle</FormLabel>
              <Textarea
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter the full principle text"
                rows={4}
                resize="vertical"
              />
              {error && <FormErrorMessage>{error}</FormErrorMessage>}
            </FormControl>
            <Text fontSize="xs" color="gray.500">
              Changes are saved to the principles table in Supabase.
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button type="submit" colorScheme="gold" isLoading={loading}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default EditPrincipleModal;
