import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Spinner,
  useToast,
  useColorModeValue,
  Badge,
} from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { useRoleChapterAccess } from '../hooks/useRoleChapterAccess';
import ModuleDetails from './ModuleDetails';

const boardThemes = [
  { lightMode: { lightSq: '#ebecd0', darkSq: '#779556', text: 'gray.800' }, darkMode: { lightSq: '#B5CAA3', darkSq: '#779556', text: 'whiteAlpha.900' } },
  { lightMode: { lightSq: '#f0d9b5', darkSq: '#b58863', text: 'gray.800' }, darkMode: { lightSq: '#D8C6A8', darkSq: '#8B6950', text: 'whiteAlpha.900' } },
  { lightMode: { lightSq: '#dee3e6', darkSq: '#8ca2ad', text: 'gray.800' }, darkMode: { lightSq: '#A0B0B8', darkSq: '#647E8A', text: 'whiteAlpha.900' } },
  { lightMode: { lightSq: '#e6e6fa', darkSq: '#9370db', text: 'gray.800' }, darkMode: { lightSq: '#B8A8E0', darkSq: '#6A4CAF', text: 'whiteAlpha.900' } },
  { lightMode: { lightSq: '#ffebcd', darkSq: '#ff7f50', text: 'gray.800' }, darkMode: { lightSq: '#FFCBAA', darkSq: '#D96C44', text: 'whiteAlpha.900' } },
];

function StudentChaptersPage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isGuest = !user;
  const isCoach = user?.role === 'coach';
  const roleToEdit = isStudent ? 'student' : 'guest';
  const { chapAccess, loading: roleAccessLoading } = useRoleChapterAccess(roleToEdit);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const colorMode = useColorModeValue('light', 'dark');

  useEffect(() => {
    const fetchChapters = async () => {
      try {
        const res = await fetch(`/api/modules/${moduleId}/chapters`);
        if (!res.ok) throw new Error('Error fetching chapters');
        const data = await res.json();
        setChapters(data);
      } catch (error) {
        toast({
          title: 'Error fetching chapters',
          description: error.message,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchChapters();
  }, [moduleId, toast]);

  if (loading || roleAccessLoading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  const moduleLabel = moduleId.replace(/\D/g, '') || moduleId;

  return (
    <Box p={8}>
      <Heading textAlign="center" mb={8}>
        Chapters for Module {moduleLabel}
      </Heading>
      {chapters.length === 0 ? (
        <Text textAlign="center">No chapters found for this module.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={6}>
          {chapters.map((chapter, index) => {
            const theme = boardThemes[index % boardThemes.length];
            const lightColor = colorMode === 'light' ? theme.lightMode.lightSq : theme.darkMode.lightSq;
            const darkColor = colorMode === 'light' ? theme.lightMode.darkSq : theme.darkMode.darkSq;
            const textColor = colorMode === 'light' ? theme.lightMode.text : theme.darkMode.text;
            const isUnlockedForRole = chapAccess.includes(String(chapter.chapter_id));
            const canOpen =
              isCoach || (isStudent && isUnlockedForRole) || (isGuest && isUnlockedForRole);

            return (
              <Box
                key={chapter.chapter_id}
                bgGradient={`linear(to-br, ${lightColor}, ${darkColor})`}
                color={textColor}
                borderRadius="lg"
                minH={{ base: '180px', md: '220px' }}
                p={{ base: 4, md: 6 }}
                boxShadow="md"
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                position="relative"
                opacity={canOpen ? 1 : 0.6}
                cursor={canOpen ? 'pointer' : 'not-allowed'}
                transition="all 0.3s ease"
                _hover={canOpen ? { transform: 'scale(1.05)', boxShadow: 'xl' } : {}}
                onClick={() => canOpen && navigate(`/api/stories/${chapter.chapter_id}`)}
              >
                <Heading size="md" mb={2} textAlign="center" w="100%">
                  {chapter.chapter_id}
                </Heading>
                <Text fontSize="lg" textAlign="center" w="100%">
                  {chapter.chapter_name}
                </Text>
                {!canOpen && (
                  <Badge colorScheme="red" position="absolute" bottom={2} right={2}>
                    Locked
                  </Badge>
                )}
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </Box>
  );
}

function ChaptersPage() {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  if (isAdmin) {
    return <ModuleDetails />;
  }

  return <StudentChaptersPage />;
}

export default ChaptersPage;
