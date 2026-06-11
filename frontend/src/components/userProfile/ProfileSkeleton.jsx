import React from 'react';
import { Box, SimpleGrid, Skeleton, SkeletonCircle, SkeletonText, VStack, useColorModeValue } from '@chakra-ui/react';

function ProfileSkeleton() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.100', 'whiteAlpha.200');

  return (
    <VStack align="stretch" spacing={6}>
      <Box bg={cardBg} borderRadius="xl" borderWidth="1px" borderColor={borderColor} p={6}>
        <SkeletonCircle size="20" mb={4} />
        <Skeleton height="28px" width="240px" mb={2} />
        <Skeleton height="18px" width="180px" mb={4} />
        <Skeleton height="36px" width="320px" />
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Box key={index} bg={cardBg} borderRadius="xl" borderWidth="1px" borderColor={borderColor} p={5}>
            <SkeletonText noOfLines={4} spacing={3} />
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  );
}

export default ProfileSkeleton;
