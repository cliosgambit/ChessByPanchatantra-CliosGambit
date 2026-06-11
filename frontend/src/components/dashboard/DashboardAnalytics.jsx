import React from 'react';
import {
  Box,
  SimpleGrid,
  Flex,
  HStack,
  VStack,
  Text,
  Heading,
  Button,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Avatar,
  Badge,
  Select,
  useColorModeValue,
} from '@chakra-ui/react';
import { BellIcon } from '@chakra-ui/icons';
import {
  FiUsers,
  FiUserCheck,
  FiBook,
  FiTarget,
  FiAward,
  FiTrendingUp,
  FiDownload,
  FiChevronRight,
} from 'react-icons/fi';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import LoadingPanel from '../common/LoadingPanel';
import ErrorPanel from '../common/ErrorPanel';

const ICON_MAP = {
  users: FiUsers,
  students: FiUserCheck,
  stories: FiBook,
  puzzles: FiTarget,
  achievements: FiAward,
};

const TINT_MAP = {
  users: 'rgba(15, 23, 41, 0.08)',
  students: 'rgba(201, 162, 39, 0.12)',
  stories: 'rgba(15, 23, 41, 0.06)',
  puzzles: 'rgba(201, 162, 39, 0.1)',
  achievements: 'rgba(15, 23, 41, 0.08)',
};

const ACTIVITY_DOT = {
  student: 'green.400',
  story: 'blue.400',
  puzzle: 'purple.400',
  class: 'orange.400',
  achievement: 'gold.500',
};

function StatCard({ card, index, cardBg, borderColor, subColor }) {
  const Icon = card.icon;
  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35 }}
      bg={cardBg}
      p={5}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="md"
      position="relative"
      overflow="hidden"
      _hover={{ transform: 'translateY(-3px)', boxShadow: 'lg' }}
    >
      <Box
        position="absolute"
        right={-4}
        top={-4}
        w="72px"
        h="72px"
        borderRadius="full"
        bg={card.tint}
      />
      <Flex justify="space-between" align="flex-start" position="relative">
        <Box>
          <Text fontSize="sm" color={subColor} fontWeight="500">
            {card.label}
          </Text>
          <Text fontSize="2xl" fontWeight="800" color="navy.700" mt={1}>
            {card.value}
          </Text>
          <HStack spacing={1} mt={2} color="green.600" fontSize="xs" fontWeight="600">
            <FiTrendingUp />
            <Text>{card.growth}</Text>
          </HStack>
        </Box>
        <Flex
          w="44px"
          h="44px"
          borderRadius="lg"
          bg="navy.700"
          color="gold.300"
          align="center"
          justify="center"
        >
          <Icon size={20} />
        </Flex>
      </Flex>
    </Box>
  );
}

