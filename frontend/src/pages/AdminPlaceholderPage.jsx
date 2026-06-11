import React from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

function AdminPlaceholderPage({ title, description }) {
  const headingColor = useColorModeValue('navy.800', 'white');
  const textColor = useColorModeValue('gray.600', 'gray.300');

  return (
    <Container maxW="container.md" py={16}>
      <Box
        textAlign="center"
        p={10}
        borderRadius="xl"
        bg={useColorModeValue('white', 'navy.800')}
        boxShadow="lg"
        borderWidth="1px"
        borderColor={useColorModeValue('gray.200', 'gold.600')}
      >
        <Heading size="lg" color={headingColor} mb={3}>
          {title}
        </Heading>
        <Text color={textColor} mb={8}>
          {description || 'This section is coming soon. Use the navigation bar to return to modules.'}
        </Text>
        <Button as={RouterLink} to="/" colorScheme="yellow" bg="gold.500" color="navy.900" _hover={{ bg: 'gold.400' }}>
          Back to Modules
        </Button>
      </Box>
    </Container>
  );
}

export default AdminPlaceholderPage;
