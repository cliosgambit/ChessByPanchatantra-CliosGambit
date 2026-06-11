import React from 'react';
import { VStack, Text, Box, useColorModeValue } from '@chakra-ui/react';

function SyncStatusBadge({ change, timestamp }) {
  const badgeBg = useColorModeValue('gold.50', 'whiteAlpha.100');
  const badgeColor = useColorModeValue('gold.700', 'gold.300');
  const badgeBorder = useColorModeValue('gold.200', 'gold.600');
  const timeColor = useColorModeValue('gray.500', 'gray.400');

  return (
    <VStack align="flex-start" spacing={1}>
      <Box
        px={2.5}
        py={0.5}
        borderRadius="full"
        bg={badgeBg}
        color={badgeColor}
        borderWidth="1px"
        borderColor={badgeBorder}
        fontSize="11px"
        fontWeight="700"
        letterSpacing="0.02em"
      >
        {change}
      </Box>
      <Text fontSize="xs" color={timeColor} fontWeight="500" lineHeight="1.2">
        {timestamp}
      </Text>
    </VStack>
  );
}

export default SyncStatusBadge;
