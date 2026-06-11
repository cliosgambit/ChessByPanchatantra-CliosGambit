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
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import RatingBadge from './RatingBadge';
import SyncStatusBadge from './SyncStatusBadge';
import ActionButtons from './ActionButtons';

function MaxEloBadge({ value }) {
  const bg = useColorModeValue('#faf6eb', 'whiteAlpha.100');
  const color = useColorModeValue('navy.800', 'gold.300');
  const border = useColorModeValue('gold.200', 'gold.600');

  return (
    <Box
      display="inline-block"
      px={3}
      py={1}
      borderRadius="full"
      bg={bg}
      color={color}
      borderWidth="1px"
      borderColor={border}
      fontSize="sm"
      fontWeight="800"
      letterSpacing="-0.02em"
    >
      {value}
    </Box>
  );
}

function PlayerTable({ players }) {
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');
  const headerColor = useColorModeValue('gray.500', 'gray.400');
  const rowBorder = useColorModeValue('gray.100', 'whiteAlpha.100');
  const rowHover = useColorModeValue('gray.50', 'whiteAlpha.50');
  const idColor = useColorModeValue('navy.700', 'gold.300');
  const nameColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');

  const handleAction = (action, player) => {
    toast({
      title: `${action}: ${player.chessId}`,
      status: 'info',
      duration: 2000,
      isClosable: true,
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
        <Table variant="unstyled" size="md" minW="1100px">
          <Thead>
            <Tr borderBottomWidth="1px" borderColor={rowBorder}>
              {[
                'Chess.com ID',
                'Player Name',
                'Ratings (R/B/U)',
                'Best (R/B/U)',
                'Max Elo',
                'Joined',
                'Sync Status',
                'Actions',
              ].map((label) => (
                <Th
                  key={label}
                  py={3.5}
                  px={3}
                  color={headerColor}
                  fontSize="10px"
                  fontWeight="700"
                  letterSpacing="0.07em"
                  textTransform="uppercase"
                  whiteSpace="nowrap"
                  textAlign={label === 'Actions' ? 'right' : 'left'}
                >
                  {label}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {players.length === 0 ? (
              <Tr>
                <Td colSpan={8} py={14} textAlign="center">
                  <Text color={subColor} fontSize="sm">
                    No players match your search.
                  </Text>
                </Td>
              </Tr>
            ) : (
              players.map((player, index) => (
                <Tr
                  key={player.id}
                  as={motion.tr}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.04 + index * 0.02 }}
                  borderBottomWidth="1px"
                  borderColor={rowBorder}
                  _last={{ borderBottom: 'none' }}
                  _hover={{ bg: rowHover }}
                  sx={{ transition: 'background 0.2s ease' }}
                >
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <Text fontWeight="700" fontSize="sm" color={idColor}>
                      {player.chessId}
                    </Text>
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <Text fontWeight="600" fontSize="sm" color={nameColor}>
                      {player.name}
                    </Text>
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <RatingBadge ratings={player.ratings} variant="current" />
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <RatingBadge ratings={player.best} variant="best" />
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <MaxEloBadge value={player.maxElo} />
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <Text fontSize="sm" color={subColor} fontWeight="500" whiteSpace="nowrap">
                      {player.joined}
                    </Text>
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <SyncStatusBadge
                      change={player.sync.change}
                      timestamp={player.sync.timestamp}
                    />
                  </Td>
                  <Td py={{ base: 3, md: 3.5 }} px={3}>
                    <ActionButtons
                      onView={() => handleAction('View', player)}
                      onEdit={() => handleAction('Edit', player)}
                      onPause={() => handleAction('Pause', player)}
                      onDelete={() => handleAction('Delete', player)}
                    />
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

export default PlayerTable;
