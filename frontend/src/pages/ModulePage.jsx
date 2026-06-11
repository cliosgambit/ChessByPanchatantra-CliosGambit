
import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Spinner,
  Container,
  useColorModeValue,
  VStack,
  Badge,
  IconButton,
  useToast,
  ButtonGroup,
  Button,
  Tooltip,
} from '@chakra-ui/react';
import { LockIcon, UnlockIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRoleModuleAccess } from '../hooks/useRoleModuleAccess';

const ADMIN_EDITABLE_ROLES = ['student', 'guest'];

// Chessboard Themes
const boardThemes = [
  {
    lightMode: { lightSq: '#ebecd0', darkSq: '#779556', text: 'gray.800' },
    darkMode: { lightSq: '#B5CAA3', darkSq: '#779556', text: 'whiteAlpha.900' },
  },
  {
    lightMode: { lightSq: '#f0d9b5', darkSq: '#b58863', text: 'gray.800' },
    darkMode: { lightSq: '#D8C6A8', darkSq: '#8B6950', text: 'whiteAlpha.900' },
  },
  {
    lightMode: { lightSq: '#dee3e6', darkSq: '#8ca2ad', text: 'gray.800' },
    darkMode: { lightSq: '#A0B0B8', darkSq: '#647E8A', text: 'whiteAlpha.900' },
  },
  {
    lightMode: { lightSq: '#e6e6fa', darkSq: '#9370db', text: 'gray.800' },
    darkMode: { lightSq: '#B8A8E0', darkSq: '#6A4CAF', text: 'whiteAlpha.900' },
  },
  {
    lightMode: { lightSq: '#ffebcd', darkSq: '#ff7f50', text: 'gray.800' },
    darkMode: { lightSq: '#FFCBAA', darkSq: '#D96C44', text: 'whiteAlpha.900' },
  },
];

