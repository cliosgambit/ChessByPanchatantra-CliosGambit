import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Box,
  Flex,
  Text,
  Button,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiUserPlus } from 'react-icons/fi';
import { NAVBAR_HEIGHT } from '../components/layout/TopNavbar';
import UsersFilters from '../components/users/UsersFilters';
import UsersTable from '../components/users/UsersTable';
import AddUserModal from '../components/users/AddUserModal';
import EditUserModal from '../components/users/EditUserModal';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import PaginationBar from '../components/common/PaginationBar';
import { usePlayers } from '../hooks/usePlayers';
import { deleteLoginUser } from '../services/usersService';

function Players() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editPlayer, setEditPlayer] = useState(null);
  const { isOpen: addOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const { isOpen: editOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const toast = useToast();

  const { players, filteredCount, loading, error, refetch, removeLocal, pagination } = usePlayers({
    search,
    roleFilter,
    pageSize: 25,
  });

  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const countColor = useColorModeValue('gray.500', 'gray.400');
  const toolbarBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const stickyBg = useColorModeValue('rgba(244, 241, 232, 0.92)', 'rgba(15, 23, 41, 0.92)');

  const pageHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`;

  const handleRowClick = (player) => {
    navigate(`/players/${encodeURIComponent(player.chessComId || player.id)}`);
  };

  const handleEdit = (player) => {
    setEditPlayer(player);
    onEditOpen();
  };

  const handleDelete = async (player) => {
    if (!window.confirm(`Delete ${player.name}? This cannot be undone.`)) return;
    try {
      await deleteLoginUser(player.chessComId || player.id);
      removeLocal(player.id);
      toast({ title: 'Player deleted', status: 'success', duration: 2000 });
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const renderTableContent = () => {
    if (loading) return <LoadingPanel message="Loading players..." />;
    if (error) return <ErrorPanel title="Unable to load players" message={error} onRetry={refetch} />;
    if (filteredCount === 0 && !search && roleFilter === 'all') {
      return (
        <EmptyState
          title="No players found."
          subtitle="Add a player with the button above."
        />
      );
    }
    return (
      <>
        <UsersTable
          users={players}
          emptyMessage="No players match your search or filter."
          onRowClick={handleRowClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
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
      <Box flexShrink={0} px={{ base: 4, md: 8, xl: 10 }} pt={{ base: 4, md: 5 }} pb={3}>
        <Flex justify="flex-end">
          <Button
            leftIcon={<FiUserPlus />}
            size="xs"
            h="32px"
            bg="gold.500"
            color="navy.900"
            _hover={{ bg: 'gold.400' }}
            borderRadius="full"
            fontWeight="700"
            flexShrink={0}
            px={4}
            onClick={onAddOpen}
          >
            Add Player
          </Button>
        </Flex>
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
        <UsersFilters search={search} onSearchChange={setSearch} roleFilter={roleFilter} onRoleFilterChange={setRoleFilter} />
        <Text fontSize="xs" color={countColor} fontWeight="500" mt={1.5} px={0.5}>
          {loading ? 'Loading...' : `${filteredCount} player${filteredCount === 1 ? '' : 's'}`}
        </Text>
      </Box>

      <Box flex={1} minH={0} overflowY="auto" overflowX="hidden" px={{ base: 4, md: 8, xl: 10 }} pb={6} sx={{ WebkitOverflowScrolling: 'touch' }}>
        {renderTableContent()}
      </Box>

      <AddUserModal isOpen={addOpen} onClose={onAddClose} onSuccess={refetch} />
      <EditUserModal isOpen={editOpen} onClose={onEditClose} user={editPlayer} onSuccess={refetch} />
    </Box>
  );
}

export default Players;
