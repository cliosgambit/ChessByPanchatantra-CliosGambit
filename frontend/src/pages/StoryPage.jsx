import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Grid,
  GridItem,
  Text,
  Button,
  Spinner,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  useColorModeValue,
  useDisclosure,
  useToast,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  UnorderedList,
  ListItem,
} from '@chakra-ui/react';
import { FiChevronRight, FiSearch } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import StoryCard from '../components/stories/StoryCard';
import AddStoryModal from '../components/stories/AddStoryModal';
import EditStoryModal from '../components/stories/EditStoryModal';
import StickyAdminPageLayout from '../components/common/StickyAdminPageLayout';
import { useDebouncedValue, filterBySearch } from '../utils/debounce';
import {
  fetchStoriesByChapter,
  createStory,
  updateStory,
  deleteStories,
  getStoriesDeletionStatus,
  subscribeToStories,
  unsubscribeChannel,
} from '../services/curriculumService';

const MotionButton = motion(Button);

function formatChapterLabel(chapterId) {
  if (!chapterId) return '1';
  const digits = String(chapterId).replace(/\D/g, '');
  return digits || chapterId;
}

function formatStoryLabel(story) {
  const num =
    story?.story_number != null
      ? String(story.story_number).padStart(2, '0')
      : story?.story_id;
  return `Story ${num}`;
}

function normalizeStoryStatus(status) {
  return status === 'draft' ? 'draft' : 'active';
}

function toggleIdSelection(id, setIds) {
  setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
}

