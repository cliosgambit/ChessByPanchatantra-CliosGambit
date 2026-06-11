import React from 'react';
import { Box, Text, useColorModeValue } from '@chakra-ui/react';

function StatCard({ label, value, subValue }) {
  const bg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const labelColor = useColorModeValue('gray.500', 'gray.400');
  const valueColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');

  return (
    <Box bg={bg} borderRadius="lg" p={4} minH="88px">
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.06em" textTransform="uppercase" color={labelColor}>
        {label}
      </Text>
      <Text mt={2} fontSize="2xl" fontWeight="700" color={valueColor} lineHeight="1.1">
        {value ?? '—'}
      </Text>
      {subValue && (
        <Text mt={1} fontSize="xs" color={subColor}>
          {subValue}
        </Text>
      )}
    </Box>
  );
}

export default StatCard;
