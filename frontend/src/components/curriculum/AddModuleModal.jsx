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
import { PASTEL_THEMES } from './moduleThemes';
import ThemeColorSelect from './ThemeColorSelect';

const INITIAL_FORM = {
  moduleNumber: '',
  moduleTitle: '',
  backgroundColor: PASTEL_THEMES[0].key,
  status: 'active',
};

function AddModuleModal({ isOpen, onClose, onCreate, nextModuleNumber = 1 }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  useEffect(() => {
    if (isOpen) {
      setForm({
        ...INITIAL_FORM,
        moduleNumber: String(nextModuleNumber),
      });
    }
  }, [isOpen, nextModuleNumber]);

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
    const moduleNumber = Number(form.moduleNumber);
    if (!form.moduleTitle.trim() || !Number.isFinite(moduleNumber) || moduleNumber < 1) return;
    onCreate({
      module_number: moduleNumber,
      module_name: form.moduleTitle.trim(),
      themeKey: form.backgroundColor,
      status: form.status,
    });
    setForm(INITIAL_FORM);
    onClose();
  };

  const moduleNumberValid =
    form.moduleNumber !== '' &&
    Number.isFinite(Number(form.moduleNumber)) &&
    Number(form.moduleNumber) >= 1;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Create New Module
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Module Number
              </FormLabel>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 7"
                value={form.moduleNumber}
                onChange={handleChange('moduleNumber')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" fontWeight="600">
                Module Title
              </FormLabel>
              <Input
                placeholder="Enter module title"
                value={form.moduleTitle}
                onChange={handleChange('moduleTitle')}
                borderColor={borderColor}
                borderRadius="md"
              />
            </FormControl>

            <ThemeColorSelect
              value={form.backgroundColor}
              onChange={handleColorChange}
            />

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
            isDisabled={!form.moduleTitle.trim() || !moduleNumberValid}
          >
            Create Module
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default AddModuleModal;
