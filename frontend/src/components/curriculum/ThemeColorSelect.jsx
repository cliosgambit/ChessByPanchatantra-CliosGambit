import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuList,
  MenuGroup,
  MenuItem,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { ChevronDownIcon, SearchIcon } from '@chakra-ui/icons';
import ColorSwatch from './ColorSwatch';
import { getThemeByKey, getThemesByCategory } from './moduleThemes';

function ThemeColorSelect({ value, onChange, label = 'Background Color' }) {
  const [search, setSearch] = useState('');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.300');
  const menuBg = useColorModeValue('white', 'navy.800');
  const groupColor = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const buttonBg = useColorModeValue('white', 'navy.900');

  const selected = getThemeByKey(value);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups = getThemesByCategory();
    if (!query) return groups;
    return groups
      .map((group) => ({
        ...group,
        themes: group.themes.filter(
          (t) =>
            t.label.toLowerCase().includes(query) ||
            t.category.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.themes.length > 0);
  }, [search]);

  return (
    <FormControl>
      <FormLabel fontSize="sm" fontWeight="600">
        {label}
      </FormLabel>
      <Menu matchWidth onClose={() => setSearch('')}>
        <MenuButton
          as={Button}
          w="100%"
          variant="outline"
          borderColor={borderColor}
          borderRadius="md"
          fontWeight="500"
          textAlign="left"
          rightIcon={<ChevronDownIcon />}
          bg={buttonBg}
          _hover={{ bg: hoverBg }}
          _expanded={{ borderColor: 'gold.400', boxShadow: '0 0 0 1px var(--chakra-colors-gold-400)' }}
        >
          <Flex align="center" gap={2}>
            <ColorSwatch color={selected.hex} size={4} />
            <Text fontSize="sm" noOfLines={1}>
              {selected.label}
            </Text>
          </Flex>
        </MenuButton>
        <MenuList
          maxH="280px"
          overflowY="auto"
          bg={menuBg}
          borderColor={borderColor}
          py={2}
          zIndex={1500}
        >
          <Box px={3} pb={2} position="sticky" top={0} bg={menuBg} zIndex={1}>
            <InputGroup size="sm">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" boxSize={3} />
              </InputLeftElement>
              <Input
                placeholder="Search colors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                borderRadius="md"
                borderColor={borderColor}
              />
            </InputGroup>
          </Box>
          {grouped.length === 0 ? (
            <Text px={4} py={2} fontSize="sm" color="gray.500">
              No colors match your search.
            </Text>
          ) : (
            grouped.map((group) => (
              <MenuGroup key={group.category} title={group.category} color={groupColor}>
                {group.themes.map((theme) => (
                  <MenuItem
                    key={theme.key}
                    onClick={() => onChange(theme.key)}
                    bg={theme.key === value ? hoverBg : undefined}
                    fontWeight={theme.key === value ? '600' : 'normal'}
                    _hover={{ bg: hoverBg }}
                  >
                    <Flex align="center" gap={3} w="100%">
                      <ColorSwatch color={theme.hex} size={4} />
                      <Text fontSize="sm">{theme.label}</Text>
                    </Flex>
                  </MenuItem>
                ))}
              </MenuGroup>
            ))
          )}
        </MenuList>
      </Menu>
    </FormControl>
  );
}

export default ThemeColorSelect;