function DashboardAnalytics() {
  const { user } = useAuth();
  const { stats, loading, error, refetch } = useDashboardStats();

  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'gold.700');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const chartGrid = useColorModeValue('#e8e4da', '#2d3a5c');
  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const activityHover = useColorModeValue('gray.50', 'whiteAlpha.100');
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Admin';

  const statCards = (stats?.statCards || []).map((c) => ({
    ...c,
    icon: ICON_MAP[c.icon] || ICON_MAP[c.key] || FiUsers,
    tint: TINT_MAP[c.key] || TINT_MAP.users,
  }));

  const growthData = stats?.growthData || [];
  const roleData = stats?.roleDistribution || [];
  const recentActivity = stats?.recentActivity || [];

  if (loading && !stats) {
    return (
      <Box w="100%" bg={pageBg} minH="calc(100vh - 72px)" px={{ base: 4, md: 8, xl: 10 }} pt={8}>
        <LoadingPanel message="Loading live dashboard stats from Supabase..." />
      </Box>
    );
  }

  if (error && !stats) {
    return (
      <Box w="100%" bg={pageBg} minH="calc(100vh - 72px)" px={{ base: 4, md: 8, xl: 10 }} pt={8}>
        <ErrorPanel title="Dashboard unavailable" message={error} onRetry={refetch} />
      </Box>
    );
  }

  return (
    <Box w="100%" bg={pageBg} minH="calc(100vh - 72px)" pb={10}>
      <Box px={{ base: 4, md: 8, xl: 10 }} pt={{ base: 6, md: 8 }}>
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          justify="space-between"
          align={{ base: 'flex-start', lg: 'flex-start' }}
          gap={6}
          mb={8}
        >
          <Box>
            <HStack spacing={2} fontSize="sm" color={breadcrumbColor} mb={2}>
              <Text fontWeight="600">Admin</Text>
              <FiChevronRight />
              <Text color="gold.600" fontWeight="600">
                Dashboard
              </Text>
            </HStack>
            <Heading size="lg" color={headingColor} letterSpacing="-0.02em">
              Welcome back, {displayName} 👑
            </Heading>
            <Text mt={2} color={subColor} fontSize="md">
              Here&apos;s what&apos;s happening in your academy today.
            </Text>
          </Box>

          <HStack spacing={3} flexWrap="wrap" align="center">
            <Select
              size="sm"
              maxW="160px"
              bg={cardBg}
              borderColor={borderColor}
              borderRadius="lg"
              defaultValue="7d"
              aria-label="Date range"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </Select>

            <Menu>
              <MenuButton
                as={IconButton}
                icon={<BellIcon />}
                variant="outline"
                borderColor={borderColor}
                borderRadius="lg"
                aria-label="Notifications"
              />
              <MenuList>
                {recentActivity.slice(0, 3).map((item) => (
                  <MenuItem key={item.id}>{item.text}</MenuItem>
                ))}
                <MenuDivider />
                <MenuItem>Live from Supabase</MenuItem>
              </MenuList>
            </Menu>

            <Avatar size="sm" name={displayName} bg="navy.700" color="gold.300" />

            <Button
              leftIcon={<FiDownload />}
              size="sm"
              bg="gold.500"
              color="navy.900"
              _hover={{ bg: 'gold.400' }}
              borderRadius="lg"
              fontWeight="700"
            >
              Export Report
            </Button>
          </HStack>
        </Flex>

        <SimpleGrid columns={{ base: 1, sm: 2, md: 3, xl: 5 }} spacing={5} mb={8}>
          {statCards.map((card, i) => (
            <StatCard
              key={card.key}
              card={card}
              index={i}
              cardBg={cardBg}
              borderColor={borderColor}
              subColor={subColor}
            />
          ))}
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, xl: 12 }} spacing={6}>
          <Box
            gridColumn={{ xl: 'span 5' }}
            bg={cardBg}
            p={5}
            borderRadius="xl"
            borderWidth="1px"
            borderColor={borderColor}
            boxShadow="md"
            minH="340px"
            as={motion.div}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Heading size="sm" color={headingColor} mb={4}>
              User Growth Overview
            </Heading>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="month" tick={{ fill: subColor, fontSize: 12 }} />
                <YAxis tick={{ fill: subColor, fontSize: 12 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#c9a227"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#c9a227' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          <Box
            gridColumn={{ xl: 'span 4' }}
            bg={cardBg}
            p={5}
            borderRadius="xl"
            borderWidth="1px"
            borderColor={borderColor}
            boxShadow="md"
            minH="340px"
            as={motion.div}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
          >
            <Heading size="sm" color={headingColor} mb={2}>
              Users by Role
            </Heading>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={roleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {roleData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          <Box
            gridColumn={{ xl: 'span 3' }}
            bg={cardBg}
            p={5}
            borderRadius="xl"
            borderWidth="1px"
            borderColor={borderColor}
            boxShadow="md"
            minH="340px"
            as={motion.div}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.48 }}
          >
            <Flex justify="space-between" align="center" mb={4}>
              <Heading size="sm" color={headingColor}>
                Recent Activity
              </Heading>
              <Badge colorScheme="yellow" variant="subtle">
                Live
              </Badge>
            </Flex>
            <VStack align="stretch" spacing={0} divider={<Box borderColor={borderColor} />}>
              {recentActivity.map((item, index) => (
                <HStack
                  key={item.id}
                  py={3}
                  spacing={3}
                  as={motion.div}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  _hover={{ bg: activityHover }}
                  borderRadius="md"
                  px={2}
                >
                  <Box w={2} h={2} borderRadius="full" bg={ACTIVITY_DOT[item.type]} flexShrink={0} />
                  <Box flex={1}>
                    <Text fontSize="sm" fontWeight="600" color={headingColor}>
                      {item.text}
                    </Text>
                    <Text fontSize="xs" color={subColor}>
                      {item.time}
                    </Text>
                  </Box>
                </HStack>
              ))}
            </VStack>
          </Box>
        </SimpleGrid>
      </Box>
    </Box>
  );
}

export default DashboardAnalytics;
