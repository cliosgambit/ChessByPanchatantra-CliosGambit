import React from 'react';
import {
  Box,
  Heading,
  Text,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';
import { NAVBAR_HEIGHT } from '../layout/TopNavbar';

function PageShell({ title, subtitle, children, actions, layout = 'default' }) {
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'gold.700');
  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const cardShadow = useColorModeValue('md', 'dark-lg');

  const header = (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'flex-start', md: 'center' }}
      justify="space-between"
      gap={4}
      flexShrink={0}
      mb={layout === 'fill' ? 4 : 8}
    >
      <Box>
        <Heading size="lg" color={headingColor} letterSpacing="-0.02em">
          {title}
        </Heading>
        {subtitle && (
          <Text mt={1} fontSize="md" color={subColor} maxW="2xl">
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && <Box flexShrink={0}>{actions}</Box>}
    </Flex>
  );

  if (layout === 'fill') {
    return (
      <Box
        h={`calc(100vh - ${NAVBAR_HEIGHT}px)`}
        w="100%"
        maxW="100%"
        display="flex"
        flexDirection="column"
        overflow="hidden"
        bg={pageBg}
        px={{ base: 4, md: 8, xl: 10 }}
        py={{ base: 4, md: 6 }}
      >
        {header}
        <Box
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
          borderRadius="xl"
          bg={cardBg}
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow={cardShadow}
          overflow="hidden"
        >
          {children}
        </Box>
      </Box>
    );
  }

  return (
    <Box w="100%" maxW="100%" py={{ base: 6, md: 8 }} px={{ base: 4, md: 8, xl: 10 }}>
      {header}
      <Box
        borderRadius="xl"
        bg={cardBg}
        borderWidth="1px"
        borderColor={borderColor}
        boxShadow={cardShadow}
        p={{ base: 4, md: 6 }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default PageShell;
