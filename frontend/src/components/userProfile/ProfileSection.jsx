import React from 'react';
import { Box, Heading, Text, useColorModeValue } from '@chakra-ui/react';

function ProfileSection({ title, description, children }) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');
  const subColor = useColorModeValue('gray.500', 'gray.400');
  const headingColor = useColorModeValue('navy.800', 'white');

  return (
    <Box
      bg={cardBg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="md"
      p={{ base: 4, md: 5 }}
    >
      <Heading size="sm" color={headingColor} letterSpacing="-0.02em" mb={description ? 1 : 3}>
        {title}
      </Heading>
      {description && (
        <Text fontSize="sm" color={subColor} mb={4}>
          {description}
        </Text>
      )}
      {children}
    </Box>
  );
}

export default ProfileSection;