function StoryPage() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: editOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();
  const {
    isOpen: confirmOpen,
    onOpen: onConfirmOpen,
    onClose: onConfirmClose,
  } = useDisclosure();
  const {
    isOpen: warningOpen,
    onOpen: onWarningOpen,
    onClose: onWarningClose,
  } = useDisclosure();
  const toast = useToast();
  const cancelRef = useRef();
  const warningCancelRef = useRef();

  const [selectionMode, setSelectionMode] = useState(null);
  const [selectedEditStoryId, setSelectedEditStoryId] = useState(null);
  const [selectedStoryIds, setSelectedStoryIds] = useState([]);
  const [deleteBlocked, setDeleteBlocked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);

  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const inputBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const iconColor = useColorModeValue('gray.400', 'gray.500');
  const chapterLabel = formatChapterLabel(chapterId);

  const selectedStory = stories.find((s) => s.story_id === selectedEditStoryId);
  const selectedStoriesForDelete = stories.filter((s) =>
    selectedStoryIds.includes(s.story_id)
  );
  const deleteCount = selectedStoryIds.length;

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchStoriesByChapter(chapterId);
      setStories(
        rows.map((s, i) => ({
          ...s,
          story_number: i + 1,
          status: normalizeStoryStatus(s.status),
        }))
      );
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load stories from Supabase.');
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    fetchStories();
    const channel = subscribeToStories(chapterId, { onRefetch: fetchStories });
    return () => {
      if (channel) unsubscribeChannel(channel);
    };
  }, [chapterId, fetchStories]);

  const filteredStories = useMemo(
    () => filterBySearch(stories, debouncedSearch, ['title', 'description', 'story_id', 'status']),
    [stories, debouncedSearch]
  );

  const exitSelectionMode = () => {
    setSelectionMode(null);
    setSelectedEditStoryId(null);
    setSelectedStoryIds([]);
    setDeleteBlocked([]);
  };

  const handleCreateStory = async (payload) => {
    try {
      const storyId = `story-${Date.now()}`;
      await createStory({
        story_id: storyId,
        title: payload.title,
        description: payload.description,
        chapter_id: chapterId,
        module_id: payload.module_id || '',
        status: payload.status || 'active',
        tags: payload.tags,
      });
      toast({
        title: 'Story created',
        description: `"${payload.title}" saved to Supabase.`,
        status: 'success',
        duration: 2500,
      });
      fetchStories();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const handleUpdateStory = async (payload) => {
    setSaving(true);
    try {
      await updateStory(payload.story_id, {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        tags: payload.tags,
      });
      toast({
        title: 'Story updated successfully',
        status: 'success',
        duration: 2500,
      });
      onEditClose();
      exitSelectionMode();
      fetchStories();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleStoryClick = (story) => {
    if (selectionMode === 'edit') {
      setSelectedEditStoryId((prev) =>
        prev === story.story_id ? null : story.story_id
      );
      return;
    }
    if (selectionMode === 'delete') {
      toggleIdSelection(story.story_id, setSelectedStoryIds);
      return;
    }
    navigate(`/api/story/${story.story_id}`);
  };

  const handleEditSelectedClick = () => {
    if (!selectedEditStoryId) return;
    onEditOpen();
  };

  const handleDeleteSelectedClick = async () => {
    if (!deleteCount || checking || deleting) return;
    setChecking(true);
    setDeleteBlocked([]);
    try {
      const status = await getStoriesDeletionStatus(selectedStoryIds);
      if (!status.canDeleteAll) {
        setDeleteBlocked(status.blocked);
        onWarningOpen();
      } else {
        onConfirmOpen();
      }
    } catch (err) {
      toast({
        title: 'Could not verify stories',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCount || deleting) return;
    setDeleting(true);
    try {
      await deleteStories(selectedStoryIds, chapterId);
      const count = deleteCount;
      toast({
        title: `${count} stor${count === 1 ? 'y' : 'ies'} deleted successfully`,
        status: 'success',
        duration: 2500,
      });
      onConfirmClose();
      exitSelectionMode();
      fetchStories();
    } catch (err) {
      if (err.blocked?.length) {
        setDeleteBlocked(err.blocked);
        onConfirmClose();
        onWarningOpen();
      } else {
        toast({
          title: 'Failed to delete stories',
          description: err.message,
          status: 'error',
          duration: 4000,
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  const actionButtons =
    selectionMode === 'edit' ? (
      <HStack spacing={3} flexWrap="wrap">
        <Button
          variant="outline"
          borderRadius="full"
          size="sm"
          fontWeight="600"
          onClick={exitSelectionMode}
          isDisabled={saving}
        >
          Cancel
        </Button>
        <Button
          bg="navy.700"
          color="white"
          _hover={{ bg: 'navy.600' }}
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={handleEditSelectedClick}
          isDisabled={!selectedEditStoryId}
        >
          Edit Selected
        </Button>
      </HStack>
    ) : selectionMode === 'delete' ? (
      <HStack spacing={3} flexWrap="wrap">
        <Button
          variant="outline"
          borderRadius="full"
          size="sm"
          fontWeight="600"
          onClick={exitSelectionMode}
          isDisabled={deleting || checking}
        >
          Cancel
        </Button>
        <Button
          colorScheme="red"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={handleDeleteSelectedClick}
          isDisabled={deleteCount === 0}
          isLoading={checking || deleting}
        >
          Delete Selected ({deleteCount})
        </Button>
      </HStack>
    ) : (
      <HStack spacing={3} flexWrap="wrap">
        <MotionButton
          size="sm"
          bg="navy.700"
          color="white"
          fontWeight="700"
          borderRadius="full"
          px={5}
          onClick={onOpen}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          + Add Story
        </MotionButton>
        <Button
          variant="outline"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('edit');
            setSelectedEditStoryId(null);
            setSelectedStoryIds([]);
          }}
          isDisabled={stories.length === 0}
        >
          Edit Story
        </Button>
        <Button
          variant="outline"
          colorScheme="red"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('delete');
            setSelectedEditStoryId(null);
            setSelectedStoryIds([]);
          }}
          isDisabled={stories.length === 0}
        >
          Delete Story
        </Button>
      </HStack>
    );

  const modeHint =
    selectionMode === 'edit'
      ? 'Edit mode — select one story to update'
      : selectionMode === 'delete'
        ? 'Delete mode — select one or more stories to remove'
        : null;

  return (
    <>
      <StickyAdminPageLayout
        animated
        titleSize="md"
        breadcrumbs={
          <HStack spacing={2} fontSize="xs" color={breadcrumbColor} mb={1}>
            <Text
              fontWeight="600"
              cursor="pointer"
              _hover={{ color: 'gold.600' }}
              onClick={() => navigate(-1)}
            >
              Chapters
            </Text>
            <Box as={FiChevronRight} />
            <Text color="gold.600" fontWeight="600">
              Chapter {chapterLabel}
            </Text>
          </HStack>
        }
        title={`Stories for Chapter ${chapterLabel}`}
        subtitle="Stories from Supabase story table."
        headerExtra={
          modeHint ? (
            <Text mt={2} fontSize="sm" color="orange.600" fontWeight="600">
              {modeHint}
            </Text>
          ) : null
        }
        actions={actionButtons}
      >
        <InputGroup maxW={{ base: '100%', md: '480px' }} size="sm" mb={5}>
          <InputLeftElement pointerEvents="none" h="40px">
            <Box as={FiSearch} color={iconColor} />
          </InputLeftElement>
          <Input
            pl={10}
            h="40px"
            bg={inputBg}
            borderColor={borderColor}
            borderRadius="lg"
            placeholder="Search stories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>

        {loading ? (
          <Box py={16} textAlign="center">
            <Spinner size="xl" color="gold.500" />
          </Box>
        ) : error ? (
          <Box py={12} textAlign="center">
            <Text color="red.500">{error}</Text>
            <Button mt={4} size="sm" onClick={fetchStories} colorScheme="yellow">
              Retry
            </Button>
          </Box>
        ) : filteredStories.length === 0 ? (
          <Box py={16} textAlign="center">
            <Text color={subColor}>
              {search ? 'No stories match your search.' : 'No stories yet.'}
            </Text>
          </Box>
        ) : (
          <Grid
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }}
            gap={6}
            pt={2}
          >
            {filteredStories.map((story, index) => (
              <GridItem key={story.story_id}>
                <StoryCard
                  story={story}
                  index={index}
                  selectable={selectionMode === 'edit' || selectionMode === 'delete'}
                  selected={
                    selectionMode === 'edit'
                      ? selectedEditStoryId === story.story_id
                      : selectedStoryIds.includes(story.story_id)
                  }
                  onClick={() => handleStoryClick(story)}
                />
              </GridItem>
            ))}
          </Grid>
        )}
      </StickyAdminPageLayout>

      <AddStoryModal isOpen={isOpen} onClose={onClose} onCreate={handleCreateStory} />

      <EditStoryModal
        isOpen={editOpen}
        onClose={onEditClose}
        onSave={handleUpdateStory}
        story={selectedStory}
        saving={saving}
      />

      <AlertDialog
        isOpen={confirmOpen}
        leastDestructiveRef={cancelRef}
        onClose={onConfirmClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="xl" mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Stories
            </AlertDialogHeader>
            <AlertDialogBody>
              You are about to delete:
              <UnorderedList mt={3} mb={3} spacing={1}>
                {selectedStoriesForDelete.map((story) => (
                  <ListItem key={story.story_id}>
                    • {formatStoryLabel(story)}
                    {story.title ? ` — ${story.title}` : ''}
                  </ListItem>
                ))}
              </UnorderedList>
              Total: {deleteCount} stor{deleteCount === 1 ? 'y' : 'ies'}
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={onConfirmClose} isDisabled={deleting}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleConfirmDelete} isLoading={deleting}>
                Delete All
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      <AlertDialog
        isOpen={warningOpen}
        leastDestructiveRef={warningCancelRef}
        onClose={onWarningClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="xl" mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Cannot Delete Selected Stories
            </AlertDialogHeader>
            <AlertDialogBody>
              Cannot delete selected stories.
              <UnorderedList mt={3} spacing={2}>
                {deleteBlocked.map((item) => (
                  <ListItem key={item.storyId}>
                    <strong>{item.label}</strong> {item.reason}.
                  </ListItem>
                ))}
              </UnorderedList>
              <Text mt={3}>Please remove linked content first.</Text>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={warningCancelRef} onClick={onWarningClose}>
                OK
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
}

export default StoryPage;
