import React from 'react';
import { Container, Heading, Text, useColorModeValue } from '@chakra-ui/react';
import ModulePage from './ModulePage';

function CoachDashboard() {
  const subColor = useColorModeValue('gray.600', 'gray.400');

  return (
    <>
      <Container maxW="container.xl" pt={6} px={{ base: 4, md: 6 }}>
        <Heading size="md" color="navy.700" mb={1}>
          Coach Dashboard
        </Heading>
        <Text fontSize="sm" color={subColor} mb={2}>
          Manage classes, review modules, and support your students.
        </Text>
      </Container>
      <ModulePage />
    </>
  );
}

export default CoachDashboard;
