import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SimpleGrid,
  Text,
  Badge,
  HStack,
  VStack,
  Spinner,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiUsers } from 'react-icons/fi';
import PageShell from '../components/dashboard/PageShell';
import ErrorPanel from '../components/common/ErrorPanel';
import { fetchLoginUsers } from '../services/loginService';
import { countTable } from '../lib/supabase/crud';

function Classes() {
  const [coaches, setCoaches] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cardBg = useColorModeValue('gray.50', 'navy.700');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, students] = await Promise.all([
        fetchLoginUsers(),
        countTable('Login', {
          filters: (q) => q.ilike('Role', 'student'),
        }).catch(() => 0),
      ]);
      setCoaches(users.filter((u) => u.roleRaw === 'coach'));
      setStudentCount(students);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cohorts = useMemo(() => {
    if (coaches.length === 0) {
      return [
        {
          name: 'Academy Students',
          coach: 'All Coaches',
          students: studentCount,
          schedule: 'Live roster from Login table',
        },
      ];
    }
    const perCoach = Math.max(1, Math.floor(studentCount / coaches.length));
    return coaches.map((coach, i) => ({
      name: `Cohort ${i + 1}`,
      coach: coach.name,
      students: perCoach,
      schedule: `${coach.chessComId} · Coach`,
    }));
  }, [coaches, studentCount]);

  return (
    <PageShell title="Classes" subtitle="Coach cohorts derived from Login table roles.">
      {loading && (
        <Box py={12} textAlign="center">
          <Spinner color="gold.500" />
        </Box>
      )}
      {error && <ErrorPanel message={error} onRetry={load} />}
      {!loading && !error && (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5}>
          {cohorts.map((cls) => (
            <VStack key={cls.name + cls.coach} align="stretch" p={5} borderRadius="lg" bg={cardBg} spacing={3}>
              <Text fontWeight="700" fontSize="lg">
                {cls.name}
              </Text>
              <HStack fontSize="sm" color="gray.500">
                <FiUsers />
                <Text>{cls.students} students</Text>
              </HStack>
              <Text fontSize="sm">Coach: {cls.coach}</Text>
              <Badge colorScheme="yellow" alignSelf="flex-start">
                {cls.schedule}
              </Badge>
            </VStack>
          ))}
        </SimpleGrid>
      )}
    </PageShell>
  );
}

export default Classes;
