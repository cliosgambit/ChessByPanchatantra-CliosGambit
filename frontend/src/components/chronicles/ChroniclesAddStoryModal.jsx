import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { BOARD_THEMES } from '../curriculum/moduleThemes';
import { fetchChaptersByModule, fetchModules, formatChapterNumberLabel, formatModuleNumberLabel } from '../../services/curriculumService';

const STORY_TYPES = [
  { value: 'narrative', label: 'Narrative' },
  { value: 'interactive', label: 'Interactive' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'lesson', label: 'Lesson' },
  { value: 'practice', label: 'Practice' },
];

const INITIAL_FORM = {
  moduleId: '',
  chapterId: '',
  storyNumber: '',
  storyTitle: '',
  storyDescription: '',
  storyType: 'narrative',
  thumbnailUrl: '',
  backgroundColor: BOARD_THEMES[0].key,
  status: 'active',
};

function ChroniclesAddStoryModal({ isOpen, onClose, onCreate, saving = false }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [modules, setModules] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setChapters([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchModules()
      .then(setModules)
      .catch(() => setModules([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !form.moduleId) {
      setChapters([]);
      return;
    }

    let cancelled = false;
    setLoadingChapters(true);
    fetchChaptersByModule(form.moduleId)
      .then((rows) => {
        if (!cancelled) setChapters(rows);
      })
      .catch(() => {
        if (!cancelled) setChapters([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.moduleId, isOpen]);

  const moduleOptions = useMemo(
    () =>
      modules.map((module) => ({
        value: module.module_id,
        label: formatModuleNumberLabel(module, module.module_id),
      })),
    [modules]
  );

  const chapterOptions = useMemo(
    () =>
      chapters.map((chapter) => ({
        value: chapter.chapter_id,
        label: formatChapterNumberLabel(chapter, chapter.chapter_id),
      })),
    [chapters]
  );

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => {
      if (field === 'moduleId') {
        return { ...prev, moduleId: value, chapterId: '' };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const canSubmit =
    form.storyTitle.trim() && form.moduleId && form.chapterId && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onCreate({
      chapter_id: form.chapterId,
      module_id: form.moduleId,
      story_number: form.storyNumber ? Number(form.storyNumber) : undefined,
      title: form.storyTitle.trim(),
      description: form.storyDescription.trim(),
      story_type: form.storyType,
      thumbnail_url: form.thumbnailUrl.trim(),
      themeKey: form.backgroundColor,
      status: form.status,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Add Story
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Module
              </FormLabel>
              <Select
                placeholder="Select module"
                value={form.moduleId}
                onChange={handleChange('moduleId')}
                borderColor={borderColor}
                borderRadius="md"
              >
                {moduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Chapter
              </FormLabel>
              <Select
                placeholder={loadingChapters ? 'Loading chapters…' : 'Select chapter'}
                value={form.chapterId}
                onChange={handleChange('chapterId')}
                borderColor={borderColor}
                borderRadius="md"
                isDisabled={!form.moduleId || loadingChapters}
              >
                {chapterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Story Number
              </FormLabel>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 1"
                value={form.storyNumber}
                onChange={handleChange('storyNumber')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Story Title
              </FormLabel>
              <Input
                placeholder="Enter story title"
                value={form.storyTitle}
                onChange={handleChange('storyTitle')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Story Description
              </FormLabel>
              <Textarea
                placeholder="Brief description of this story"
                value={form.storyDescription}
                onChange={handleChange('storyDescription')}
                borderColor={borderColor}
                borderRadius="md"
                rows={3}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Story Type
              </FormLabel>
              <Select
                value={form.storyType}
                onChange={handleChange('storyType')}
                borderColor={borderColor}
                borderRadius="md"
              >
                {STORY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Thumbnail / Image URL
              </FormLabel>
              <Input
                placeholder="https://example.com/image.jpg"
                value={form.thumbnailUrl}
                onChange={handleChange('thumbnailUrl')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Background Color
              </FormLabel>
              <Select
                value={form.backgroundColor}
                onChange={handleChange('backgroundColor')}
                borderColor={borderColor}
                borderRadius="md"
              >
                {BOARD_THEMES.map((theme) => (
                  <option key={theme.key} value={theme.key}>
                    {theme.label}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Status
              </FormLabel>
              <Select
                value={form.status}
                onChange={handleChange('status')}
                borderColor={borderColor}
                borderRadius="md"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" onClick={handleClose} borderRadius="lg" isDisabled={saving}>
            Cancel
          </Button>
          <Button
            bg="#ea580c"
            color="white"
            _hover={{ bg: '#c2410c' }}
            borderRadius="lg"
            fontWeight="700"
            onClick={handleSubmit}
            isDisabled={!canSubmit}
            isLoading={saving}
          >
            Add Story
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default ChroniclesAddStoryModal;
