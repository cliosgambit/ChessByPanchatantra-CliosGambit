import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Avatar,
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  HStack,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  useColorModeValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiArrowLeft, FiChevronRight, FiEdit2, FiPause, FiPlay, FiTrash2 } from 'react-icons/fi';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NAVBAR_HEIGHT } from '../components/layout/TopNavbar';
import UserStatusBadge from '../components/users/UserStatusBadge';
import EditUserModal from '../components/users/EditUserModal';
import ErrorPanel from '../components/common/ErrorPanel';
import ProfileSection from '../components/userProfile/ProfileSection';
import ProfileSkeleton from '../components/userProfile/ProfileSkeleton';
import ProgressRow from '../components/userProfile/ProgressRow';
import StatCard from '../components/userProfile/StatCard';
import { useUserProfile } from '../hooks/useUserProfile';
import { deleteLoginUser, pauseLoginUser } from '../services/usersService';

function DetailItem({ label, value }) {
  const labelColor = useColorModeValue('gray.500', 'gray.400');
  const valueColor = useColorModeValue('navy.800', 'white');

  return (
    <Box>
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.06em" textTransform="uppercase" color={labelColor}>
        {label}
      </Text>
      <Text mt={1} fontSize="sm" fontWeight="500" color={valueColor}>
        {value || '—'}
      </Text>
    </Box>
  );
}

function RecordBlock({ label, record }) {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="700" mb={2}>
        {label}
      </Text>
      <Text fontSize="sm">Wins: {record?.wins ?? 0}</Text>
      <Text fontSize="sm">Losses: {record?.losses ?? 0}</Text>
      <Text fontSize="sm">Draws: {record?.draws ?? 0}</Text>
    </Box>
  );
}

