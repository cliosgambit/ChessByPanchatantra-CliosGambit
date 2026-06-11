import React, { useCallback, useRef, useState } from 'react';
import { Box, Flex, Heading, Text, useColorModeValue } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { NAVBAR_HEIGHT } from '../layout/TopNavbar';

/**
 * Admin page shell: fixed header + scrollable content (single scrollbar).
 * @param {object} props
 * @param {React.ReactNode} [props.breadcrumbs]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.headerExtra]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} props.children
 * @param {'sm' | 'md' | 'lg'} [props.titleSize]
 * @param {boolean} [props.animated]
 */
function StickyAdminPageLayout({
  breadcrumbs,
  title,
  subtitle,
  headerExtra,
  actions,
  children,
  titleSize = 'lg',
  animated = false,
}) {
  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const headerBorder = useColorModeValue('blackAlpha.100', 'whiteAlpha.150');
  const scrollRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) setScrolled(el.scrollTop > 4);
  }, []);

  const rootProps = animated
    ? {
        as: motion.div,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
      }
    : {};

  return (
    <Box
      {...rootProps}
      w="100%"
      bg={pageBg}
      h={`calc(100vh - ${NAVBAR_HEIGHT}px)`}
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
      <Box
        flexShrink={0}
        position="sticky"
        top={0}
        zIndex={10}
        px={{ base: 4, md: 8, xl: 10 }}
        pt={{ base: 6, md: 8 }}
        pb={4}
        bg={pageBg}
        borderBottomWidth="1px"
        borderColor={scrolled ? headerBorder : 'transparent'}
        boxShadow={scrolled ? 'sm' : 'none'}
        transition="box-shadow 0.2s ease, border-color 0.2s ease"
      >
        <Flex
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={4}
        >
          <Box>
            {breadcrumbs}
            <Heading size={titleSize} color={headingColor} letterSpacing="-0.02em">
              {title}
            </Heading>
            {subtitle && (
              <Text mt={titleSize === 'lg' ? 2 : 1} color={subColor} fontSize={titleSize === 'lg' ? 'md' : 'sm'}>
                {subtitle}
              </Text>
            )}
            {headerExtra}
          </Box>
          {actions && <Box flexShrink={0}>{actions}</Box>}
        </Flex>
      </Box>

      <Box
        ref={scrollRef}
        flex={1}
        minH={0}
        overflowY="auto"
        overflowX="hidden"
        px={{ base: 4, md: 8, xl: 10 }}
        pb={10}
        onScroll={handleScroll}
        sx={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default StickyAdminPageLayout;
