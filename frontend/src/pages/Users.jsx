import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  HStack,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiUserPlus, FiChevronRight } from 'react-icons/fi';
import { NAVBAR_HEIGHT } from '../components/layout/TopNavbar';
import UsersFilters from '../components/users/UsersFilters';
import UsersTable from '../components/users/UsersTable';
import AddUserModal from '../components/users/AddUserModal';
import EditUserModal from '../components/users/EditUserModal';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import EmptyState from '../components/common/EmptyState';
import PaginationBar from '../components/common/PaginationBar';
import { useUsers } from '../hooks/useUsers';
import { deleteLoginUser, pauseLoginUser } from '../services/usersService';

function Users() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editUser, setEditUser] = useState(null);
  const { isOpen: addOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const { isOpen: editOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const toast = useToast();

  const { users, filteredCount, loading, error, refetch, removeLocal, pagination } = useUsers({
    search,
    roleFilter,
    pageSize: 25,
  });

  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const countColor = useColorModeValue('gray.500', 'gray.400');
  const toolbarBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const stickyBg = useColorModeValue('rgba(244, 241, 232, 0.92)', 'rgba(15, 23, 41, 0.92)');

  const pageHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`;

  const handleEdit = (user) => {
    setEditUser(user);
    onEditOpen();
  };

  const handlePause = async (user) => {
    const paused = user.status !== 'PAUSED';
    try {
      await pauseLoginUser(user.chessComId || user.id, paused);
      toast({
        title: paused ? 'User paused' : 'User resumed',
        status: 'success',
        duration: 2000,
      });
      refetch();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      await deleteLoginUser(user.chessComId || user.id);
      removeLocal(user.id);
      toast({ title: 'User deleted', status: 'success', duration: 2000 });
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const renderTableContent = () => {
    if (loading) return <LoadingPanel message="Loading users from Supabase..." />;
    if (error) return <ErrorPanel title="Unable to load users" message={error} onRetry={refetch} />;
    if (filteredCount === 0 && !search && roleFilter === 'all') {
      return (
        <EmptyState
          title="No users found in the Login table."
          subtitle="Add users with the button above or in Supabase."
        />
      );
    }
    return (
      <>
        <UsersTable
          users={users}
          emptyMessage="No users match your search or filter."
          onEdit={handleEdit}
          onPause={handlePause}
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
        <Flex direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ base: 'flex-start', sm: 'center' }} gap={3}>
          <Box>
            <HStack spacing={2} fontSize="xs" color={breadcrumbColor} mb={1}>
              <Text fontWeight="600">Admin</Text>
              <Box as={FiChevronRight} />
              <Text color="gold.600" fontWeight="600">Users</Text>
            </HStack>
            <Heading size="md" color={headingColor} letterSpacing="-0.02em">Users</Heading>
            <Text mt={1} color={subColor} fontSize="sm" maxW="2xl" noOfLines={1}>
              Manage students, coaches, and administrators from the Login table.
            </Text>
          </Box>
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
            Add User
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
          {loading ? 'Loading...' : `${filteredCount} user${filteredCount === 1 ? '' : 's'}`}
        </Text>
      </Box>

      <Box flex={1} minH={0} overflowY="auto" overflowX="hidden" px={{ base: 4, md: 8, xl: 10 }} pb={6} sx={{ WebkitOverflowScrolling: 'touch' }}>
        {renderTableContent()}
      </Box>

      <AddUserModal isOpen={addOpen} onClose={onAddClose} onSuccess={refetch} />
      <EditUserModal isOpen={editOpen} onClose={onEditClose} user={editUser} onSuccess={refetch} />
    </Box>
  );
}

export default Users;
