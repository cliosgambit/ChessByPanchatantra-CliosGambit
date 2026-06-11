import React from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  HStack,
  Select,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { FiSearch, FiClock, FiRefreshCw } from 'react-icons/fi';

const MotionButton = motion(Button);

function PlayerFilters({ search, onSearchChange, sortKey = 'name', onSortChange }) {
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const iconColor = useColorModeValue('gray.400', 'gray.500');
  const inputBg = useColorModeValue('white', 'navy.700');
  const navyText = useColorModeValue('navy.700', 'white');

  const notify = (action) => {
    toast({
      title: action,
      description: 'Sync will connect to Chess.com API when configured.',
      status: 'info',
      duration: 2200,
      isClosable: true,
    });
  };

  const outlineBtn = {
    bg: cardBg,
    color: navyText,
    borderWidth: '1px',
    borderColor: borderColor,
    borderRadius: 'full',
    fontWeight: '600',
    fontSize: 'xs',
    px: 3.5,
    h: '32px',
    minH: '32px',
    _hover: { bg: 'gray.50', borderColor: 'gray.300' },
    transition: 'all 0.2s ease',
  };

  return (
    <Flex
      as={motion.div}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      direction={{ base: 'column', lg: 'row' }}
      align={{ base: 'stretch', lg: 'center' }}
      justify="space-between"
      gap={2}
      bg={cardBg}
      borderRadius="lg"
      borderWidth="1px"
      borderColor={borderColor}
      boxShadow="sm"
      p={{ base: 2, md: 2.5 }}
    >
      <InputGroup flex={1} maxW={{ base: '100%', lg: '280px' }} size="sm">
        <InputLeftElement pointerEvents="none" h="32px">
          <Box as={FiSearch} color={iconColor} boxSize={3.5} />
        </InputLeftElement>
        <Input
          pl={8}
          h="32px"
          bg={inputBg}
          borderColor={borderColor}
          borderRadius="md"
          fontSize="xs"
          placeholder="Search..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          _hover={{ borderColor: 'gray.300' }}
          _focus={{
            borderColor: 'gold.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-gold-400)',
          }}
        />
      </InputGroup>

      <HStack spacing={2} flexWrap="wrap" justify={{ base: 'stretch', lg: 'flex-end' }}>
        {onSortChange && (
          <Select
            size="sm"
            maxW="140px"
            h="32px"
            fontSize="xs"
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort players"
          >
            <option value="name">Name</option>
            <option value="maxElo">Max Elo</option>
            <option value="joined">Joined</option>
          </Select>
        )}
        <MotionButton
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          leftIcon={<FiClock size={13} />}
          onClick={() => notify('History')}
          {...outlineBtn}
          flex={{ base: 1, sm: 'none' }}
        >
          History
        </MotionButton>
        <MotionButton
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          leftIcon={<FiRefreshCw size={13} />}
          onClick={() => notify('Sync Activity')}
          {...outlineBtn}
          flex={{ base: 1, sm: 'none' }}
        >
          Sync Activity
        </MotionButton>
        <MotionButton
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          leftIcon={<FiRefreshCw size={13} />}
          onClick={() => notify('Sync Profiles')}
          bg="navy.700"
          color="white"
          borderRadius="full"
          fontWeight="700"
          fontSize="xs"
          px={4}
          h="32px"
          minH="32px"
          _hover={{ bg: 'navy.600' }}
          transition="all 0.2s ease"
          flex={{ base: 1, sm: 'none' }}
        >
          Sync Profiles
        </MotionButton>
      </HStack>
    </Flex>
  );
}

export default PlayerFilters;
