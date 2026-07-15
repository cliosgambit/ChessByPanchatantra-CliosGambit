import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box } from '@chakra-ui/react';
import { AnimatePresence } from 'framer-motion';
import SideNav, { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from './SideNav';
import PageTransition from '../dashboard/PageTransition';
import './AdminLayout.css';

function isDashboardPath(pathname) {
  return pathname === '/dashboard' || pathname === '/dashboard/';
}

function AdminLayout() {
  const location = useLocation();
  const onDashboard = isDashboardPath(location.pathname);
  const [collapsed, setCollapsed] = useState(!onDashboard);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // Off-dashboard pages start minimized; dashboard starts open
    setCollapsed(!isDashboardPath(location.pathname));
    setHovered(false);
  }, [location.pathname]);

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
          onToggleCollapse={() => setCollapsed((v) => !v)}
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
    </Box>
  );
}

export default AdminLayout;
