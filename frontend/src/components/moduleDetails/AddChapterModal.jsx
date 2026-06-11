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
import { LEGACY_THEMES } from '../curriculum/moduleThemes';
import ThemeColorSelect from '../curriculum/ThemeColorSelect';

const INITIAL_FORM = {
  chapterTitle: '',
  backgroundColor: LEGACY_THEMES[0].key,
  status: 'draft',
};

function AddChapterModal({ isOpen, onClose, onCreate }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
    }
  }, [isOpen]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleColorChange = (themeKey) => {
    setForm((prev) => ({ ...prev, backgroundColor: themeKey }));
  };

  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = () => {
    if (!form.chapterTitle.trim()) return;
    onCreate({
      chapter_name: form.chapterTitle.trim(),
      themeKey: form.backgroundColor,
      status: form.status,
    });
    setForm(INITIAL_FORM);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Create New Chapter
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
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
          <Button variant="outline" onClick={handleClose} borderRadius="lg">
            Cancel
          </Button>
          <Button
            bg="navy.700"
            color="white"
            _hover={{ bg: 'navy.600' }}
            borderRadius="lg"
            fontWeight="700"
            onClick={handleSubmit}
            isDisabled={!form.chapterTitle.trim()}
          >
            Create Chapter
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddChapterModal;
