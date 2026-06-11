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
  Select,
  FormErrorMessage,
  VStack,
} from '@chakra-ui/react';
import { resolveLoginRole, updateLoginUser } from '../../services/usersService';

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'coach', label: 'Coach' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
];

function EditUserModal({ isOpen, onClose, user, onSuccess }) {
  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setPlayerName(user.name || '');
      setEmail(user.email || '');
      setRole(user.roleRaw || user.role?.toLowerCase() || 'student');
      setStatus(user.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE');
      setPassword('');
      setError('');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const payload = {
        Player_Name: playerName.trim(),
        email: email.trim(),
        Role: resolveLoginRole(role, status),
      };
      if (password.trim()) payload.password = password.trim();
      await updateLoginUser(user.chessComId || user.id, payload);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Edit User</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel fontSize="sm">Name</FormLabel>
              <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Email</FormLabel>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormControl>
            <FormControl isDisabled>
              <FormLabel fontSize="sm">Chess.com ID</FormLabel>
              <Input value={user?.chessComId || user?.id || ''} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Role</FormLabel>
              <Select value={role} onChange={(e) => setRole(e.target.value)} isDisabled={status === 'PAUSED'}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Status</FormLabel>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">New Password (optional)</FormLabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormControl>
            {error && <FormErrorMessage>{error}</FormErrorMessage>}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" bg="gold.500" color="navy.900" _hover={{ bg: 'gold.400' }} isLoading={loading}>
            Save Changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default EditUserModal;
