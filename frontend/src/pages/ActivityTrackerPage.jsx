import React, { useState, useEffect } from 'react';
import {
  Box,
  Text,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  VStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Heading,
  useColorModeValue,
  useColorMode,
  Container,
  Flex,
  useToast,
  ButtonGroup,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
} from '@chakra-ui/react';

const attendanceStates = ['-', 'P', 'A'];
const attendanceStyles = {
  '-': { bg: 'gray.100', color: 'gray.400' },
  'P': { bg: 'green.100', color: 'green.600' },
  'A': { bg: 'red.100', color: 'red.600' },
};

// Color anchors for luxury ramp
const gameColorAnchors = [
  { count: 1, color: '#D4EDDA' },      // Fresh Mint Green
  { count: 11, color: '#50C878' },     // Emerald Green
  { count: 21, color: '#00A86B' },     // Jade
  { count: 31, color: '#B5A642' },     // Olive Gold
  { count: 41, color: '#FFD700' },     // Gold
  { count: 51, color: '#B87333' },     // Copper
  { count: 61, color: '#9B111E' },     // Ruby Red
  { count: 71, color: '#6A0DAD' },     // Royal Purple
  { count: 81, color: '#0F52BA' },     // Sapphire Blue
  { count: 91, color: '#1C1C1C' },     // Obsidian Black
  { count: 100, color: '#FFD700' },    // Gold Accent
];

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const num = parseInt(hex, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function interpolateColor(rgb1, rgb2, t) {
  return rgb1.map((c, i) => Math.round(c + (rgb2[i] - c) * t));
}
function getGameColor(gameCount) {
  if (gameCount === '-' || gameCount == null || Number(gameCount) === 0) return '#ebedf0'; // fallback for no games or 0
  gameCount = Math.max(1, Math.min(100, Number(gameCount)));
  for (let i = 0; i < gameColorAnchors.length - 1; i++) {
    const a = gameColorAnchors[i], b = gameColorAnchors[i + 1];
    if (gameCount >= a.count && gameCount <= b.count) {
      const t = (gameCount - a.count) / (b.count - a.count);
      const rgbA = hexToRgb(a.color);
      const rgbB = hexToRgb(b.color);
      const rgb = interpolateColor(rgbA, rgbB, t);
      return rgbToHex(rgb);
    }
  }
  return gameColorAnchors[gameColorAnchors.length - 1].color;
}

const ActivityTrackerPage = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();
  const { colorMode } = useColorMode();
  const isDarkMode = colorMode === 'dark';
  const [selectedView, setSelectedView] = useState('Attendance');
  const [attendance, setAttendance] = useState([]);
  const [originalAttendance, setOriginalAttendance] = useState([]);
  const [saving, setSaving] = useState(false);
  // State for which date's menu is open
  const [, setActiveDateMenu] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalColIndex, setModalColIndex] = useState(null);
  // State for rating type in Every day rating view
  const [ratingType, setRatingType] = useState('Blitz');

  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const headerBg = useColorModeValue('gray.50', 'gray.700');
  const thHoverBg = useColorModeValue('teal.50', 'teal.900');

  const HEADER_HEIGHT = "56px";

  // Generate dates from June 9th, 2025 to current date
  const generateDateRange = () => {
    const startDate = new Date('2025-07-09');
    const endDate = new Date();
    const dates = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d));
    }
    
    return dates;
  };

  const dateRange = generateDateRange();

  // Helper to convert activity_tracker to attendance 2D array
  const activityTrackerToAttendance = (activity_tracker) => {
    return dateRange.map(date => {
      const dateKey = date.toISOString().slice(0, 10);
      return activity_tracker && activity_tracker[dateKey] ? activity_tracker[dateKey].status : '-';
    });
  };

  // Helper to get total_games from activity_tracker for a player/date
  const getTotalGames = (player, date) => {
    if (!player.activity_tracker) return '-';
    const dateKey = date.toISOString().slice(0, 10);
    const entry = player.activity_tracker[dateKey];
    if (!entry || entry.total_games == null) return '-';
    return entry.total_games;
  };

  // Helper to get last_rating from activity_tracker for a player/date/type
  const getLastRating = (player, date, type) => {
    if (!player.activity_tracker) return '-';
    const dateKey = date.toISOString().slice(0, 10);
    const entry = player.activity_tracker[dateKey];
    if (!entry || !entry.types || !entry.types[type] || entry.types[type].last_rating == null) return '-';
    return entry.types[type].last_rating;
  };

  // Fetch players and initialize attendance from activity_tracker
  const fetchPlayersAndAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/players/reports');
      if (!response.ok) {
        throw new Error('Failed to fetch player data');
      }
      const data = await response.json();
      setPlayers(data.players || []);
      // Build attendance 2D array from activity_tracker
      const att = (data.players || []).map(player => activityTrackerToAttendance(player.activity_tracker || {}));
      setAttendance(att);
      setOriginalAttendance(JSON.parse(JSON.stringify(att)));
      if (data.players && data.players.length > 0) {
        toast({
          title: 'Data loaded successfully',
          description: `${data.players.length} players found`,
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error('Error fetching players:', err);
      setError(err.message);
      toast({
        title: 'Error loading data',
        description: err.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayersAndAttendance();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (
      attendance.length !== players.length ||
      (players.length > 0 && attendance[0]?.length !== dateRange.length)
    ) {
      const nextAttendance = players.map((player) =>
        activityTrackerToAttendance(player.activity_tracker || {})
      );
      setAttendance(nextAttendance);
      setOriginalAttendance(JSON.parse(JSON.stringify(nextAttendance)));
    }
    // attendance intentionally omitted — including it would re-sync on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, dateRange]);

  const handleAttendanceClick = (rowIdx, colIdx) => {
    setAttendance((prev) => {
      const next = prev.map((row) => [...row]);
      const current = next[rowIdx][colIdx];
      const nextState = attendanceStates[(attendanceStates.indexOf(current) + 1) % attendanceStates.length];
      next[rowIdx][colIdx] = nextState;
      return next;
    });
  };

  // Save handler: only send updates for changed players
  const handleSaveChanges = async () => {
    setSaving(true);
    let anyChanged = false;
    for (let rowIndex = 0; rowIndex < players.length; rowIndex++) {
      const player = players[rowIndex];
      const current = attendance[rowIndex];
      const original = originalAttendance[rowIndex];
      // Compare arrays
      const changed = JSON.stringify(current) !== JSON.stringify(original);
      if (!changed) continue;
      anyChanged = true;
      // Build tracker object
      const tracker = {};
      for (let colIndex = 0; colIndex < dateRange.length; colIndex++) {
        const date = dateRange[colIndex];
        const dateKey = date.toISOString().slice(0, 10);
        tracker[dateKey] = {
          status: attendance[rowIndex]?.[colIndex] || '-',
          lock: false,
          types: { Blitz: {}, Rapid: {} },
          total_games: null
        };
      }
      try {
        const res = await fetch(`/api/tracker/${player.Chess_com_ID || player.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity_tracker: tracker })
        });
        if (!res.ok) throw new Error('Failed to save');
        toast({
          title: `Saved for ${player.Player_Name}`,
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      } catch (err) {
        toast({
          title: `Error saving for ${player.Player_Name}`,
          description: err.message,
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
    if (!anyChanged) {
      toast({
        title: 'No changes to save',
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    } else {
      // Re-fetch data after saving
      await fetchPlayersAndAttendance();
    }
    setSaving(false);
  };

  // Fetch games for all players/dates in No of games played view
  const [fetching, setFetching] = useState(false);
  const handleFetchGames = async () => {
    setFetching(true);
    let errors = [];
    for (let rowIndex = 0; rowIndex < players.length; rowIndex++) {
      const player = players[rowIndex];
      for (let colIndex = 0; colIndex < dateRange.length; colIndex++) {
        const date = dateRange[colIndex];
        const dateKey = date.toISOString().slice(0, 10);
        try {
          const res = await fetch('/api/automation/test-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: player.Chess_com_ID || player.id, date: dateKey })
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            errors.push({ player: player.Player_Name, date: dateKey, error: data.error });
          }
        } catch (err) {
          errors.push({ player: player.Player_Name, date: dateKey, error: err.message });
        }
      }
    }
    await fetchPlayersAndAttendance();
    setFetching(false);
    if (errors.length) {
      toast({
        title: 'Some fetches failed',
        description: `${errors.length} errors. See console for details.`,
        status: 'warning',
        duration: 4000,
        isClosable: true,
      });
      console.error('Fetch errors:', errors);
    } else {
      toast({
        title: 'Fetched and updated all games!',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    }
  };

  // Handler to set all attendance for a date
  const handleMarkAllForDate = (colIndex, value) => {
    setAttendance(prev => prev.map(row => {
      const next = [...row];
      next[colIndex] = value;
      return next;
    }));
    setIsModalOpen(false);
    setActiveDateMenu(null);
    setModalColIndex(null);
  };

  if (loading) {
    return (
      <Center h="80vh">
        <VStack spacing={4}>
          <Spinner size="xl" color="teal.500" />
          <Text fontSize="lg" color="gray.500">
            Loading Activity Tracker...
          </Text>
        </VStack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="80vh">
        <Alert status="error" borderRadius="md" maxW="md">
          <AlertIcon />
          <VStack align="start" spacing={2}>
            <Text fontWeight="bold">Failed to load data</Text>
            <Text fontSize="sm">{error}</Text>
          </VStack>
        </Alert>
      </Center>
    );
  }

  // Replace the header and toggle with a single Flex row
  return (
    <Container maxW="7xl" py={8}>
      <VStack spacing={8} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between" mb={6}>
          <Heading size="lg" color="teal.600">
            Activity Tracker
          </Heading>
          <ButtonGroup isAttached variant="outline" size="md">
            <Button colorScheme="teal" variant={selectedView === 'Attendance' ? 'solid' : 'ghost'} onClick={() => setSelectedView('Attendance')}>Attendance</Button>
            <Button colorScheme="teal" variant={selectedView === 'No of games played' ? 'solid' : 'ghost'} onClick={() => setSelectedView('No of games played')}>No of games played</Button>
            <Button colorScheme="teal" variant={selectedView === 'Every day rating' ? 'solid' : 'ghost'} onClick={() => setSelectedView('Every day rating')}>Every day rating</Button>
          </ButtonGroup>
        </Flex>

        {/* Two Containers Side by Side */}
        <Flex w="100%" gap={4}>
          <Box w="30%" minW="200px">
            {/* --- Player Table --- */}
            <Box border="1px solid" borderColor={borderColor} borderRadius="md" overflow="hidden">
              <Table variant="simple">
                <Thead>
                  <Tr bg={headerBg}>
                    <Th px={2} py={4} minH={HEADER_HEIGHT} height={HEADER_HEIGHT} fontSize={{ base: 'xs', md: 'sm', lg: 'md' }} fontWeight="bold" color="gray.700" bg={headerBg} textAlign="center" borderRight="1px solid" borderColor={borderColor}>Sl.no</Th>
                    <Th px={2} py={4} minH={HEADER_HEIGHT} height={HEADER_HEIGHT} fontSize={{ base: 'xs', md: 'sm', lg: 'md' }} fontWeight="bold" color="gray.700" bg={headerBg} textAlign="center">Player Name</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {players.map((player, index) => (
                    <Tr key={player.Chess_com_ID || player.Player_Name}>
                      <Td px={2} py={3.5} minH={HEADER_HEIGHT} fontSize={{ base: 'xs', md: 'sm', lg: 'md' }} color="gray.700" textAlign="center" borderRight="1px solid" borderColor={borderColor}>{index + 1}</Td>
                      <Td px={2} py={3.5} minH={HEADER_HEIGHT} fontSize={{ base: 'xs', md: 'sm', lg: 'md' }} color="gray.700" textAlign="center"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 100
                        }}
                      >
                        {player.Player_Name}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
                </Box>
          <Box w="70%" minW="300px">
            {/* --- Date Table --- */}
            <Box border="1px solid" borderColor={borderColor} borderRadius="md" overflow="hidden">
              <Box overflowX="auto" sx={{
                '&::-webkit-scrollbar': {
                  height: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  background: isDarkMode ? 'gray.600' : 'gray.200',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: isDarkMode ? 'gray.500' : 'gray.400',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb:hover': {
                  background: isDarkMode ? 'gray.400' : 'gray.500',
                },
              }}>
                <Table variant="simple" size="sm" minW="max-content">
                  <Thead>
                    <Tr bg={headerBg}>
                      {dateRange.map((date, colIndex) => (
                        <Th
                          key={date.toISOString()}
                          px={1}
                          py={4}
                          minH={HEADER_HEIGHT}
                          height={HEADER_HEIGHT}
                          fontSize="md"
                          fontWeight="bold"
                          color="gray.700"
                          minW="60px"
                          textAlign="center"
                          position="relative"
                          top={0}
                          bg={headerBg}
                          zIndex={1}
                          style={{ cursor: selectedView === 'Attendance' ? 'pointer' : 'default', userSelect: 'none' }}
                          _hover={selectedView === 'Attendance' ? { bg: thHoverBg } : {}}
                          onClick={selectedView === 'Attendance' ? () => { setIsModalOpen(true); setModalColIndex(colIndex); } : undefined}
                        >
                          {date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {players.map((player, rowIndex) => (
                      <Tr key={rowIndex}>
                        {dateRange.map((date, colIndex) => (
                          <Td
                            key={date.toISOString()}
                            px={1}
                            py={4}
                            minH="56px"
                            fontSize="md"
                            textAlign="center"
                            border="1px solid"
                            borderColor={borderColor}
                            // Only use bg for Attendance view
                            bg={selectedView === 'Attendance' ? attendanceStyles[attendance[rowIndex]?.[colIndex] || '-'].bg : undefined}
                            color={selectedView === 'Attendance' ? attendanceStyles[attendance[rowIndex]?.[colIndex] || '-'].color : undefined}
                            fontWeight={selectedView === 'Attendance' ? 'bold' : 'normal'}
                            cursor={selectedView === 'Attendance' ? 'pointer' : 'default'}
                            transition="background 0.2s"
                            _hover={selectedView === 'Attendance' ? { filter: 'brightness(0.95)' } : undefined}
                            onClick={selectedView === 'Attendance' ? () => handleAttendanceClick(rowIndex, colIndex) : undefined}
                            style={selectedView === 'No of games played' ? { background: getGameColor(getTotalGames(players[rowIndex], date)), transition: 'background 0.2s' } : undefined}
                          >
                            {selectedView === 'Attendance' && (attendance[rowIndex]?.[colIndex] || '-')}
                            {selectedView === 'No of games played' && getTotalGames(players[rowIndex], date)}
                            {selectedView === 'Every day rating' && getLastRating(players[rowIndex], date, ratingType)}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
            {/* Save Changes Button */}
            {selectedView === 'Attendance' && (
              <Flex justify="flex-end" mt={4}>
                <Button colorScheme="teal" onClick={handleSaveChanges} isLoading={saving} loadingText="Saving...">
                  Save Changes
                </Button>
              </Flex>
            )}
            {selectedView === 'No of games played' && (
              <Flex justify="flex-end" mt={4}>
                <Button colorScheme="teal" onClick={handleFetchGames} isLoading={fetching} loadingText="Fetching...">
                  Fetch
                </Button>
              </Flex>
            )}
            {selectedView === 'Every day rating' && (
              <Flex justify="center" mt={4} gap={2}>
                <ButtonGroup isAttached variant="outline" size="md">
                  <Button colorScheme="teal" variant={ratingType === 'Blitz' ? 'solid' : 'ghost'} onClick={() => setRatingType('Blitz')}>Blitz</Button>
                  <Button colorScheme="teal" variant={ratingType === 'Rapid' ? 'solid' : 'ghost'} onClick={() => setRatingType('Rapid')}>Rapid</Button>
                </ButtonGroup>
              </Flex>
            )}
            {/* Remove the extra row of date buttons above the table */}
          </Box>
        </Flex>

        {/* Footer Info */}
        <Box textAlign="center" py={4}>
          <Text fontSize="sm" color="gray.500">
            Last updated: {new Date().toLocaleString()}
              </Text>
        </Box>
      </VStack>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent maxW="xs">
          <ModalHeader textAlign="center" fontSize="md" py={2}>
            Bulk Mark for {modalColIndex !== null ? dateRange[modalColIndex].toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : ''}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            <Flex direction="column" gap={2}>
              <Button size="md" colorScheme="green" w="100%" fontSize="sm" h="32px" onClick={() => handleMarkAllForDate(modalColIndex, 'P')}>Mark all Present</Button>
              <Button size="md" colorScheme="red" w="100%" fontSize="sm" h="32px" onClick={() => handleMarkAllForDate(modalColIndex, 'A')}>Mark all Absent</Button>
              <Button size="md" colorScheme="gray" w="100%" fontSize="sm" h="32px" onClick={() => handleMarkAllForDate(modalColIndex, '-')}>Mark all None</Button>
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default ActivityTrackerPage; 