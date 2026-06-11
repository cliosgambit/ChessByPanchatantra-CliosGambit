import React from 'react';
import { Box, Flex, Progress, Text, useColorModeValue } from '@chakra-ui/react';

function ProgressRow({ label, completed, total }) {
  const labelColor = useColorModeValue('gray.600', 'gray.300');
  const valueColor = useColorModeValue('navy.800', 'white');
  const safeTotal = total || 0;
  const safeCompleted = completed || 0;
  const percent = safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : 0;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={2} gap={3}>
        <Text fontSize="sm" fontWeight="600" color={labelColor}>
          {label}
        </Text>
        <Text fontSize="sm" fontWeight="700" color={valueColor}>
          {safeCompleted} / {safeTotal || '—'}
        </Text>
      </Flex>
      <Progress value={percent} size="sm" borderRadius="full" colorScheme="yellow" bg={useColorModeValue('gray.100', 'whiteAlpha.200')} />
      <Text mt={1} fontSize="xs" color={labelColor}>
        {safeTotal > 0 ? `${percent}%` : 'Not tracked per user'}
      </Text>
    </Box>
  );
}

export default ProgressRow;
