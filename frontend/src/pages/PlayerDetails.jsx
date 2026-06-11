import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  Spinner,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiChevronRight } from 'react-icons/fi';
import { NAVBAR_HEIGHT } from '../components/layout/TopNavbar';
import PlayerFilters from '../components/playerDetails/PlayerFilters';
import PlayerTable from '../components/playerDetails/PlayerTable';
import PaginationBar from '../components/common/PaginationBar';
import { usePlayers } from '../hooks/usePlayers';

function PlayerDetails() {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const { players, filteredCount, loading, error, refetch, pagination } = usePlayers({
    search,
    sortKey,
    pageSize: 25,
  });

  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const countColor = useColorModeValue('gray.500', 'gray.400');
  const toolbarBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const stickyBg = useColorModeValue('rgba(244, 241, 232, 0.92)', 'rgba(15, 23, 41, 0.92)');
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');

  const pageHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`;

  const renderTableContent = () => {
    if (loading) {
      return (
        <Box
          bg={cardBg}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="md"
          py={16}
          textAlign="center"
          mt={1}
        >
          <Spinner size="lg" color="gold.500" thickness="3px" />
          <Text mt={4} color={subColor} fontSize="sm">
            Loading players from Supabase...
          </Text>
        </Box>
      );
    }

    if (error) {
      return (
        <Box
          bg={cardBg}
          borderRadius="xl"
          borderWidth="1px"
          borderColor="red.200"
          boxShadow="md"
          py={12}
          px={6}
          textAlign="center"
          mt={1}
        >
          <Text color="red.600" fontSize="sm" fontWeight="600">
            Unable to load players
          </Text>
          <Text mt={2} color={subColor} fontSize="sm" maxW="md" mx="auto">
            {error}
          </Text>
          <Button mt={4} size="sm" colorScheme="yellow" onClick={refetch}>
            Retry
          </Button>
        </Box>
      );
    }

    if (filteredCount === 0 && !search) {
      return (
        <Box
          bg={cardBg}
          borderRadius="xl"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="md"
          py={16}
          textAlign="center"
          mt={1}
        >
          <Text color={subColor} fontSize="sm">
            No players found in the database yet.
          </Text>
        </Box>
      );
    }

    return (
      <>
        <PlayerTable players={players} />
        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={filteredCount}
          onPageChange={pagination.setPage}
        />
      </>
    );
  };

  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      w="100%"
      bg={pageBg}
      h={pageHeight}
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
      <Box
        flexShrink={0}
        px={{ base: 4, md: 8, xl: 10 }}
        pt={{ base: 4, md: 5 }}
        pb={3}
      >
        <HStack spacing={2} fontSize="xs" color={breadcrumbColor} mb={1}>
          <Text fontWeight="600">Admin</Text>
          <Box as={FiChevronRight} />
          <Text color="gold.600" fontWeight="600">
            Player Details
          </Text>
        </HStack>
        <Heading size="md" color={headingColor} letterSpacing="-0.02em">
          Player Details
        </Heading>
        <Text mt={1} color={subColor} fontSize="sm" maxW="2xl" noOfLines={1}>
          Manage Chess.com profiles, ratings sync, and player activity.
        </Text>
      </Box>

      <Box
        flexShrink={0}
        position="sticky"
        top={0}
        zIndex={20}
        px={{ base: 4, md: 8, xl: 10 }}
        pb={2}
        bg={stickyBg}
        backdropFilter="blur(10px)"
        borderBottomWidth="1px"
        borderColor={toolbarBorder}
        boxShadow="sm"
      >
        <PlayerFilters search={search} onSearchChange={setSearch} sortKey={sortKey} onSortChange={setSortKey} />
        <Text fontSize="xs" color={countColor} fontWeight="500" mt={1.5} px={0.5}>
          {loading ? 'Loading...' : `${filteredCount} player${filteredCount === 1 ? '' : 's'}`}
        </Text>
      </Box>

      <Box
        flex={1}
        minH={0}
        overflowY="auto"
        overflowX="hidden"
        px={{ base: 4, md: 8, xl: 10 }}
        pb={6}
        sx={{ WebkitOverflowScrolling: 'touch' }}
      >
        {renderTableContent()}
      </Box>
    </Box>
  );
}

export default PlayerDetails;
