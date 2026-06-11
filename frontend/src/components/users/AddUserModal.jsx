import React, { useState } from 'react';
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
import { createLoginUser } from '../../services/usersService';

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'coach', label: 'Coach' },
  { value: 'admin', label: 'Admin' },
];

function AddUserModal({ isOpen, onClose, onSuccess }) {
  const [chessComId, setChessComId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setChessComId('');
    setPlayerName('');
    setEmail('');
    setPassword('');
    setRole('student');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!chessComId.trim() || !email.trim() || !password.trim()) {
      setError('Chess.com ID, email, and password are required.');
      return;
    }
    setLoading(true);
    try {
      await createLoginUser({
        Chess_com_ID: chessComId.trim(),
        Player_Name: playerName.trim() || chessComId.trim(),
        email: email.trim(),
        password,
        Role: role,
      });
      onSuccess?.();
      reset();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent as="form" onSubmit={handleSubmit}>
        <ModalHeader>Add User</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired isInvalid={!!error}>
              <FormLabel fontSize="sm">Chess.com ID</FormLabel>
              <Input value={chessComId} onChange={(e) => setChessComId(e.target.value)} placeholder="username" />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Player Name</FormLabel>
              <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Display name" />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Email</FormLabel>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm">Password</FormLabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">Role</FormLabel>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            {error && <FormErrorMessage>{error}</FormErrorMessage>}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" bg="gold.500" color="navy.900" _hover={{ bg: 'gold.400' }} isLoading={loading}>
            Create User
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddUserModal;
