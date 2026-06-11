import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box,
  Flex,
  HStack,
  Text,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Avatar,
  Badge,
  Button,
  useColorMode,
  useColorModeValue,
  useBreakpointValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon, HamburgerIcon, BellIcon } from '@chakra-ui/icons';
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

const NOTIFICATIONS = [
  { id: 1, title: 'New student enrolled', time: '2m ago', unread: true },
  { id: 2, title: 'Module MOD3 updated', time: '1h ago', unread: true },
  { id: 3, title: 'Weekly report ready', time: 'Yesterday', unread: false },
];

function NavItem({ item }) {
  const inactiveColor = useColorModeValue('gray.600', 'gray.300');
  const activeColor = useColorModeValue('navy.800', 'white');
  const hoverBg = useColorModeValue('rgba(201, 162, 39, 0.12)', 'rgba(201, 162, 39, 0.18)');
  const activeBg = useColorModeValue('rgba(15, 23, 41, 0.06)', 'rgba(255, 255, 255, 0.08)');
  const hoverColor = useColorModeValue('navy.700', 'gold.200');
  const Icon = item.icon;

  return (
    <NavLink to={item.path} end={item.end} style={{ textDecoration: 'none' }} aria-label={item.label}>
      {({ isActive }) => (
        <Box
          as={motion.div}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          position="relative"
          className={`top-nav-link ${isActive ? 'top-nav-link--active active' : ''}`}
          color={isActive ? activeColor : inactiveColor}
          bg={isActive ? activeBg : 'transparent'}
          boxShadow={isActive ? '0 1px 0 rgba(201, 162, 39, 0.35)' : 'none'}
          _hover={{ bg: isActive ? activeBg : hoverBg, color: isActive ? activeColor : hoverColor }}
        >
          <Icon size={15} aria-hidden />
          <span>{item.label}</span>
          {isActive && (
            <motion.span
              className="top-nav-active-indicator"
              layoutId="topNavActiveIndicator"
              initial={false}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
        </Box>
      )}
    </NavLink>
  );
}

function MobileNavLink({ item, onNavigate }) {
  const inactiveColor = useColorModeValue('gray.700', 'gray.200');
  const activeBg = useColorModeValue('rgba(201, 162, 39, 0.15)', 'rgba(201, 162, 39, 0.22)');
  const activeColor = useColorModeValue('navy.800', 'white');
  const hoverBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const Icon = item.icon;

  return (
    <Box
      as={NavLink}
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className="top-navbar-mobile-link"
      sx={{
        color: inactiveColor,
        '&.active': { color: activeColor, background: activeBg, fontWeight: 600 },
        '&:hover': { background: hoverBg },
      }}
    >
      <Icon size={18} aria-hidden />
      {item.label}
    </Box>
  );
}

function TopNavbar() {
  const { colorMode, toggleColorMode } = useColorMode();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDesktop = useBreakpointValue({ base: false, lg: true });

  const navBg = useColorModeValue('rgba(255, 255, 255, 0.92)', 'rgba(15, 23, 41, 0.94)');
  const borderColor = useColorModeValue('rgba(15, 23, 41, 0.08)', 'rgba(201, 162, 39, 0.2)');
  const brandSubtext = useColorModeValue('gray.500', 'gray.400');
  const menuBg = useColorModeValue('white', 'navy.800');
  const iconColor = useColorModeValue('navy.700', 'gray.200');
  const navShadow = useColorModeValue('0 4px 24px rgba(15, 23, 41, 0.08)', '0 4px 24px rgba(0, 0, 0, 0.35)');
  const iconHoverBg = useColorModeValue('gray.100', 'whiteAlpha.200');
  const iconActiveBg = useColorModeValue('gray.200', 'whiteAlpha.300');
  const mobilePanelBg = useColorModeValue('rgba(255,255,255,0.98)', 'rgba(15,23,41,0.98)');
  const gold = '#c9a227';

  const visibleNavItems = useMemo(() => filterNavByRole(PRIMARY_NAV_ITEMS, user), [user]);
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Admin';
  const unreadCount = NOTIFICATIONS.filter((n) => n.unread).length;

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
        bg={navBg}
        borderBottom="1px solid"
        borderColor={borderColor}
        boxShadow={navShadow}
        px={{ base: 3, md: 5, xl: 8 }}
        role="banner"
      >
        <Flex h="100%" align="center" justify="space-between" gap={3}>
          <HStack spacing={3} flexShrink={0}>
            <Box
              as={NavLink}
              to={getRoleHomePath(user?.role)}
              display="flex"
              flexDirection="column"
              _hover={{ textDecoration: 'none' }}
              aria-label="Chess By Panchatantra home"
            >
              <Text className="top-navbar-brand" fontSize={{ base: 'md', md: 'lg' }} fontWeight="800" lineHeight="1.1">
                Chess By Panchatantra
              </Text>
              <Text fontSize="xs" color={brandSubtext} display={{ base: 'none', sm: 'block' }}>
                Admin Dashboard
              </Text>
            </Box>
          </HStack>

          {isDesktop && (
            <HStack
              as="nav"
              aria-label="Main navigation"
              spacing={1}
              flex={1}
              justify="center"
              overflowX="auto"
              mx={4}
            >
              {visibleNavItems.map((item) => (
                <NavItem key={`${item.path}-${item.label}`} item={item} />
              ))}
            </HStack>
          )}

          <HStack spacing={{ base: 1, md: 2 }} flexShrink={0}>
            <Menu placement="bottom-end" isLazy>
              <Box position="relative">
                <MenuButton
                  as={IconButton}
                  aria-label={`Notifications, ${unreadCount} unread`}
                  icon={<BellIcon />}
                  variant="ghost"
                  size="md"
                  color={iconColor}
                  borderRadius="lg"
                  _hover={{ bg: iconHoverBg }}
                />
                {unreadCount > 0 && (
                  <Badge
                    className="top-navbar-notification-pulse"
                    position="absolute"
                    top="6px"
                    right="6px"
                    bg={gold}
                    color="navy.900"
                    borderRadius="full"
                    fontSize="0.65rem"
                    minW="1.1rem"
                    h="1.1rem"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Box>
              <MenuList bg={menuBg} borderColor={borderColor} boxShadow="xl" minW="280px" py={2}>
                <Text px={4} py={2} fontSize="sm" fontWeight="700" color={iconColor}>
                  Notifications
                </Text>
                <MenuDivider />
                {NOTIFICATIONS.map((note) => (
                  <MenuItem key={note.id} py={3} onClick={() => navigate('/activity-tracker')}>
                    <Text fontSize="sm" fontWeight={note.unread ? '700' : '500'}>
                      {note.title}
                    </Text>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>

            <IconButton
              aria-label={colorMode === 'light' ? 'Enable dark mode' : 'Enable light mode'}
              icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
              variant="ghost"
              size="md"
              color={iconColor}
              borderRadius="lg"
              onClick={toggleColorMode}
              _hover={{ bg: iconHoverBg }}
            />

            {isAuthenticated && (
              <>
                <Menu placement="bottom-end" isLazy>
                  <MenuButton
                    as={Button}
                    variant="ghost"
                    px={2}
                    py={1}
                    h="auto"
                    borderRadius="xl"
                    _hover={{ bg: iconHoverBg }}
                    _active={{ bg: iconActiveBg }}
                    aria-label="Open profile menu"
                  >
                    <HStack spacing={2}>
                      <Avatar size="sm" name={displayName} bg="navy.700" color="gold.300" border="2px solid" borderColor={gold} />
                      <Box textAlign="left" display={{ base: 'none', md: 'block' }}>
                        <Text fontSize="sm" fontWeight="600" color={iconColor}>
                          {displayName}
                        </Text>
                        <Text fontSize="xs" color={brandSubtext} textTransform="capitalize">
                          {user?.role}
                        </Text>
                      </Box>
                    </HStack>
                  </MenuButton>
                  <MenuList bg={menuBg} borderColor={borderColor} boxShadow="xl" py={2} minW="200px">
                    <MenuItem isDisabled fontWeight="600">
                      {user?.email}
                    </MenuItem>
                    <MenuDivider />
                    <MenuItem onClick={() => navigate('/module-access')}>Module Access</MenuItem>
                    <MenuItem onClick={() => navigate('/activity-tracker')}>Activity Tracker</MenuItem>
                  </MenuList>
                </Menu>

                <Button
                  leftIcon={<FiLogOut />}
                  size="sm"
                  variant="outline"
                  borderColor="gold.500"
                  color="navy.700"
                  display={{ base: 'none', md: 'inline-flex' }}
                  onClick={handleLogout}
                  _hover={{ bg: 'gold.50' }}
                >
                  Logout
                </Button>
              </>
            )}

            {!isDesktop && (
              <IconButton
                aria-label="Open menu"
                icon={<HamburgerIcon />}
                variant="outline"
                size="md"
                borderColor={borderColor}
                color={iconColor}
                borderRadius="lg"
                onClick={() => setMobileOpen((o) => !o)}
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
                  variant="outline"
                  colorScheme="red"
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
