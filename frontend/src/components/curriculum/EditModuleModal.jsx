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
import { PASTEL_THEMES, getThemeForIndex } from './moduleThemes';
import ThemeColorSelect from './ThemeColorSelect';

function resolveThemeKey(module, index = 0) {
  if (module?.themeKey) return module.themeKey;
  const legacyIndex =
    module?.module_number != null ? Number(module.module_number) - 1 : index;
  return getThemeForIndex(legacyIndex).themeKey;
}

function EditModuleModal({ isOpen, onClose, onSave, module, moduleIndex = 0, saving = false }) {
  const [form, setForm] = useState({
    moduleNumber: '',
    moduleTitle: '',
    backgroundColor: PASTEL_THEMES[0].key,
    status: 'active',
  });
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');

  useEffect(() => {
    if (isOpen && module) {
      setForm({
        moduleNumber: String(module.module_number ?? ''),
        moduleTitle: module.module_name || '',
        backgroundColor: resolveThemeKey(module, moduleIndex),
        status: module.status === 'draft' ? 'draft' : 'active',
      });
    }
  }, [isOpen, module, moduleIndex]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleColorChange = (themeKey) => {
    setForm((prev) => ({ ...prev, backgroundColor: themeKey }));
  };

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = () => {
    const moduleNumber = Number(form.moduleNumber);
    if (!form.moduleTitle.trim() || !Number.isFinite(moduleNumber) || moduleNumber < 1) return;
    if (!form.status) return;
    onSave({
      module_id: module.module_id,
      module_number: moduleNumber,
      module_name: form.moduleTitle.trim(),
      themeKey: form.backgroundColor,
      status: form.status,
    });
  };

  const moduleNumberValid =
    form.moduleNumber !== '' &&
    Number.isFinite(Number(form.moduleNumber)) &&
    Number(form.moduleNumber) >= 1;

  const formValid = form.moduleTitle.trim() && moduleNumberValid && form.status;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered motionPreset="slideInBottom">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader color="navy.800" fontSize="lg" pb={2}>
          Edit Module
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
          <Button variant="outline" onClick={handleClose} borderRadius="lg" isDisabled={saving}>
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

export default EditModuleModal;
