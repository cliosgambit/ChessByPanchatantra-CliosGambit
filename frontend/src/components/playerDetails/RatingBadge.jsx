import React from 'react';
import { HStack, Text, Box, useColorModeValue } from '@chakra-ui/react';

const LABELS = [
  { key: 'rapid', short: 'R' },
  { key: 'blitz', short: 'B' },
  { key: 'bullet', short: 'U' },
];

function RatingBadge({ ratings, variant = 'current' }) {
  const grayBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const grayText = useColorModeValue('gray.600', 'gray.300');
  const goldBg = useColorModeValue('gold.50', 'whiteAlpha.200');
  const goldText = useColorModeValue('gold.700', 'gold.300');
  const outlineBorder = useColorModeValue('gray.200', 'whiteAlpha.300');
  const outlineText = useColorModeValue('navy.700', 'white');

  const values = LABELS.map((l) => ratings[l.key] ?? 0);
  const maxVal = Math.max(...values);

  return (
    <HStack spacing={1.5} flexWrap="wrap">
      {LABELS.map((label) => {
        const value = ratings[label.key] ?? '—';
        const isHighlight = variant === 'current' && value === maxVal && maxVal > 0;
        const isOutlined = variant === 'best';

        return (
          <Box
            key={label.key}
            px={2}
            py={0.5}
            borderRadius="full"
            fontSize="11px"
            fontWeight="600"
            bg={isHighlight ? goldBg : isOutlined ? 'transparent' : grayBg}
            color={isHighlight ? goldText : isOutlined ? outlineText : grayText}
            borderWidth={isOutlined ? '1px' : '0'}
            borderColor={isOutlined ? outlineBorder : 'transparent'}
            whiteSpace="nowrap"
          >
            <Text as="span" fontWeight="700" mr={0.5} opacity={0.75}>
              {label.short}
            </Text>
            {value}
          </Box>
        );
      })}
    </HStack>
  );
}

export default RatingBadge;
