import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box,
  Flex,
  HStack,
  Text,
  IconButton,
  Button,
  useBreakpointValue,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { FaCrown } from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { getRoleHomePath } from '../../services/authService';
import {
  NAVBAR_HEIGHT,
  PRIMARY_NAV_ITEMS,
  filterNavByRole,
} from './adminNavItems';
import './TopNavbar.css';

export { NAVBAR_HEIGHT };

function NavItem({ item }) {
  const Icon = item.icon;

  return (
    <NavLink to={item.path} end={item.end} style={{ textDecoration: 'none' }} aria-label={item.label}>
      {({ isActive }) => (
        <Box
          as={motion.div}
          whileTap={{ scale: 0.98 }}
          className={`top-nav-link ${isActive ? 'top-nav-link--active active' : ''}`}
        >
          <Icon size={14} aria-hidden />
          <span>{item.label}</span>
        </Box>
      )}
    </NavLink>
  );
}

function MobileNavLink({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <Box
      as={NavLink}
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className="top-navbar-mobile-link"
      sx={{
        color: 'gray.700',
        '&.active': { color: '#ea580c', background: 'rgba(234, 88, 12, 0.1)', fontWeight: 700 },
        '&:hover': { background: 'gray.100' },
      }}
    >
      <Icon size={18} aria-hidden />
      {item.label}
    </Box>
  );
}

function userInitial(user, displayName) {
  const source = displayName || user?.email || 'A';
  return source.charAt(0).toUpperCase();
}

function TopNavbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDesktop = useBreakpointValue({ base: false, lg: true });
  const borderColor = 'rgba(15, 23, 41, 0.08)';
  const mobilePanelBg = 'rgba(249, 247, 242, 0.98)';

  const visibleNavItems = useMemo(() => filterNavByRole(PRIMARY_NAV_ITEMS, user), [user]);
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Admin';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <Box
        as="header"
        className="top-navbar"
        position="fixed"
        top={0}
        left={0}
        right={0}
        zIndex={1400}
        h={`${NAVBAR_HEIGHT}px`}
        px={{ base: 3, md: 5, xl: 8 }}
        role="banner"
      >
        <Flex h="100%" align="center" justify="space-between" gap={3}>
          <Box
            as={NavLink}
            to={getRoleHomePath(user?.role)}
            className="top-navbar-brand-wrap"
            aria-label="Chess By Panchatantra home"
          >
            <FaCrown className="top-navbar-crown" aria-hidden />
            <Text className="top-navbar-brand">Chess By Panchatantra</Text>
          </Box>

          {isDesktop && (
            <HStack
              as="nav"
              aria-label="Main navigation"
              flex={1}
              justify="center"
              mx={4}
              className="top-nav-pill"
            >
              {visibleNavItems.map((item) => (
                <NavItem key={`${item.path}-${item.label}`} item={item} />
              ))}
            </HStack>
          )}

          <HStack spacing={{ base: 1, md: 2 }} flexShrink={0}>
            {isAuthenticated && (
              <>
                <div className="top-navbar-user-block">
                  <div className="top-navbar-avatar" aria-hidden>
                    {userInitial(user, displayName)}
                  </div>
                  <Box display={{ base: 'none', md: 'block' }}>
                    <div className="top-navbar-user-name">{displayName}</div>
                    <div className="top-navbar-user-role">{user?.role || 'admin'}</div>
                  </Box>
                </div>

                <button
                  type="button"
                  className="top-navbar-logout"
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  <FiLogOut aria-hidden />
                  <span className="top-navbar-logout-label">Logout</span>
                </button>
              </>
            )}

            {!isDesktop && (
              <IconButton
                aria-label="Open menu"
                icon={<HamburgerIcon />}
                variant="ghost"
                size="md"
                color="#374151"
                borderRadius="lg"
                onClick={() => setMobileOpen((open) => !open)}
              />
            )}
          </HStack>
        </Flex>
      </Box>

      <AnimatePresence>
        {!isDesktop && mobileOpen && (
          <motion.div
            className="top-navbar-mobile-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: NAVBAR_HEIGHT,
              left: 0,
              right: 0,
              zIndex: 1399,
            }}
          >
            <Box
              bg={mobilePanelBg}
              borderBottomWidth="1px"
              borderColor={borderColor}
              boxShadow="lg"
              px={4}
              py={4}
              as="nav"
              aria-label="Mobile navigation"
            >
              <Flex direction="column" gap={2}>
                {visibleNavItems.map((item, index) => (
                  <motion.div
                    key={`${item.path}-${item.label}`}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <MobileNavLink item={item} onNavigate={() => setMobileOpen(false)} />
                  </motion.div>
                ))}
              </Flex>
              {isAuthenticated && (
                <Button
                  mt={4}
                  w="100%"
                  leftIcon={<FiLogOut />}
                  variant="ghost"
                  color="#ef4444"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default TopNavbar;
