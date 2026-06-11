import React from 'react';
import { Box, Button, Flex, HStack, Text, useColorModeValue } from '@chakra-ui/react';

function PrinciplesPagination({ page, totalPages, total, pageSize, onPageChange }) {
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const activeBg = useColorModeValue('navy.700', 'gold.500');
  const activeColor = useColorModeValue('white', 'navy.900');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');
  const footerBg = useColorModeValue('white', 'navy.800');

  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <Box
      flexShrink={0}
      px={{ base: 4, md: 6 }}
      py={4}
      borderTopWidth="1px"
      borderColor={borderColor}
      bg={footerBg}
    >
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        align={{ base: 'stretch', sm: 'center' }}
        justify="space-between"
        gap={4}
      >
        <Text fontSize="sm" color={subColor} textAlign={{ base: 'center', sm: 'left' }}>
          Showing {start}–{end} of {total} principles
        </Text>

        <HStack spacing={2} justify={{ base: 'center', sm: 'flex-end' }} flexWrap="wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            isDisabled={page <= 1}
            aria-label="Previous page"
          >
            Previous
          </Button>

          {pages.map((pageNum) => (
            <Button
              key={pageNum}
              size="sm"
              variant={pageNum === page ? 'solid' : 'outline'}
              bg={pageNum === page ? activeBg : undefined}
              color={pageNum === page ? activeColor : undefined}
              borderColor={pageNum === page ? activeBg : borderColor}
              _hover={pageNum === page ? { bg: activeBg, opacity: 0.9 } : undefined}
              onClick={() => onPageChange(pageNum)}
              aria-label={`Page ${pageNum}`}
              aria-current={pageNum === page ? 'page' : undefined}
              minW="40px"
            >
              {pageNum}
            </Button>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            isDisabled={page >= totalPages}
            aria-label="Next page"
          >
            Next
          </Button>
        </HStack>
      </Flex>
    </Box>
  );
}

export default PrinciplesPagination;
