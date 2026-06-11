import React from 'react';
import { HStack, Button, Text, useColorModeValue } from '@chakra-ui/react';

function PaginationBar({ page, totalPages, total, onPageChange }) {
  const color = useColorModeValue('gray.600', 'gray.400');
  if (totalPages <= 1) return null;

  return (
    <HStack justify="space-between" py={2} px={0.5}>
      <Text fontSize="xs" color={color}>
        Page {page} of {totalPages} ({total} total)
      </Text>
      <HStack spacing={2}>
        <Button size="xs" variant="outline" isDisabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button
          size="xs"
          variant="outline"
          isDisabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </HStack>
    </HStack>
  );
}

export default React.memo(PaginationBar);