function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, refetch } = useUserProfile(userId);
  const [editUser, setEditUser] = useState(null);
  const { isOpen: editOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();

  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const chartGrid = useColorModeValue('#e8e4da', '#2d3a5c');
  const rowBorder = useColorModeValue('gray.100', 'whiteAlpha.100');
  const headerCardBg = useColorModeValue('white', 'navy.800');
  const headerBorder = useColorModeValue('gray.100', 'whiteAlpha.200');

  const pageHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`;

  const handleEdit = (user) => {
    setEditUser(user);
    onEditOpen();
  };

  const handlePauseToggle = async (user) => {
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
      toast({ title: 'User deleted', status: 'success', duration: 2000 });
      navigate('/users');
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  if (loading) {
    return (
      <Box bg={pageBg} minH={pageHeight} px={{ base: 4, md: 8, xl: 10 }} py={6}>
        <ProfileSkeleton />
      </Box>
    );
  }

  if (error || !data?.user) {
    return (
      <Box bg={pageBg} minH={pageHeight} px={{ base: 4, md: 8, xl: 10 }} py={6}>
        <Button leftIcon={<FiArrowLeft />} variant="ghost" mb={4} onClick={() => navigate('/users')}>
          Back to Users
        </Button>
        <ErrorPanel title="Unable to load user profile" message={error || 'User not found.'} onRetry={refetch} />
      </Box>
    );
  }

  const { user, platform, chessCom } = data;
  const chessUsername = user.chessComId || user.id;
  const chessProfile = chessCom.profile;
  const chessStats = chessCom.stats;
  const hasChessLink = Boolean(chessUsername);
  const showChessSections = hasChessLink && chessCom.linked !== false;
  const ratingHistory = platform.ratingHistory || [];

  return (
    <Box bg={pageBg} minH={pageHeight} overflowY="auto" sx={{ WebkitOverflowScrolling: 'touch' }}>
      <Box px={{ base: 4, md: 8, xl: 10 }} py={{ base: 4, md: 6 }} pb={10}>
        <HStack spacing={2} fontSize="xs" color={breadcrumbColor} mb={4}>
          <Text fontWeight="600" cursor="pointer" onClick={() => navigate('/users')}>
            Admin
          </Text>
          <Box as={FiChevronRight} />
          <Text fontWeight="600" cursor="pointer" onClick={() => navigate('/users')}>
            Users
          </Text>
          <Box as={FiChevronRight} />
          <Text color="gold.600" fontWeight="600">
            {user.name}
          </Text>
        </HStack>

        {chessCom.apiError && (
          <Alert status="warning" borderRadius="lg" mb={4}>
            <AlertIcon />
            Chess.com data could not be loaded. Showing platform profile data. ({chessCom.apiError})
          </Alert>
        )}

        {!hasChessLink && (
          <Alert status="info" borderRadius="lg" mb={4}>
            <AlertIcon />
            No Chess.com account linked.
          </Alert>
        )}

        {hasChessLink && chessCom.linked === false && !chessCom.apiError && (
          <Alert status="info" borderRadius="lg" mb={4}>
            <AlertIcon />
            No Chess.com profile found for @{chessUsername}.
          </Alert>
        )}

        <Box
          bg={headerCardBg}
          borderRadius="2xl"
          borderWidth="1px"
          borderColor={headerBorder}
          boxShadow="lg"
          p={{ base: 5, md: 6 }}
          mb={6}
        >
          <Flex direction={{ base: 'column', lg: 'row' }} gap={6} justify="space-between" align={{ base: 'stretch', lg: 'center' }}>
            <HStack align="start" spacing={5}>
              <Avatar
                size="xl"
                name={user.name}
                src={chessProfile?.avatar || undefined}
                bg="gold.500"
                color="navy.900"
              />
              <VStack align="start" spacing={1}>
                <Text fontSize="2xl" fontWeight="800" color={headingColor} letterSpacing="-0.03em">
                  {user.name}
                </Text>
                <Text fontSize="md" color={subColor} fontWeight="600">
                  @{chessUsername || '—'}
                </Text>
                <Text fontSize="sm" color={subColor}>
                  {user.email}
                </Text>
                <HStack spacing={3} pt={2} flexWrap="wrap">
                  <Text fontSize="sm" fontWeight="700" color={headingColor}>
                    {user.role}
                  </Text>
                  <UserStatusBadge status={user.status} />
                  {chessProfile?.title && (
                    <Text fontSize="sm" fontWeight="800" color="gold.600">
                      {chessProfile.title}
                    </Text>
                  )}
                </HStack>
              </VStack>
            </HStack>

            <HStack spacing={3} flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
              <Button leftIcon={<FiEdit2 />} size="sm" onClick={() => handleEdit(user)}>
                Edit User
              </Button>
              <Button
                leftIcon={user.status === 'PAUSED' ? <FiPlay /> : <FiPause />}
                size="sm"
                variant="outline"
                onClick={() => handlePauseToggle(user)}
              >
                {user.status === 'PAUSED' ? 'Resume User' : 'Pause User'}
              </Button>
              <Button leftIcon={<FiTrash2 />} size="sm" colorScheme="red" variant="outline" onClick={() => handleDelete(user)}>
                Delete User
              </Button>
            </HStack>
          </Flex>
        </Box>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6}>
          <GridItem>
            <VStack align="stretch" spacing={6}>
              <ProfileSection title="Account Details">
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                  <DetailItem label="User Name" value={user.name} />
                  <DetailItem label="Email" value={user.email} />
                  <DetailItem label="Chess.com ID" value={chessUsername} />
                  <DetailItem label="Role" value={user.role} />
                  <DetailItem label="Status" value={user.status === 'PAUSED' ? 'Paused' : 'Active'} />
                  <DetailItem label="Created Date" value={platform.account.createdAt} />
                  <DetailItem label="Last Login" value={platform.account.lastLogin} />
                  <DetailItem label="Phone Number" value={platform.account.phone} />
                  <DetailItem label="Country" value={chessProfile?.country || platform.account.country} />
                  <DetailItem label="Timezone" value={platform.account.timezone} />
                </SimpleGrid>
              </ProfileSection>

              <ProfileSection title="Curriculum Progress" description="Platform totals; per-user completion is tracked where available.">
                <VStack align="stretch" spacing={4}>
                  <ProgressRow label="Modules" completed={platform.curriculum.modulesCompleted} total={platform.curriculum.modulesTotal} />
                  <ProgressRow label="Chapters" completed={platform.curriculum.chaptersCompleted} total={platform.curriculum.chaptersTotal} />
                  <ProgressRow label="Stories" completed={platform.curriculum.storiesCompleted} total={platform.curriculum.storiesTotal} />
                  <ProgressRow label="Principles" completed={platform.curriculum.principlesCompleted} total={platform.curriculum.principlesTotal} />
                  <ProgressRow label="Puzzles Solved" completed={platform.curriculum.puzzlesSolved} total={platform.curriculum.puzzlesTotal} />
                </VStack>
              </ProfileSection>

              <ProfileSection title="Puzzle Performance">
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                  <StatCard label="Puzzles Attempted" value={platform.puzzles.attempted} />
                  <StatCard label="Puzzles Solved" value={platform.puzzles.tacticsHighest || platform.puzzles.solved} />
                  <StatCard label="Success Rate" value={platform.puzzles.successRate != null ? `${platform.puzzles.successRate}%` : '—'} />
                  <StatCard label="Avg Solve Time" value={platform.puzzles.averageSolveTime} />
                  <StatCard label="Puzzle Rush Best" value={platform.puzzles.puzzleRushBest || chessStats?.puzzleRush} />
                  <StatCard label="Tactics Highest" value={platform.puzzles.tacticsHighest || chessStats?.puzzleScore} />
                </SimpleGrid>
              </ProfileSection>

              <ProfileSection title="Learning Analytics">
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                  <DetailItem label="Most Active Module" value={platform.learning.mostActiveModule} />
                  <DetailItem label="Most Active Chapter" value={platform.learning.mostActiveChapter} />
                  <DetailItem label="Most Active Time Control" value={platform.learning.mostSolvedCategory} />
                  <DetailItem label="Brilliant Moves Found" value={platform.activity.brilliantMoves} />
                </SimpleGrid>
              </ProfileSection>
            </VStack>
          </GridItem>

          <GridItem>
            <VStack align="stretch" spacing={6}>
              {showChessSections ? (
                <>
                  <ProfileSection title="Chess.com Profile">
                    {!chessProfile ? (
                      <Text fontSize="sm" color={subColor}>
                        No Chess.com account linked.
                      </Text>
                    ) : (
                      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                        <DetailItem label="Username" value={chessProfile.username} />
                        <DetailItem label="Display Name" value={chessProfile.name} />
                        <DetailItem label="Country" value={chessProfile.country} />
                        <DetailItem label="Joined Date" value={chessProfile.joinedDate} />
                        <DetailItem label="Followers" value={chessProfile.followers} />
                        <DetailItem label="League" value={chessProfile.league} />
                        <DetailItem label="Title" value={chessProfile.title} />
                        <DetailItem label="Profile URL" value={chessProfile.profileUrl} />
                      </SimpleGrid>
                    )}
                  </ProfileSection>

                  <ProfileSection title="Ratings">
                    {chessStats ? (
                      <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
                        <StatCard label="Rapid" value={chessStats.rapid?.current} subValue={chessStats.rapid?.best ? `Best ${chessStats.rapid.best}` : null} />
                        <StatCard label="Blitz" value={chessStats.blitz?.current} subValue={chessStats.blitz?.best ? `Best ${chessStats.blitz.best}` : null} />
                        <StatCard label="Bullet" value={chessStats.bullet?.current} subValue={chessStats.bullet?.best ? `Best ${chessStats.bullet.best}` : null} />
                        <StatCard label="Daily" value={chessStats.daily?.current} subValue={chessStats.daily?.best ? `Best ${chessStats.daily.best}` : null} />
                        <StatCard label="Puzzle Rush" value={chessStats.puzzleRush} />
                        <StatCard label="Puzzle Score" value={chessStats.puzzleScore} />
                      </SimpleGrid>
                    ) : (
                      <Text fontSize="sm" color={subColor}>
                        Ratings unavailable.
                      </Text>
                    )}
                  </ProfileSection>

                  <ProfileSection title="Game Statistics">
                    {chessStats ? (
                      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                        <StatCard label="Wins" value={chessStats.totals.wins} />
                        <StatCard label="Losses" value={chessStats.totals.losses} />
                        <StatCard label="Draws" value={chessStats.totals.draws} />
                        <StatCard label="Total Games" value={chessStats.totalGames} />
                        <StatCard label="Win %" value={`${chessStats.winPercentage}%`} />
                      </SimpleGrid>
                    ) : (
                      <Text fontSize="sm" color={subColor}>
                        Game statistics unavailable.
                      </Text>
                    )}
                  </ProfileSection>

                  <ProfileSection title="Recent Performance">
                    {chessStats ? (
                      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                        <RecordBlock label="Rapid" record={chessStats.records.rapid} />
                        <RecordBlock label="Blitz" record={chessStats.records.blitz} />
                        <RecordBlock label="Bullet" record={chessStats.records.bullet} />
                      </SimpleGrid>
                    ) : (
                      <Text fontSize="sm" color={subColor}>
                        Performance records unavailable.
                      </Text>
                    )}
                  </ProfileSection>

                  {ratingHistory.length > 1 && (
                    <ProfileSection title="Rating History">
                      <Box h="280px">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={ratingHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="rapid" stroke="#0f1729" strokeWidth={2} dot={false} name="Rapid" />
                            <Line type="monotone" dataKey="blitz" stroke="#c9a227" strokeWidth={2} dot={false} name="Blitz" />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </ProfileSection>
                  )}

                  <ProfileSection title="Activity">
                    <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
                      <DetailItem label="Last Online" value={chessProfile?.lastOnline} />
                      <DetailItem label="Games This Month" value={platform.activity.gamesThisMonth} />
                      <DetailItem label="Stored Platform Games" value={platform.activity.storedGames} />
                      <DetailItem label="Recently Played" value={chessCom.recentGames?.[0] ? `${chessCom.recentGames[0].opponent} (${chessCom.recentGames[0].result})` : '—'} />
                    </SimpleGrid>
                  </ProfileSection>

                  <ProfileSection title="Recent Games" description="Last 10 games from Chess.com.">
                    {chessCom.recentGames?.length ? (
                      <Box overflowX="auto">
                        <Table size="sm" variant="simple">
                          <Thead>
                            <Tr borderColor={rowBorder}>
                              <Th>Opponent</Th>
                              <Th>Result</Th>
                              <Th>Date</Th>
                              <Th>Time Control</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {chessCom.recentGames.map((game, index) => (
                              <Tr key={`${game.opponent}-${index}`} borderColor={rowBorder}>
                                <Td>{game.opponent}</Td>
                                <Td>{game.result}</Td>
                                <Td>{game.date}</Td>
                                <Td>{game.timeControl}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    ) : (
                      <Text fontSize="sm" color={subColor}>
                        No recent games found.
                      </Text>
                    )}
                  </ProfileSection>

                  <ProfileSection title="Achievements">
                    {chessStats ? (
                      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
                        <StatCard label="Highest Rapid" value={chessStats.achievements.highestRapid} />
                        <StatCard label="Highest Blitz" value={chessStats.achievements.highestBlitz} />
                        <StatCard label="Highest Puzzle" value={chessStats.achievements.highestPuzzle} />
                      </SimpleGrid>
                    ) : (
                      <Text fontSize="sm" color={subColor}>
                        Achievements unavailable.
                      </Text>
                    )}
                  </ProfileSection>
                </>
              ) : (
                <ProfileSection title="Chess.com Data">
                  <Text fontSize="sm" color={subColor}>
                    No Chess.com account linked. Chess.com analytics are hidden.
                  </Text>
                </ProfileSection>
              )}
            </VStack>
          </GridItem>
        </Grid>
      </Box>

      <EditUserModal isOpen={editOpen} onClose={onEditClose} user={editUser} onSuccess={refetch} />
    </Box>
  );
}

export default UserProfilePage;
