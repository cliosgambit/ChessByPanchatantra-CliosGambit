import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Grid,
  GridItem,
  Text,
  Button,
  Spinner,
  HStack,
  Flex,
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
import { FiChevronRight } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import ChapterCard from '../components/moduleDetails/ChapterCard';
import AddChapterModal from '../components/moduleDetails/AddChapterModal';
import EditChapterModal from '../components/moduleDetails/EditChapterModal';
import StickyAdminPageLayout from '../components/common/StickyAdminPageLayout';
import {
  fetchChaptersByModule,
  createChapter,
  updateChapter,
  deleteChapters,
  getChaptersDeletionStatus,
  subscribeToChapters,
  unsubscribeChannel,
} from '../services/curriculumService';

function formatChapterLabel(chapter) {
  const num =
    chapter?.chapter_number != null
      ? String(chapter.chapter_number).padStart(2, '0')
      : chapter?.chapter_id;
  return `Chapter ${num}`;
}

function toggleIdSelection(id, setIds) {
  setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
}

const MotionButton = motion(Button);

function formatModuleLabel(moduleId) {
  if (!moduleId) return '1';
  const digits = String(moduleId).replace(/\D/g, '');
  return digits || moduleId;
}

function ModuleDetails() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState([]);
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
  const [selectedEditChapterId, setSelectedEditChapterId] = useState(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState([]);
  const [deleteBlocked, setDeleteBlocked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [checking, setChecking] = useState(false);

  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const moduleLabel = formatModuleLabel(moduleId);

  const selectedChapter = chapters.find((c) => c.chapter_id === selectedEditChapterId);
  const selectedChapterIndex = chapters.findIndex((c) => c.chapter_id === selectedEditChapterId);

  const selectedChaptersForDelete = chapters.filter((c) =>
    selectedChapterIds.includes(c.chapter_id)
  );
  const deleteCount = selectedChapterIds.length;

  const fetchChapters = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await fetchChaptersByModule(moduleId);
      setChapters(rows);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load chapters from Supabase.');
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchChapters();
    const channel = subscribeToChapters(moduleId, { onRefetch: fetchChapters });
    return () => {
      if (channel) unsubscribeChannel(channel);
    };
  }, [moduleId, fetchChapters]);

  const exitSelectionMode = () => {
    setSelectionMode(null);
    setSelectedEditChapterId(null);
    setSelectedChapterIds([]);
    setDeleteBlocked([]);
  };

  const handleCreateChapter = async (payload) => {
    try {
      await createChapter({
        chapter_name: payload.chapter_name,
        module_id: moduleId,
        theme_key: payload.themeKey,
        status: payload.status,
      });
      toast({
        title: 'Chapter created',
        description: `"${payload.chapter_name}" saved to Supabase.`,
        status: 'success',
        duration: 2500,
      });
      fetchChapters();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const handleUpdateChapter = async (payload) => {
    setSaving(true);
    try {
      await updateChapter(payload.chapter_id, {
        chapter_name: payload.chapter_name,
        theme_key: payload.themeKey,
        status: payload.status,
      });
      toast({
        title: 'Chapter updated successfully',
        status: 'success',
        duration: 2500,
      });
      onEditClose();
      exitSelectionMode();
      fetchChapters();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleChapterClick = (chapter) => {
    if (selectionMode === 'edit') {
      setSelectedEditChapterId((prev) =>
        prev === chapter.chapter_id ? null : chapter.chapter_id
      );
      return;
    }
    if (selectionMode === 'delete') {
      toggleIdSelection(chapter.chapter_id, setSelectedChapterIds);
      return;
    }
    navigate(`/api/stories/${chapter.chapter_id}`);
  };

  const handleEditSelectedClick = () => {
    if (!selectedEditChapterId) return;
    onEditOpen();
  };

  const handleDeleteSelectedClick = async () => {
    if (!deleteCount || checking || isDeleting) return;
    setChecking(true);
    setDeleteBlocked([]);
    try {
      const status = await getChaptersDeletionStatus(selectedChapterIds);
      if (!status.canDeleteAll) {
        setDeleteBlocked(status.blocked);
        onWarningOpen();
      } else {
        onConfirmOpen();
      }
    } catch (err) {
      toast({
        title: 'Could not verify chapters',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCount || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteChapters(selectedChapterIds);
      const count = deleteCount;
      toast({
        title: `${count} chapter${count === 1 ? '' : 's'} deleted successfully`,
        status: 'success',
        duration: 2500,
      });
      onConfirmClose();
      exitSelectionMode();
      fetchChapters();
    } catch (err) {
      if (err.blocked?.length) {
        setDeleteBlocked(err.blocked);
        onConfirmClose();
        onWarningOpen();
      } else {
        toast({
          title: 'Failed to delete chapters',
          description: err.message,
          status: 'error',
          duration: 4000,
        });
      }
    } finally {
      setIsDeleting(false);
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
          isDisabled={!selectedEditChapterId}
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
          isDisabled={isDeleting || checking}
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
          isLoading={checking || isDeleting}
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
          + Add Chapter
        </MotionButton>
        <Button
          variant="outline"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('edit');
            setSelectedEditChapterId(null);
            setSelectedChapterIds([]);
          }}
          isDisabled={chapters.length === 0}
        >
          Edit Chapter
        </Button>
        <Button
          variant="outline"
          colorScheme="red"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('delete');
            setSelectedEditChapterId(null);
            setSelectedChapterIds([]);
          }}
          isDisabled={chapters.length === 0}
        >
          Delete Chapter
        </Button>
      </HStack>
    );

  const modeHint =
    selectionMode === 'edit'
      ? 'Edit mode — select one chapter to update'
      : selectionMode === 'delete'
        ? 'Delete mode — select one or more chapters to remove'
        : null;

  return (
    <>
      <StickyAdminPageLayout
        animated
        titleSize="md"
        breadcrumbs={
          <HStack spacing={2} fontSize="xs" color={breadcrumbColor} mb={1}>
            <Text fontWeight="600">Admin</Text>
            <Box as={FiChevronRight} />
            <Text
              fontWeight="600"
              cursor="pointer"
              _hover={{ color: 'gold.600' }}
              onClick={() => navigate('/curriculum')}
            >
              Curriculum
            </Text>
            <Box as={FiChevronRight} />
            <Text color="gold.600" fontWeight="600">
              Module {moduleLabel}
            </Text>
          </HStack>
        }
        title={`Chapters for Module ${moduleLabel}`}
        subtitle="Chapters from Supabase chapter table."
        headerExtra={
          modeHint ? (
            <Text mt={2} fontSize="sm" color="orange.600" fontWeight="600">
              {modeHint}
            </Text>
          ) : null
        }
        actions={actionButtons}
      >
        {loading ? (
          <Box py={16} textAlign="center">
            <Spinner size="xl" color="gold.500" />
          </Box>
        ) : error ? (
          <Box py={12} textAlign="center">
            <Text color="red.500">{error}</Text>
            <Button mt={4} size="sm" onClick={fetchChapters} colorScheme="yellow">
              Retry
            </Button>
          </Box>
        ) : chapters.length === 0 ? (
          <Box py={16} textAlign="center">
            <Text color={subColor}>No chapters yet.</Text>
          </Box>
        ) : (
          <Grid
            templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }}
            gap={6}
            pt={2}
          >
            {chapters.map((chapter, index) => (
              <GridItem key={chapter.chapter_id}>
                <ChapterCard
                  chapter={chapter}
                  index={index}
                  selectable={selectionMode === 'edit' || selectionMode === 'delete'}
                  selected={
                    selectionMode === 'edit'
                      ? selectedEditChapterId === chapter.chapter_id
                      : selectedChapterIds.includes(chapter.chapter_id)
                  }
                  onClick={() => handleChapterClick(chapter)}
                />
              </GridItem>
            ))}
          </Grid>
        )}
      </StickyAdminPageLayout>

      <AddChapterModal isOpen={isOpen} onClose={onClose} onCreate={handleCreateChapter} />

      <EditChapterModal
        isOpen={editOpen}
        onClose={onEditClose}
        onSave={handleUpdateChapter}
        chapter={selectedChapter}
        chapterIndex={selectedChapterIndex >= 0 ? selectedChapterIndex : 0}
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
              Delete Chapters
            </AlertDialogHeader>
            <AlertDialogBody>
              You are about to delete:
              <UnorderedList mt={3} mb={3} spacing={1}>
                {selectedChaptersForDelete.map((chapter) => (
                  <ListItem key={chapter.chapter_id}>
                    • {formatChapterLabel(chapter)}
                    {chapter.chapter_name ? ` — ${chapter.chapter_name}` : ''}
                  </ListItem>
                ))}
              </UnorderedList>
              Total: {deleteCount} chapter{deleteCount === 1 ? '' : 's'}
              <br />
              <br />
              This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={onConfirmClose} isDisabled={isDeleting}>
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={handleConfirmDelete}
                isLoading={isDeleting}
              >
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
              Cannot Delete Selected Chapters
            </AlertDialogHeader>
            <AlertDialogBody>
              Cannot delete selected chapters.
              <UnorderedList mt={3} spacing={2}>
                {deleteBlocked.map((item) => (
                  <ListItem key={item.chapterId}>
                    <strong>{item.label}</strong> {item.reason}.
                  </ListItem>
                ))}
              </UnorderedList>
              <Text mt={3}>Please delete or move the associated content first.</Text>
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

export default ModuleDetails;
