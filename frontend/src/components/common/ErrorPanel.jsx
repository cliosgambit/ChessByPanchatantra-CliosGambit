import React from 'react';
import { Box, Button, Text, useColorModeValue } from '@chakra-ui/react';

function ErrorPanel({ title = 'Something went wrong', message, onRetry }) {
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const cardBg = useColorModeValue('white', 'navy.800');

  return (
    <Box
      bg={cardBg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor="red.200"
      boxShadow="md"
      py={12}
      px={6}
      textAlign="center"
      mt={1}
    >
      <Text color="red.600" fontSize="sm" fontWeight="600">
        {title}
      </Text>
      {message && (
        <Text mt={2} color={subColor} fontSize="sm" maxW="md" mx="auto">
          {message}
        </Text>
      )}
      {onRetry && (
        <Button mt={4} size="sm" colorScheme="yellow" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}

export default React.memo(ErrorPanel);
