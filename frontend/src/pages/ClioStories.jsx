import React, { useEffect, useState } from 'react';
import {
  SimpleGrid,
  Text,
  Button,
  Badge,
  Spinner,
  Center,
  useColorModeValue,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PageShell from '../components/dashboard/PageShell';

function ClioStories() {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const cardBg = useColorModeValue('gray.50', 'navy.700');

  useEffect(() => {
    const loadStories = async () => {
      try {
        const modRes = await axios.get('/api/modules');
        const firstModule = modRes.data?.[0];
        if (!firstModule?.module_id) {
          setStories([]);
          return;
        }
        const chapRes = await axios.get(`/api/modules/${firstModule.module_id}/chapters`);
        const firstChapter = chapRes.data?.[0];
        if (!firstChapter?.chapter_id) {
          setStories([]);
          return;
        }
        const storyRes = await axios.get(`/api/chapters/${firstChapter.chapter_id}/stories`);
        setStories(storyRes.data || []);
      } catch {
        setStories([]);
      } finally {
        setLoading(false);
      }
    };
    loadStories();
  }, []);

  return (
    <PageShell
      title="Clio Stories"
      subtitle="Browse narrative chess stories mapped to curriculum chapters."
      actions={
        <Button
          bg="gold.500"
          color="navy.900"
          _hover={{ bg: 'gold.400' }}
          onClick={() => navigate('/dashboard')}
        >
          Browse Modules
        </Button>
      }
    >
      {loading ? (
        <Center py={12}>
          <Spinner color="gold.500" />
        </Center>
      ) : stories.length === 0 ? (
        <Text color="gray.500">No stories loaded. Open a module from the dashboard to explore stories.</Text>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          {stories.slice(0, 9).map((story) => (
            <Button
              key={story.story_id}
              variant="unstyled"
              h="auto"
              textAlign="left"
              p={4}
              borderRadius="lg"
              bg={cardBg}
              onClick={() => navigate(`/api/story/${story.story_id}`)}
              _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
            >
              <Badge mb={2} colorScheme="yellow">
                {story.story_id}
              </Badge>
              <Text fontWeight="600">{story.story_name || story.title || 'Story'}</Text>
            </Button>
          ))}
        </SimpleGrid>
      )}
    </PageShell>
  );
}

export default ClioStories;
