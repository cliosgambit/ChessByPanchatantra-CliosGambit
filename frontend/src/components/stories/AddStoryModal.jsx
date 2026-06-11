import React, { useState } from 'react';
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

const STORY_TYPES = [
  { value: 'narrative', label: 'Narrative' },
  { value: 'interactive', label: 'Interactive' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'lesson', label: 'Lesson' },
  { value: 'practice', label: 'Practice' },
];

const INITIAL_FORM = {
  storyNumber: '',
  storyTitle: '',
  storyDescription: '',
  storyType: 'narrative',
  thumbnailUrl: '',
  backgroundColor: BOARD_THEMES[0].key,
  status: 'active',
};

function AddStoryModal({ isOpen, onClose, onCreate }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = () => {
    if (!form.storyTitle.trim()) return;
    onCreate({
      story_number: form.storyNumber ? Number(form.storyNumber) : undefined,
      title: form.storyTitle.trim(),
      description: form.storyDescription.trim(),
      story_type: form.storyType,
      thumbnail_url: form.thumbnailUrl.trim(),
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
          Create New Story
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
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
            isDisabled={!form.storyTitle.trim()}
          >
            Create Story
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddStoryModal;
