import React from 'react';
import { Button, HStack, useColorModeValue } from '@chakra-ui/react';
import { FiUpload, FiDownload, FiPlus } from 'react-icons/fi';

function PrinciplesToolbar({ onBulkImport, onTemplate, onAdd }) {
  const outlineBorder = useColorModeValue('gray.300', 'whiteAlpha.300');

  return (
    <HStack spacing={3} flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }} w="100%">
      <Button
        leftIcon={<FiUpload />}
        colorScheme="blue"
        size="sm"
        onClick={onBulkImport}
        aria-label="Bulk import principles"
      >
        Bulk Import
      </Button>
      <Button
        leftIcon={<FiDownload />}
        variant="outline"
        size="sm"
        borderColor={outlineBorder}
        onClick={onTemplate}
        aria-label="Download principles template"
      >
        Template
      </Button>
      <Button
        leftIcon={<FiPlus />}
        colorScheme="yellow"
        size="sm"
        onClick={onAdd}
        aria-label="Add principle"
      >
        Add Principle
      </Button>
    </HStack>
  );
}

export default PrinciplesToolbar;
