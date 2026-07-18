import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { AnimatePresence } from 'framer-motion';
import SideNav, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './SideNav';
import PageTransition from '../dashboard/PageTransition';
import CameraToggleButton from '../CameraToggleButton';
import CelebrationOverlay from '../CelebrationOverlay';
import './AdminLayout.css';

function isDashboardPath(pathname) {
  return pathname === '/dashboard' || pathname === '/dashboard/';
}

function AdminLayout() {
  const location = useLocation();
  const [prevPath, setPrevPath] = useState(location.pathname);
  const onDashboard = isDashboardPath(location.pathname);
  const [collapsed, setCollapsed] = useState(!onDashboard);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // Only set collapsed when navigating to a new path
    if (location.pathname !== prevPath) {
      // Off-dashboard pages start minimized; dashboard starts open
      setCollapsed(!isDashboardPath(location.pathname));
      setHovered(false);
      setPrevPath(location.pathname);
    }
  }, [location.pathname, prevPath]);

  const expanded = !collapsed || hovered;
  const railWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box
      className={`admin-shell${collapsed ? ' admin-shell--nav-collapsed' : ''}${
        collapsed && hovered ? ' admin-shell--nav-hover' : ''
      }`}
      minH="100vh"
      w="100%"
    >
      <Box
        className="admin-shell__sidebar"
        style={{ width: railWidth }}
        flexShrink={0}
      >
        <SideNav
          collapsed={collapsed}
          expanded={expanded}
          onToggleCollapse={() => {
            setCollapsed((v) => !v);
            setHovered(false); // Reset hover state when toggling
          }}
          onHoverChange={setHovered}
        />
      </Box>

      <Box
        as="main"
        className="admin-shell__main"
        role="main"
        aria-label="Admin content"
        flex="1"
        minW={0}
        minH="100vh"
      >
        <AnimatePresence initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </Box>

      <CameraToggleButton />
      <CelebrationOverlay />
    </Box>
  );
}

export default AdminLayout;
