import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Flex,
  Grid,
  GridItem,
  Text,
  Button,
  Spinner,
  HStack,
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
import { useNavigate } from 'react-router-dom';
import ModuleCard from '../components/curriculum/ModuleCard';
import AddModuleModal from '../components/curriculum/AddModuleModal';
import EditModuleModal from '../components/curriculum/EditModuleModal';
import ErrorPanel from '../components/common/ErrorPanel';
import StickyAdminPageLayout from '../components/common/StickyAdminPageLayout';
import { useCurriculum } from '../hooks/useCurriculum';
import {
  createModule,
  deleteModules,
  updateModule,
  getModulesDeletionStatus,
  getNextModuleNumber,
} from '../services/curriculumService';

function formatModuleLabel(module) {
  if (module?.module_number != null) {
    return `Module ${String(module.module_number).padStart(2, '0')}`;
  }
  return module?.module_name || module?.module_id || 'Module';
}

function toggleIdSelection(id, setIds) {
  setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
}

const MotionButton = motion(Button);

function Curriculum() {
  const { modules, loading, error, refetch } = useCurriculum();
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
  const navigate = useNavigate();
  const toast = useToast();
  const cancelRef = useRef();
  const warningCancelRef = useRef();

  const [selectionMode, setSelectionMode] = useState(null);
  const [selectedEditModuleId, setSelectedEditModuleId] = useState(null);
  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [deleteBlocked, setDeleteBlocked] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [nextModuleNumber, setNextModuleNumber] = useState(1);

  const breadcrumbColor = useColorModeValue('gray.500', 'gray.400');

  const selectedModule = modules.find((m) => m.module_id === selectedEditModuleId);
  const selectedModuleIndex = modules.findIndex((m) => m.module_id === selectedEditModuleId);
  const selectedModulesForDelete = modules.filter((m) =>
    selectedModuleIds.includes(m.module_id)
  );
  const deleteCount = selectedModuleIds.length;

  const exitSelectionMode = () => {
    setSelectionMode(null);
    setSelectedEditModuleId(null);
    setSelectedModuleIds([]);
    setDeleteBlocked([]);
  };

  const handleOpenAddModal = async () => {
    try {
      const next = await getNextModuleNumber();
      setNextModuleNumber(next);
    } catch {
      setNextModuleNumber(modules.length + 1);
    }
    onOpen();
  };

  const handleCreateModule = async (payload) => {
    try {
      const moduleNumber = Number(payload.module_number);
      await createModule({
        module_id: `MOD${moduleNumber}`,
        module_name: payload.module_name,
        module_number: moduleNumber,
        theme_key: payload.themeKey,
        status: payload.status,
      });
      toast({
        title: 'Module created',
        description: `"${payload.module_name}" saved to Supabase.`,
        status: 'success',
        duration: 2500,
      });
      refetch();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    }
  };

  const handleUpdateModule = async (payload) => {
    setSaving(true);
    try {
      await updateModule(payload.module_id, {
        module_name: payload.module_name,
        module_number: payload.module_number,
        theme_key: payload.themeKey,
        status: payload.status,
      });
      toast({
        title: 'Module updated successfully',
        description: `"${payload.module_name}" saved.`,
        status: 'success',
        duration: 2500,
      });
      onEditClose();
      exitSelectionMode();
      refetch();
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleModuleClick = (module) => {
    if (selectionMode === 'edit') {
      setSelectedEditModuleId((prev) =>
        prev === module.module_id ? null : module.module_id
      );
      return;
    }
    if (selectionMode === 'delete') {
      toggleIdSelection(module.module_id, setSelectedModuleIds);
      return;
    }
    navigate(`/api/module/${module.module_id}`);
  };

  const handleEditSelectedClick = () => {
    if (!selectedEditModuleId) return;
    onEditOpen();
  };

  const handleDeleteSelectedClick = async () => {
    if (!deleteCount || checking || deleting) return;
    setChecking(true);
    setDeleteBlocked([]);
    try {
      const status = await getModulesDeletionStatus(selectedModuleIds);
      if (!status.canDeleteAll) {
        setDeleteBlocked(status.blocked);
        onWarningOpen();
      } else {
        onConfirmOpen();
      }
    } catch (err) {
      toast({
        title: 'Could not verify modules',
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
      await deleteModules(selectedModuleIds);
      const count = deleteCount;
      toast({
        title: `${count} module${count === 1 ? '' : 's'} deleted successfully`,
        status: 'success',
        duration: 2500,
      });
      onConfirmClose();
      exitSelectionMode();
      refetch();
    } catch (err) {
      if (err.blocked?.length) {
        setDeleteBlocked(err.blocked);
        onConfirmClose();
        onWarningOpen();
      } else {
        toast({
          title: 'Failed to delete modules',
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
          isDisabled={!selectedEditModuleId}
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
          bg="gold.500"
          color="navy.900"
          _hover={{ bg: 'gold.400' }}
          borderRadius="full"
          fontWeight="700"
          size="sm"
          onClick={handleOpenAddModal}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          + Add Module
        </MotionButton>
        <Button
          variant="outline"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('edit');
            setSelectedEditModuleId(null);
            setSelectedModuleIds([]);
          }}
          isDisabled={modules.length === 0}
        >
          Edit Module
        </Button>
        <Button
          variant="outline"
          colorScheme="red"
          borderRadius="full"
          size="sm"
          fontWeight="700"
          onClick={() => {
            setSelectionMode('delete');
            setSelectedEditModuleId(null);
            setSelectedModuleIds([]);
          }}
          isDisabled={modules.length === 0}
        >
          Delete Module
        </Button>
      </HStack>
    );

  const modeHint =
    selectionMode === 'edit'
      ? 'Edit mode — select one module to update'
      : selectionMode === 'delete'
        ? 'Delete mode — select one or more modules to remove'
        : null;

  return (
    <>
      <StickyAdminPageLayout
        breadcrumbs={
          <HStack spacing={2} fontSize="sm" color={breadcrumbColor} mb={2}>
            <Text fontWeight="600">Admin</Text>
            <FiChevronRight />
            <Text color="gold.600" fontWeight="600">
              Curriculum
            </Text>
          </HStack>
        }
        title="Curriculum"
        subtitle="Modules from Supabase — realtime synced."
        headerExtra={
          modeHint ? (
            <Text mt={2} fontSize="sm" color="orange.600" fontWeight="600">
              {modeHint}
            </Text>
          ) : null
        }
        actions={actionButtons}
      >
        {loading && (
          <Flex justify="center" py={20}>
            <Spinner size="lg" color="gold.500" />
          </Flex>
        )}

        {error && <ErrorPanel title="Failed to load modules" message={error} onRetry={refetch} />}

        {!loading && !error && (
          <Grid
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }}
            gap={6}
            pt={2}
          >
            {modules.map((module, index) => (
              <GridItem key={module.module_id}>
                <ModuleCard
                  module={module}
                  index={index}
                  selectable={selectionMode === 'edit' || selectionMode === 'delete'}
                  selected={
                    selectionMode === 'edit'
                      ? selectedEditModuleId === module.module_id
                      : selectedModuleIds.includes(module.module_id)
                  }
                  onClick={() => handleModuleClick(module)}
                />
              </GridItem>
            ))}
          </Grid>
        )}
      </StickyAdminPageLayout>

      <AddModuleModal
        isOpen={isOpen}
        onClose={onClose}
        onCreate={handleCreateModule}
        nextModuleNumber={nextModuleNumber}
      />

      <EditModuleModal
        isOpen={editOpen}
        onClose={onEditClose}
        onSave={handleUpdateModule}
        module={selectedModule}
        moduleIndex={selectedModuleIndex >= 0 ? selectedModuleIndex : 0}
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
              Delete Modules
            </AlertDialogHeader>
            <AlertDialogBody>
              You are about to delete:
              <UnorderedList mt={3} mb={3} spacing={1}>
                {selectedModulesForDelete.map((mod) => (
                  <ListItem key={mod.module_id}>
                    • {formatModuleLabel(mod)}
                    {mod.module_name ? ` — ${mod.module_name}` : ''}
                  </ListItem>
                ))}
              </UnorderedList>
              Total: {deleteCount} module{deleteCount === 1 ? '' : 's'}
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
              Cannot Delete Selected Modules
            </AlertDialogHeader>
            <AlertDialogBody>
              Cannot delete selected modules.
              <UnorderedList mt={3} spacing={2}>
                {deleteBlocked.map((item) => (
                  <ListItem key={item.moduleId}>
                    <strong>{item.label}</strong> {item.reason}.
                  </ListItem>
                ))}
              </UnorderedList>
              <Text mt={3}>Please remove associated content first.</Text>
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

export default Curriculum;
