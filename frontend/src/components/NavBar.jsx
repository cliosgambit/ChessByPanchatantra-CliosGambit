import React, { useRef, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  HStack,
  Link,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button, // <-- IMPORT Button
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon, HamburgerIcon } from '@chakra-ui/icons';
import { Link as RouterLink } from 'react-router-dom';
import CelebrationButton from './CelebrationButton';
import CameraToggleButton from './CameraToggleButton';
import { useAuth } from '../AppContext';

const Draggable = ({ children }) => {
  const nodeRef = useRef(null);
  const [pos, setPos] = useState({ x: 100, y: 100 });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    setDragging(true);
    setOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    });
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    setPos({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    });
  };

  const onMouseUp = () => setDragging(false);

  React.useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    } else {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  });

  return (
    <div
      ref={nodeRef}
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        cursor: 'move',
        zIndex: 2000,
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  );
};

function NavBar() {
  const { colorMode, toggleColorMode } = useColorMode();
  const { isAuthenticated, user, logout } = useAuth();

  const bgColor = useColorModeValue('rgba(255, 255, 255, 0.9)', 'rgba(26, 32, 44, 0.9)');
  const backdropFilter = 'blur(8px)';
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');

  return (
    <Box
      position="sticky"
      top="0"
      zIndex="999"
      bg={bgColor}
      backdropFilter={backdropFilter}
      borderBottom="1px solid"
      borderColor={borderColor}
      px={{ base: 4, md: 8 }}
      py={3}
      boxShadow="sm"
    >
      <Flex align="center" justify="space-between">
        <Heading as="h1" size={{ base: 'md', md: 'lg' }} color="teal.500">
          <Link as={RouterLink} to="/" _hover={{ textDecoration: 'none' }}>
            Chess By Panchatantra
          </Link>
        </Heading>

        {/* --- DESKTOP NAVIGATION --- */}
        <HStack spacing={4} display={{ base: 'none', md: 'flex' }}>
          {/* Only coach and admin can see these components */}
          {isAuthenticated && (user?.role === 'coach' || user?.role === 'admin') && <CelebrationButton />}
          {isAuthenticated && (user?.role === 'coach' || user?.role === 'admin') && <CameraToggleButton />}
          
          <Link as={RouterLink} to="/" color={textColor} fontWeight="medium" _hover={{ color: 'teal.500', textDecoration: 'none' }}>
            Modules
          </Link>

          {/* ADMIN NAVIGATION - Show admin-specific links */}
          {isAuthenticated && user?.role === 'admin' && (
            <>
              <Link as={RouterLink} to="/api/access-control" color={textColor} fontWeight="medium" _hover={{ color: 'teal.500', textDecoration: 'none' }}>
                Acx_Ctrl
              </Link>
              <Link as={RouterLink} to="/api/activity-tracker" color={textColor} fontWeight="medium" _hover={{ color: 'teal.500', textDecoration: 'none' }}>
                Activity Tracker
              </Link>
              
            </>
          )}

          <IconButton
            onClick={toggleColorMode}
            icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
            variant="ghost"
            aria-label="Toggle color mode"
            color={textColor}
            _hover={{ bg: useColorModeValue('gray.200', 'gray.600') }}
          />
          
          {/* LOGIN/LOGOUT BUTTONS */}
          {!isAuthenticated ? (
            <Button as={RouterLink} to="/login" colorScheme="teal" variant="solid">
              Login
            </Button>
          ) : (
            <Button onClick={logout} colorScheme="red" variant="outline" size="sm">
              Logout
            </Button>
          )}
          
        </HStack>

        {/* --- MOBILE NAVIGATION (HAMBURGER MENU) --- */}
        <Flex display={{ base: 'flex', md: 'none' }} align="center">
          <IconButton
            onClick={toggleColorMode}
            icon={colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
            variant="ghost"
            aria-label="Toggle color mode"
            color={textColor}
          />
          <Menu>
            <MenuButton
              as={IconButton}
              icon={<HamburgerIcon />}
              variant="outline"
              aria-label="Open menu"
            />
            <MenuList>
              <MenuItem as={RouterLink} to="/">
                Modules
              </MenuItem>
              {/* ADMIN MENU ITEMS - Show admin-specific links */}
              {isAuthenticated && user?.role === 'admin' && (
                <>
                  <MenuItem as={RouterLink} to="/api/access-control">
                    Acx_Ctrl
                  </MenuItem>
                  <MenuItem as={RouterLink} to="/api/activity-tracker">
                    Activity Tracker
                  </MenuItem>
                  
                </>
              )}
              {/* LOGIN/LOGOUT MENU ITEMS */}
              {!isAuthenticated ? (
                <MenuItem as={RouterLink} to="/login">
                  Login 
                </MenuItem>
              ) : (
                <MenuItem onClick={logout}>
                  Logout
                </MenuItem>
              )}
            </MenuList>
          </Menu>
        </Flex>
      </Flex>
    </Box>
  );
}

export default NavBar;