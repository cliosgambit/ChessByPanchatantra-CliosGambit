import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';

function EmptyState({ title, subtitle }) {
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const hintColor = useColorModeValue('gray.500', 'gray.400');
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');

  return (
    <Box
      bg={cardBg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="md"
      py={16}
      textAlign="center"
      mt={1}
    >
      <Text color={subColor} fontSize="sm">
        {title}
      </Text>
      {subtitle && (
        <Text mt={1} color={hintColor} fontSize="xs">
          {subtitle}
        </Text>
      )}
    </Box>
  );
}

export default React.memo(EmptyState);