function ModulePage({ embedded = false, title = 'Modules' }) {
  const { user } = useAuth();
  const [adminEditRole, setAdminEditRole] = useState('student');
  // Use the selected role for admin, or 'student' for students
  const isAdmin = user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const isGuest = !user;
  const isCoach = user?.role === 'coach';

  const roleToEdit = isAdmin ? adminEditRole : isStudent ? 'student' : 'guest';
  const { modAccess, updateModAccess, loading: roleAccessLoading } = useRoleModuleAccess(roleToEdit);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const colorMode = useColorModeValue('light', 'dark');
  const pageTextColor = useColorModeValue('gray.700', 'gray.200');

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const response = await axios.get('/api/modules');
        setModules(response.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch modules');
      } finally {
        setLoading(false);
      }
    };
    fetchModules();
  }, []);

  // Admin context menu handler
  const handleRoleModuleToggle = async (moduleId, isUnlocked) => {
    let newAccess;
    if (isUnlocked) {
      newAccess = modAccess.filter((id) => id !== moduleId);
    } else {
      newAccess = [...modAccess, moduleId];
    }
    await updateModAccess(newAccess);
    toast({
      title: 'Success',
      description: `Module ${isUnlocked ? 'locked' : 'unlocked'} for ${roleToEdit}`,
      status: 'success',
      duration: 2000,
    });
  };

  if (loading || roleAccessLoading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" />
        <Text mt={4}>Loading modules...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={8} textAlign="center" color="red.500">
        <Heading size="md" mb={4}>Error</Heading>
        <Text>{error}</Text>
      </Box>
    );
  }

  return (
    <Container maxW="100%" w="100%" py={embedded ? 4 : 10} px={{ base: 4, md: 8, xl: 10 }} pt={embedded ? 3 : undefined}>
      {!embedded && (
        <Heading textAlign="center" size="2xl" color={pageTextColor} mb={8}>
          {title}
        </Heading>
      )}
      {!embedded && isAdmin && (
        <Box
          w="100%"
          maxW={{ base: '100%', md: 'lg' }}
          mx="auto"
          mb={8}
          p={4}
          borderRadius="lg"
          bg={colorMode === 'light' ? 'gray.50' : 'gray.700'}
          borderColor="teal.300"
          borderWidth={1}
          boxShadow="md"
        >
          <VStack spacing={2} align="stretch">
            <Badge colorScheme="green" fontSize={{ base: 'sm', md: 'md' }} p={2} alignSelf="flex-start">
              Admin Access - All modules unlocked
            </Badge>
            <ButtonGroup mt={2} flexDirection={{ base: 'column', sm: 'row' }} w="100%">
              {ADMIN_EDITABLE_ROLES.map((role) => (
                <Button
                  key={role}
                  colorScheme={adminEditRole === role ? 'teal' : 'gray'}
                  variant={adminEditRole === role ? 'solid' : 'outline'}
                  onClick={() => setAdminEditRole(role)}
                  w={{ base: '100%', sm: 'auto' }}
                  mb={{ base: 2, sm: 0 }}
                >
                  Edit {role.charAt(0).toUpperCase() + role.slice(1)} Access
                </Button>
              ))}
            </ButtonGroup>
            <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500" mt={1}>
              Editing access for: <b>{adminEditRole}</b>
            </Text>
          </VStack>
        </Box>
      )}
      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={embedded ? 6 : 8}>
        {modules.map((module, index) => {
          const theme = boardThemes[index % boardThemes.length];
          const lightColor = colorMode === 'light' ? theme.lightMode.lightSq : theme.darkMode.lightSq;
          const darkColor = colorMode === 'light' ? theme.lightMode.darkSq : theme.darkMode.darkSq;
          const textColor = colorMode === 'light' ? theme.lightMode.text : theme.darkMode.text;

          // Only check modAccess for the selected role when admin is editing
          const isUnlockedForRole = modAccess.includes(String(module.module_id));

          return (
            <Box
              key={module.module_id}
              bgGradient={`linear(to-br, ${lightColor}, ${darkColor})`}
              borderRadius="lg"
              boxShadow="md"
              height="250"
              p={{ base: 3, md: 5 }}
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              textAlign="center"
              fontWeight="bold"
              fontSize="xl"
              cursor={isAdmin || isCoach || (isStudent && isUnlockedForRole) || (isGuest && isUnlockedForRole) ? 'pointer' : 'not-allowed'}
              transition="all 0.3s ease"
              color={textColor}
              opacity={isAdmin || isCoach || isUnlockedForRole ? 1 : 0.6}
              position="relative"
              _hover={
                isAdmin || isCoach || (isStudent && isUnlockedForRole) || (isGuest && isUnlockedForRole)
                  ? { transform: 'scale(1.05)', boxShadow: 'xl' }
                  : {}
              }
              onClick={() => (isAdmin || isCoach || (isStudent && isUnlockedForRole) || (isGuest && isUnlockedForRole)) && navigate(`/api/module/${module.module_id}`)}
            >
              {/* Admin Lock/Unlock Button */}
              {isAdmin && (
                <Tooltip label={isUnlockedForRole ? `Lock for ${adminEditRole}` : `Unlock for ${adminEditRole}`} placement="top" hasArrow>
                  <IconButton
                    icon={isUnlockedForRole ? <UnlockIcon color="green.500" boxSize={{ base: 7, md: 5 }} /> : <LockIcon color="red.500" boxSize={{ base: 7, md: 5 }} />}
                    variant="solid"
                    bg={isUnlockedForRole ? 'white' : 'white'}
                    border={isUnlockedForRole ? '1px solid #38A169' : '1px solid #E53E3E'}
                    _hover={{ bg: isUnlockedForRole ? 'white' : 'white' }}
                    size={{ base: 'lg', md: 'sm' }}
                    position="absolute"
                    top={2}
                    right={2}
                    zIndex={2}
                    aria-label={isUnlockedForRole ? `Lock for ${adminEditRole}` : `Unlock for ${adminEditRole}`}
                    isDisabled={roleAccessLoading}
                    onClick={e => {
                      e.stopPropagation();
                      handleRoleModuleToggle(module.module_id, isUnlockedForRole);
                    }}
                  />
                </Tooltip>
              )}
              <Heading size="lg" mb={3}>
                0{index + 1}
              </Heading>
              <Text fontSize="lg">{module.module_name}</Text>
              {isStudent && !isUnlockedForRole && (
                <Badge colorScheme="red" mt={2}>
                  Locked
                </Badge>
              )}
              {isAdmin && !isUnlockedForRole && (
                <Badge colorScheme="red" mt={2}>
                  {embedded ? 'Locked' : `Locked for ${adminEditRole.charAt(0).toUpperCase() + adminEditRole.slice(1)}`}
                </Badge>
              )}
              {isGuest && !isUnlockedForRole && (
                <Badge colorScheme="red" mt={2}>
                  Locked
                </Badge>
              )}
            </Box>
          );
        })}
      </SimpleGrid>
    </Container>
  );
}

export default ModulePage;
