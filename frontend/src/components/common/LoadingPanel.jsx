import React from 'react';
import { Box, Spinner, Text, useColorModeValue } from '@chakra-ui/react';

function LoadingPanel({ message = 'Loading...', minH = '200px' }) {
  const subColor = useColorModeValue('gray.600', 'gray.400');
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
      minH={minH}
      mt={1}
    >
      <Spinner size="lg" color="gold.500" thickness="3px" />
      <Text mt={4} color={subColor} fontSize="sm">
        {message}
      </Text>
    </Box>
  );
}

export default React.memo(LoadingPanel);
