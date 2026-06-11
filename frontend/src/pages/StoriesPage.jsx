import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  Input,
  VStack,
  Text,
  Spinner,
  useColorModeValue,
  Badge,
} from '@chakra-ui/react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRoleStoryAccess } from '../hooks/useRoleStoryAccess';
import StoryPage from './StoryPage';

function StudentStoriesPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const isGuest = !user;
  const isCoach = user?.role === 'coach';
  const roleToEdit = isStudent ? 'student' : 'guest';
  const { storyAccess, loading: roleAccessLoading } = useRoleStoryAccess(roleToEdit);
  const [stories, setStories] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const bgColor = useColorModeValue('gray.50', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.800');
  const cardHoverBg = useColorModeValue('blue.100', 'blue.600');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const inputBg = useColorModeValue('white', 'gray.800');
  const inputBorderColor = useColorModeValue('gray.300', 'gray.600');
  const inputPlaceholderColor = useColorModeValue('gray.500', 'gray.400');
  const cardBorderColor = useColorModeValue('gray.200', 'gray.600');

  useEffect(() => {
    axios
      .get(`/api/chapters/${chapterId}/stories`)
      .then((response) => {
        setStories(response.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chapterId]);

  const filteredStories = stories.filter(
    (story) =>
      story.title.toLowerCase().includes(search.toLowerCase()) ||
      (story.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const chapterLabel = chapterId.replace(/\D/g, '') || chapterId;

  if (loading || roleAccessLoading) {
    return (
      <Box textAlign="center" mt={10}>
        <Spinner size="xl" />
      </Box>
    );
  }

  return (
    <Box p={8} bg={bgColor} minH="100vh">
      <Heading mb={6} textAlign="center" color={textColor}>
        Stories for Chapter {chapterLabel}
      </Heading>
      <Box maxW="600px" mx="auto" mb={10}>
        <Input
          placeholder="Search stories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="lg"
          bg={inputBg}
          color={textColor}
          borderColor={inputBorderColor}
          _placeholder={{ color: inputPlaceholderColor }}
        />
      </Box>
      <VStack spacing={6} align="stretch" maxW="600px" mx="auto">
        {filteredStories.map((story) => {
          const isUnlockedForRole = storyAccess.includes(String(story.story_id));
          const canOpen =
            isCoach || (isStudent && isUnlockedForRole) || (isGuest && isUnlockedForRole);

          return (
            <Box
              key={story.story_id}
              p={{ base: 3, md: 6 }}
              bg={cardBg}
              color={textColor}
              borderRadius="md"
              boxShadow="md"
              borderWidth="1px"
              borderColor={cardBorderColor}
              position="relative"
              opacity={canOpen ? 1 : 0.6}
              cursor={canOpen ? 'pointer' : 'not-allowed'}
              transition="all 0.3s ease"
              _hover={
                canOpen
                  ? { bg: cardHoverBg, transform: 'translateY(-5px)', boxShadow: 'lg' }
                  : {}
              }
              onClick={() => canOpen && navigate(`/api/story/${story.story_id}`)}
            >
              <Heading size="md" mb={2}>
                {story.title}
              </Heading>
              <Text fontSize="md">{story.description}</Text>
              {!canOpen && (
                <Badge colorScheme="red" mt={2}>
                  Locked
                </Badge>
              )}
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

function StoriesPage() {
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  if (isAdmin) {
    return <StoryPage />;
  }

  return <StudentStoriesPage />;
}

export default StoriesPage;
