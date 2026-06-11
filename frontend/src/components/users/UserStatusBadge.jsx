import React from 'react';
import { Badge } from '@chakra-ui/react';

const STATUS_STYLES = {
  ACTIVE: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  PAUSED: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  BLOCKED: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
};

function UserStatusBadge({ status }) {
  const normalized = (status || 'ACTIVE').toUpperCase();
  const style = STATUS_STYLES[normalized] || STATUS_STYLES.ACTIVE;

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
