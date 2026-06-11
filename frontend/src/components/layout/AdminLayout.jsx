import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, useColorModeValue } from '@chakra-ui/react';
import { AnimatePresence } from 'framer-motion';
import TopNavbar, { NAVBAR_HEIGHT } from './TopNavbar';
import PageTransition from '../dashboard/PageTransition';

function AdminLayout() {
  const location = useLocation();
  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');

  return (
    <Box minH="100vh" bg={pageBg} w="100%">
      <TopNavbar />
      <Box
        as="main"
        w="100%"
        maxW="100%"
        pt={`${NAVBAR_HEIGHT}px`}
        minH={`calc(100vh - ${NAVBAR_HEIGHT}px)`}
        px={{ base: 0, md: 0 }}
        role="main"
        aria-label="Admin content"
      >
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </Box>
    </Box>
  );
}

export default AdminLayout;
