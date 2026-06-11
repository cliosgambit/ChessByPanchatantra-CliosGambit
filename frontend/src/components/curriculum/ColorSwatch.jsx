import React from 'react';
import { Box } from '@chakra-ui/react';

function ColorSwatch({ color, size = 4, borderRadius = 'sm', ...props }) {
  return (
    <Box
      w={size}
      h={size}
      minW={size}
      minH={size}
      borderRadius={borderRadius}
      bg={color}
      border="1px solid"
      borderColor="blackAlpha.200"
      flexShrink={0}
      {...props}
    />
  );
}

export default ColorSwatch;
