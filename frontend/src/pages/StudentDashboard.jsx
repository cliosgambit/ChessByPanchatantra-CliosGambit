import React from 'react';
import { Container, Heading, Text, useColorModeValue } from '@chakra-ui/react';
import ModulePage from './ModulePage';

function StudentDashboard() {
  const subColor = useColorModeValue('gray.600', 'gray.400');

  return (
    <>
      <Container maxW="container.xl" pt={6} px={{ base: 4, md: 6 }}>
        <Heading size="md" color="navy.700" mb={1}>
          Student Dashboard
        </Heading>
        <Text fontSize="sm" color={subColor} mb={2}>
          Continue your modules and stories below.
        </Text>
      </Container>
      <ModulePage />
    </>
  );
}

export default StudentDashboard;
