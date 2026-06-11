import React from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  HStack,
  Button,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import UserStatusBadge from './UserStatusBadge';

const ACTION_STYLES = {
  view: { color: 'navy.700', _hover: { color: 'navy.600', textDecoration: 'underline' } },
  edit: { color: 'blue.600', _hover: { color: 'blue.500', textDecoration: 'underline' } },
  pause: { color: 'gold.600', _hover: { color: 'gold.500', textDecoration: 'underline' } },
  delete: { color: 'red.600', _hover: { color: 'red.500', textDecoration: 'underline' } },
};

function ActionLink({ label, styleKey, onClick }) {
  return (
    <Button
      variant="unstyled"
      size="sm"
      fontSize="sm"
      fontWeight="600"
      minW="auto"
      h="auto"
      px={0}
      transition="opacity 0.2s ease, color 0.2s ease"
      onClick={onClick}
      {...ACTION_STYLES[styleKey]}
    >
      {label}
    </Button>
  );
}

function UsersTable({
  users,
  emptyMessage = 'No users match your search or filter.',
  onEdit,
  onPause,
  onDelete,
}) {
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');
  const headerColor = useColorModeValue('gray.500', 'gray.400');
  const rowBorder = useColorModeValue('gray.100', 'whiteAlpha.100');
  const rowHover = useColorModeValue('gray.50', 'whiteAlpha.50');
  const nameColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');
  const roleColor = useColorModeValue('gray.700', 'gray.200');

  const handleView = (user) => {
    toast({
      title: user.chessComId || user.id,
      description: `${user.email} · ${user.role}`,
      status: 'info',
      duration: 2500,
    });
  };

  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.3 }}
      bg={cardBg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="md"
      overflow="hidden"
      mt={1}
    >
      <Box overflowX="auto" sx={{ WebkitOverflowScrolling: 'touch' }}>
        <Table variant="unstyled" size="lg" minW={{ base: '640px', md: '100%' }}>
          <Thead>
            <Tr borderBottomWidth="1px" borderColor={rowBorder}>
              <Th
                py={3.5}
                px={{ base: 3, md: 4 }}
                color={headerColor}
                fontSize="11px"
                fontWeight="700"
                letterSpacing="0.08em"
                textTransform="uppercase"
              >
                User
              </Th>
              <Th
                py={3.5}
                px={{ base: 3, md: 4 }}
                color={headerColor}
                fontSize="11px"
                fontWeight="700"
                letterSpacing="0.08em"
                textTransform="uppercase"
              >
                Chess.com ID
              </Th>
              <Th
                py={3.5}
                px={{ base: 3, md: 4 }}
                color={headerColor}
                fontSize="11px"
                fontWeight="700"
                letterSpacing="0.08em"
                textTransform="uppercase"
              >
                Role
              </Th>
              <Th
                py={3.5}
                px={{ base: 3, md: 4 }}
                color={headerColor}
                fontSize="11px"
                fontWeight="700"
                letterSpacing="0.08em"
                textTransform="uppercase"
              >
                Status
              </Th>
              <Th
                py={3.5}
                px={{ base: 3, md: 4 }}
                color={headerColor}
                fontSize="11px"
                fontWeight="700"
                letterSpacing="0.08em"
                textTransform="uppercase"
                textAlign="right"
              >
                Actions
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.length === 0 ? (
              <Tr>
                <Td colSpan={5} py={14} textAlign="center">
                  <Text color={subColor} fontSize="sm">
                    {emptyMessage}
                  </Text>
                </Td>
              </Tr>
            ) : (
              users.map((user, index) => (
                <Tr
                  key={user.id}
                  as={motion.tr}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.05 + index * 0.025 }}
                  borderBottomWidth="1px"
                  borderColor={rowBorder}
                  _last={{ borderBottom: 'none' }}
                  _hover={{ bg: rowHover }}
                  sx={{ transition: 'background 0.2s ease' }}
                >
                  <Td py={{ base: 3, md: 3.5 }} px={{ base: 3, md: 4 }}>
                    <Text fontWeight="600" fontSize="md" color={nameColor} letterSpacing="-0.01em">
                      {user.name}
                    </Text>
                    <Text fontSize="sm" color={subColor} mt={0.5}>
                      {user.email}
                    </Text>
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={{ base: 3, md: 4 }}>
                    <Text fontSize="sm" fontWeight="500" color={roleColor}>
                      {user.role}
                    </Text>
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={{ base: 3, md: 4 }}>
                    <UserStatusBadge status={user.status} />
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={{ base: 3, md: 4 }}>
                    <HStack spacing={4} justify="flex-end" flexWrap="wrap">
                      <ActionLink label="View" styleKey="view" onClick={() => handleView(user)} />
                      <ActionLink label="Edit" styleKey="edit" onClick={() => onEdit?.(user)} />
                      <ActionLink
                        label={user.status === 'PAUSED' ? 'Resume' : 'Pause'}
                        styleKey="pause"
                        onClick={() => onPause?.(user)}
                      />
                      <ActionLink label="Delete" styleKey="delete" onClick={() => onDelete?.(user)} />
                    </HStack>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
}

export default UsersTable;
