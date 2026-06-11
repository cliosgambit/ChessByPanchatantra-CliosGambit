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
} from '@chakra-ui/react';
import UserStatusBadge from './UserStatusBadge';

const ACTION_STYLES = {
  edit: { color: 'blue.600', _hover: { color: 'blue.500', textDecoration: 'underline' } },
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
  onRowClick,
  onEdit,
  onDelete,
}) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');
  const headerColor = useColorModeValue('gray.500', 'gray.400');
  const rowBorder = useColorModeValue('gray.100', 'whiteAlpha.100');
  const rowHover = useColorModeValue('gray.50', 'whiteAlpha.100');
  const nameColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');
  const roleColor = useColorModeValue('gray.700', 'gray.200');
  const chessIdColor = useColorModeValue('gray.700', 'gray.200');
  const emptyChessIdColor = useColorModeValue('gray.400', 'gray.500');

  const formatChessComId = (user) => user.chessComId || user.id || '—';

  const activateRow = (user) => onRowClick?.(user);

  const handleRowKeyDown = (event, user) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateRow(user);
    }
  };

  const stopRowActivation = (event) => {
    event.stopPropagation();
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
                  cursor="pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={`Open profile for ${user.name}`}
                  onClick={() => activateRow(user)}
                  onKeyDown={(event) => handleRowKeyDown(event, user)}
                  _hover={{ bg: rowHover }}
                  _focus={{
                    bg: rowHover,
                    outline: '2px solid',
                    outlineColor: 'gold.400',
                    outlineOffset: '-2px',
                  }}
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
                    <Text
                      fontSize="sm"
                      fontWeight="500"
                      color={formatChessComId(user) === '—' ? emptyChessIdColor : chessIdColor}
                    >
                      {formatChessComId(user)}
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
                  <Td py={{ base: 3, md: 3.5 }} px={{ base: 3, md: 4 }} onClick={stopRowActivation}>
                    <HStack spacing={4} justify="flex-end" flexWrap="wrap">
                      <ActionLink
                        label="Edit"
                        styleKey="edit"
                        onClick={(event) => {
                          stopRowActivation(event);
                          onEdit?.(user);
                        }}
                      />
                      <ActionLink
                        label="Delete"
                        styleKey="delete"
                        onClick={(event) => {
                          stopRowActivation(event);
                          onDelete?.(user);
                        }}
                      />
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
