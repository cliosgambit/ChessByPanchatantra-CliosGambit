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
  Textarea,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';

function normalizeStatus(status) {
  return status === 'draft' ? 'draft' : 'active';
}

function EditStoryModal({ isOpen, onClose, onSave, story, saving = false }) {
  const [form, setForm] = useState({
    storyNumber: '',
    storyTitle: '',
    storyDescription: '',
    status: 'active',
    tags: '',
  });
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');
  const readOnlyBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  useEffect(() => {
    if (isOpen && story) {
      let tagsDisplay = '';
      if (story.tags) {
        try {
          const parsed = JSON.parse(story.tags);
          tagsDisplay = Array.isArray(parsed) ? parsed.join(', ') : String(story.tags);
        } catch {
          tagsDisplay = String(story.tags);
        }
      }
      setForm({
        storyNumber:
          story.story_number != null ? String(story.story_number) : '',
        storyTitle: story.title || '',
        storyDescription: story.description || '',
        status: normalizeStatus(story.status),
        tags: tagsDisplay,
      });
    }
  }, [isOpen, story]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = () => {
    if (!form.storyTitle.trim() || !form.status) return;

    let tags = '[]';
    if (form.tags.trim()) {
      const tagList = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      tags = JSON.stringify(tagList);
    }

    onSave({
      story_id: story.story_id,
      title: form.storyTitle.trim(),
      description: form.storyDescription.trim(),
      status: form.status,
      tags,
    });
  };

  const formValid = form.storyTitle.trim() && form.status;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Edit Story
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Story Number
              </FormLabel>
              <Input
                value={form.storyNumber}
                isReadOnly
                bg={readOnlyBg}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Story ID
              </FormLabel>
              <Input
                value={story?.story_id || ''}
                isReadOnly
                bg={readOnlyBg}
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
                Story Subtitle / Description
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
            <FormControl>
              <FormLabel fontSize="sm" fontWeight="600">
                Tags
              </FormLabel>
              <Input
                placeholder="comma-separated tags"
                value={form.tags}
                onChange={handleChange('tags')}
                borderColor={borderColor}
                borderRadius="md"
              />
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

export default EditStoryModal;
