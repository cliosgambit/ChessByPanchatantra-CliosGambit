import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  VStack,
  Text,
  Button,
  useToast,
  useColorModeValue,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Checkbox,
  SimpleGrid,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Center,
} from '@chakra-ui/react';
import { useAuth } from '../AppContext';

function AccessControlPage() {
  const { user } = useAuth();
  const [accessControl, setAccessControl] = useState([]);
  const [modules, setModules] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [editingAccess, setEditingAccess] = useState({});
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const cardBg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');

  const fetchData = useCallback(async () => {
    try {
      const [accessRes, modulesRes, storiesRes] = await Promise.all([
        fetch('/api/access-control'),
        fetch('/api/modules'),
        fetch('/api/stories'),
      ]);

      const accessData = await accessRes.json();
      const modulesData = await modulesRes.json();
      const storiesData = await storiesRes.json();

      setAccessControl(accessData);
      setModules(modulesData);
      setStories(storiesData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch access control data',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditRole = (role) => {
    setSelectedRole(role);
    setEditingAccess({
      mod_access: role.mod_access || [],
      chap_access: role.chap_access || [],
      story_access: role.story_access || [],
    });
    onOpen();
  };

  const handleSaveAccess = async () => {
    try {
      const response = await fetch(`/api/access-control/${selectedRole.role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingAccess),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Access control updated successfully',
          status: 'success',
          duration: 3000,
        });
        fetchData();
        onClose();
      } else {
        throw new Error('Failed to update access control');
      }
    } catch (error) {
      console.error('Error updating access control:', error);
      toast({
        title: 'Error',
        description: 'Failed to update access control',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const toggleModuleAccess = (moduleId) => {
    setEditingAccess(prev => ({
      ...prev,
      mod_access: prev.mod_access.includes(moduleId)
        ? prev.mod_access.filter(id => id !== moduleId)
        : [...prev.mod_access, moduleId]
    }));
  };

  const toggleStoryAccess = (storyId) => {
    setEditingAccess(prev => ({
      ...prev,
      story_access: prev.story_access.includes(storyId)
        ? prev.story_access.filter(id => id !== storyId)
        : [...prev.story_access, storyId]
    }));
  };

  if (!user || user.role !== 'admin') {
    return (
      <Center h="100vh">
        <Text>Access denied. Admin privileges required.</Text>
      </Center>
    );
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Spinner size="xl" />
      </Center>
    );
  }

  return (
    <Box p={8} bg={bgColor} minH="100vh">
      <VStack spacing={8} align="stretch">
        <Heading textAlign="center" color={textColor}>
          Access Control Management
        </Heading>

        <Card bg={cardBg}>
          <CardHeader>
            <Heading size="md">Role Access Settings</Heading>
          </CardHeader>
          <CardBody>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Role</Th>
                  <Th>Modules Access</Th>
                  <Th>Chapters Access</Th>
                  <Th>Stories Access</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {accessControl.map((role) => (
                  <Tr key={role.role}>
                    <Td>
                      <Badge colorScheme="blue">{role.role}</Badge>
                    </Td>
                    <Td>
                      {role.mod_access ? (
                        <Text fontSize="sm">
                          {role.mod_access.length} modules
                        </Text>
                      ) : (
                        <Text fontSize="sm" color="gray.500">None</Text>
                      )}
                    </Td>
                    <Td>
                      {role.chap_access ? (
                        <Text fontSize="sm">
                          {role.chap_access.length} chapters
                        </Text>
                      ) : (
                        <Text fontSize="sm" color="gray.500">None</Text>
                      )}
                    </Td>
                    <Td>
                      {role.story_access ? (
                        <Text fontSize="sm">
                          {role.story_access.length} stories
                        </Text>
                      ) : (
                        <Text fontSize="sm" color="gray.500">None</Text>
                      )}
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        colorScheme="teal"
                        onClick={() => handleEditRole(role)}
                      >
                        Edit
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>

        {/* Edit Modal */}
        <Modal isOpen={isOpen} onClose={onClose} size="6xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              Edit Access Control for {selectedRole?.role}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={6} align="stretch">
                {/* Modules Access */}
                <Box>
                  <Heading size="md" mb={4}>Modules Access</Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                    {modules.map((module) => (
                      <Checkbox
                        key={module.module_id}
                        isChecked={editingAccess.mod_access?.includes(module.module_id)}
                        onChange={() => toggleModuleAccess(module.module_id)}
                      >
                        {module.module_name}
                      </Checkbox>
                    ))}
                  </SimpleGrid>
                </Box>

                {/* Stories Access */}
                <Box>
                  <Heading size="md" mb={4}>Stories Access</Heading>
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                    {stories.map((story) => (
                      <Checkbox
                        key={story.story_id}
                        isChecked={editingAccess.story_access?.includes(story.story_id)}
                        onChange={() => toggleStoryAccess(story.story_id)}
                      >
                        {story.title}
                      </Checkbox>
                    ))}
                  </SimpleGrid>
                </Box>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onClose}>
                Cancel
              </Button>
              <Button colorScheme="teal" onClick={handleSaveAccess}>
                Save Changes
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </VStack>
    </Box>
  );
}

export default AccessControlPage; 