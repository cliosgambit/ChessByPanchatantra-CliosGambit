import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  VStack,
  Text,
  Spinner,
  Image,
  Flex,
  useColorModeValue,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { fetchStoryById, fetchStoryMappings } from '../services/curriculumService';
import ErrorPanel from '../components/common/ErrorPanel';

const MappingsList = ({ mappings, mappingBg, cardHoverBg, textColor, storyId }) => (
  <VStack spacing={4} align="stretch" w="100%">
    <Heading as="h2" size="lg" mb={0} mt={4} color={textColor}>
      Story Details
    </Heading>
    {mappings.length === 0 ? (
      <Text color={textColor} fontSize="sm">
        No story mappings found for this story.
      </Text>
    ) : (
      mappings.map((mapping) => (
        <Box
          as={RouterLink}
          to={`/api/story/${storyId}/mapping/${mapping.mapping_id}`}
          key={mapping.mapping_id}
          p={4}
          bg={mappingBg}
          borderRadius="md"
          transition="all 0.3s ease"
          cursor="pointer"
          _hover={{
            bg: cardHoverBg,
            transform: 'translateY(-2px)',
            boxShadow: 'md',
          }}
        >
          <Text color={textColor} whiteSpace="normal" wordBreak="break-word">
            {mapping.story_text}
          </Text>
        </Box>
      ))
    )}
  </VStack>
);

function StoryDetails() {
  const { storyId } = useParams();
  const [story, setStory] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isMobile = useBreakpointValue({ base: true, md: false });

  const pageBg = useColorModeValue('gray.50', 'gray.800');
  const cardHoverBg = useColorModeValue('blue.100', 'blue.600');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const subTextColor = useColorModeValue('gray.500', 'gray.400');
  const mappingBg = useColorModeValue('gray.100', 'gray.600');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [storyRow, mappingRows] = await Promise.all([
          fetchStoryById(storyId),
          fetchStoryMappings(storyId),
        ]);
        if (!cancelled) {
          setStory(storyRow);
          setMappings(mappingRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load story details.');
          setStory(null);
          setMappings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  if (loading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={8}>
        <ErrorPanel title="Unable to load story" message={error} />
      </Box>
    );
  }

  if (!story) {
    return (
      <Box p={8} textAlign="center">
        <Heading size="lg">Story not found.</Heading>
      </Box>
    );
  }

  const TitleDescription = (
    <Box>
      <Heading as="h1" size={{ base: 'xl', md: '2xl' }} mb={3} color={textColor}>
        {story.title}
      </Heading>
      <Text fontSize={{ base: 'md', md: 'lg' }} color={subTextColor}>
        {story.description}
      </Text>
    </Box>
  );

  const StoryImage = (
    <Image
      src={`/story_images/${parseInt(String(storyId).replace(/\D/g, ''), 10)}.png`}
      alt={story.title}
      borderRadius="md"
      objectFit="cover"
      width={{ base: '100%', md: '85%' }}
      aspectRatio="1 / 1"
      boxShadow="xl"
      fallbackSrc="https://via.placeholder.com/400x400?text=Story+Image"
    />
  );

  const commonMappingsProps = { mappings, mappingBg, cardHoverBg, textColor, storyId };

  return (
    <Box p={{ base: 4, md: 8 }} bg={pageBg} minH="100vh">
      {isMobile ? (
        <VStack spacing={6} align="stretch">
          {TitleDescription}
          {StoryImage}
          <MappingsList {...commonMappingsProps} />
        </VStack>
      ) : (
        <Flex gap={10} align="flex-start">
          <VStack flex="1" spacing={6} align="stretch">
            {TitleDescription}
            <MappingsList {...commonMappingsProps} />
          </VStack>
          <Box flex="1" display="flex" justifyContent="center" alignItems="center">
            {StoryImage}
          </Box>
        </Flex>
      )}
    </Box>
  );
}

export default StoryDetails;
