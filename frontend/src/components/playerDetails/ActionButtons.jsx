import React from 'react';
import { HStack, Button } from '@chakra-ui/react';

const ACTION_STYLES = {
  view: { color: 'navy.700', _hover: { color: 'navy.600', textDecoration: 'underline' } },
  edit: { color: 'blue.600', _hover: { color: 'blue.500', textDecoration: 'underline' } },
  pause: { color: 'gold.600', _hover: { color: 'gold.500', textDecoration: 'underline' } },
  delete: { color: 'red.600', _hover: { color: 'red.500', textDecoration: 'underline' } },
};

function ActionLink({ label, styleKey, onClick }) {
  return (
    <Button
      variant="unstyled"
      size="sm"
      fontSize="sm"
      fontWeight="600"
      minW="auto"
      h="auto"
      px={0}
      transition="opacity 0.2s ease, color 0.2s ease"
      onClick={onClick}
      {...ACTION_STYLES[styleKey]}
    >
      {label}
    </Button>
  );
}

function ActionButtons({ onView, onEdit, onPause, onDelete }) {
  return (
    <HStack spacing={4} justify="flex-end" flexWrap="wrap">
      <ActionLink label="View" styleKey="view" onClick={onView} />
      <ActionLink label="Edit" styleKey="edit" onClick={onEdit} />
      <ActionLink label="Pause" styleKey="pause" onClick={onPause} />
      <ActionLink label="Delete" styleKey="delete" onClick={onDelete} />
    </HStack>
  );
}

export default ActionButtons;
