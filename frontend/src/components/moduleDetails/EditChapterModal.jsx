import React, { useEffect, useState } from 'react';
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
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { LEGACY_THEMES, getThemeForIndex } from '../curriculum/moduleThemes';
import ThemeColorSelect from '../curriculum/ThemeColorSelect';

function resolveThemeKey(chapter, index = 0) {
  if (chapter?.themeKey) return chapter.themeKey;
  const legacyIndex =
    chapter?.chapter_number != null ? Number(chapter.chapter_number) - 1 : index;
  return getThemeForIndex(legacyIndex).themeKey;
}

function EditChapterModal({ isOpen, onClose, onSave, chapter, chapterIndex = 0, saving = false }) {
  const [form, setForm] = useState({
    chapterTitle: '',
    backgroundColor: LEGACY_THEMES[0].key,
    status: 'draft',
  });
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');
  const readOnlyBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const displayNumber =
    chapter?.chapter_number != null
      ? String(chapter.chapter_number).padStart(2, '0')
      : '—';

  useEffect(() => {
    if (isOpen && chapter) {
      setForm({
        chapterTitle: chapter.chapter_name || '',
        backgroundColor: resolveThemeKey(chapter, chapterIndex),
        status: chapter.status === 'active' ? 'active' : 'draft',
      });
    }
  }, [isOpen, chapter, chapterIndex]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleColorChange = (themeKey) => {
    setForm((prev) => ({ ...prev, backgroundColor: themeKey }));
  };

  const handleSubmit = () => {
    if (!form.chapterTitle.trim() || !form.status) return;
    onSave({
      chapter_id: chapter.chapter_id,
      chapter_name: form.chapterTitle.trim(),
      themeKey: form.backgroundColor,
      status: form.status,
    });
  };

  const formValid = form.chapterTitle.trim() && form.status;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Edit Chapter
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Chapter Number
              </FormLabel>
              <Input
                value={displayNumber}
                isReadOnly
                bg={readOnlyBg}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Chapter Title
              </FormLabel>
              <Input
                placeholder="Enter chapter title"
                value={form.chapterTitle}
                onChange={handleChange('chapterTitle')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>

            <ThemeColorSelect
              value={form.backgroundColor}
              onChange={handleColorChange}
            />

            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Status
              </FormLabel>
              <Select
                value={form.status}
                onChange={handleChange('status')}
                borderColor={borderColor}
                borderRadius="md"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="outline" onClick={onClose} borderRadius="lg" isDisabled={saving}>
            Cancel
          </Button>
          <Button
            bg="navy.700"
            color="white"
            _hover={{ bg: 'navy.600' }}
            borderRadius="lg"
            fontWeight="700"
            onClick={handleSubmit}
            isDisabled={!formValid}
            isLoading={saving}
          >
            Save Changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default EditChapterModal;
