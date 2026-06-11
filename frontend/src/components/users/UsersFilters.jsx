import React from 'react';
import { motion } from 'framer-motion';
import {
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'student', label: 'Student' },
  { value: 'coach', label: 'Coach' },
  { value: 'admin', label: 'Admin' },
  { value: 'parent', label: 'Parent' },
];

function UsersFilters({ search, onSearchChange, roleFilter, onRoleFilterChange }) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const iconColor = useColorModeValue('gray.400', 'gray.500');
  const inputBg = useColorModeValue('white', 'navy.700');

  return (
    <Flex
      as={motion.div}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'center' }}
      justify="space-between"
      gap={2}
      bg={cardBg}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="sm"
      p={{ base: 2, md: 2.5 }}
    >
      <InputGroup flex={1} maxW={{ base: '100%', md: '420px' }} size="sm">
        <InputLeftElement pointerEvents="none" h="32px">
          <Box as={FiSearch} color={iconColor} boxSize={3.5} />
        </InputLeftElement>
        <Input
          pl={8}
          h="32px"
          bg={inputBg}
          borderColor={borderColor}
          borderRadius="md"
          fontSize="xs"
          placeholder="Search users by name, email, or Chess.com ID..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          _hover={{ borderColor: 'gray.300' }}
          _focus={{
            borderColor: 'gold.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-gold-400)',
          }}
        />
      </InputGroup>

      <Select
        maxW={{ base: '100%', md: '180px' }}
        h="32px"
        bg={inputBg}
        borderColor={borderColor}
        borderRadius="md"
        fontSize="xs"
        fontWeight="500"
        value={roleFilter}
        onChange={(e) => onRoleFilterChange(e.target.value)}
        aria-label="Filter by role"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </Flex>
  );
}

export default UsersFilters;
