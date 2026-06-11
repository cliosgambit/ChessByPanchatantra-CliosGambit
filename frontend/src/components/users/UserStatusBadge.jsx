import React from 'react';
import { Badge } from '@chakra-ui/react';

const STATUS_STYLES = {
  ACTIVE: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  PAUSED: { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' },
  INACTIVE: { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' },
  BLOCKED: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
};

function UserStatusBadge({ status }) {
  const normalized = (status || 'ACTIVE').toUpperCase();
  const style = STATUS_STYLES[normalized] || STATUS_STYLES.INACTIVE;

  return (
    <Badge
      px={3}
      py={1}
      borderRadius="full"
      fontSize="11px"
      fontWeight="700"
      letterSpacing="0.06em"
      bg={style.bg}
      color={style.color}
      borderWidth="1px"
      borderColor={style.border}
      textTransform="uppercase"
    >
      {normalized}
    </Badge>
  );
}

export default UserStatusBadge;
