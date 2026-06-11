import React from 'react';
import { motion } from 'framer-motion';
import { Box, Heading, Text, Badge, useColorMode, Icon } from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';
import { getThemeByKey, getThemeForIndex } from '../curriculum/moduleThemes';

/**
 * @param {object} props
 * @param {object} props.chapter
 * @param {number} [props.index]
 * @param {() => void} [props.onClick]
 * @param {boolean} [props.selectable]
 * @param {boolean} [props.selected]
 */
function ChapterCard({ chapter, index = 0, onClick, selectable = false, selected = false }) {
  const { colorMode } = useColorMode();

  if (!chapter) return null;

  const theme = chapter.themeKey
    ? getThemeByKey(chapter.themeKey, colorMode)
    : getThemeForIndex(
        chapter.chapter_number != null ? Number(chapter.chapter_number) - 1 : index,
        colorMode
      );
  const { lightColor, darkColor, textColor } = theme;
  const isDraft = chapter.status === 'draft';
  const displayNumber = chapter.chapter_number
    ? String(chapter.chapter_number).padStart(2, '0')
    : chapter.chapter_id;

  return (
    <Box
      borderRadius="xl"
      boxShadow={selected ? 'outline' : 'md'}
      outline={selected ? '3px solid' : 'none'}
      outlineColor={selected ? 'gold.400' : 'transparent'}
      outlineOffset="2px"
      sx={{ transition: 'box-shadow 0.2s ease, outline 0.2s ease' }}
      _hover={{ boxShadow: selected ? 'outline' : 'xl' }}
      onClick={onClick}
      cursor="pointer"
      position="relative"
    >
      {selectable && (
        <Box position="absolute" top={3} left={3} zIndex={2}>
          {selected ? (
            <Icon
              as={CheckCircleIcon}
              boxSize={5}
              color="gold.300"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.35))"
            />
          ) : (
            <Box
              boxSize={5}
              borderRadius="full"
              border="2px solid"
              borderColor="whiteAlpha.800"
              bg="blackAlpha.200"
            />
          )}
        </Box>
      )}
      <Box
        as={motion.div}
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.3 }}
        whileHover={selectable ? undefined : { scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
        bgGradient={`linear(to-br, ${lightColor}, ${darkColor})`}
        borderRadius="xl"
        minH="220px"
        p={{ base: 4, md: 5 }}
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        color={textColor}
        opacity={isDraft ? 0.85 : 1}
        position="relative"
      >
        {isDraft && (
          <Badge
            position="absolute"
            top={3}
            right={3}
            colorScheme="yellow"
            fontSize="10px"
            borderRadius="full"
          >
            DRAFT
          </Badge>
        )}
        <Heading size="md" mb={2} letterSpacing="-0.02em">
          {displayNumber}
        </Heading>
        <Text fontSize="lg" fontWeight="700" lineHeight="short">
          {chapter.chapter_name}
        </Text>
        {chapter.description && (
          <Text fontSize="sm" mt={2} opacity={0.9} noOfLines={2} maxW="90%">
            {chapter.description}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export default ChapterCard;
