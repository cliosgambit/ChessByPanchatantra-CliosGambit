import React from 'react';
import { motion } from 'framer-motion';
import {
  Box,
  Heading,
  Text,
  Badge,
  Image,
  HStack,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';
import { getThemeByKey } from '../curriculum/moduleThemes';

function normalizeStatus(status) {
  return status === 'draft' ? 'draft' : 'active';
}

/**
 * @param {object} props
 * @param {object} props.story
 * @param {number} [props.index]
 * @param {() => void} [props.onClick]
 * @param {boolean} [props.selectable]
 * @param {boolean} [props.selected]
 */
function StoryCard({ story, index, onClick, selectable = false, selected = false }) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.600', 'gray.400');
  const colorMode = useColorModeValue('light', 'dark');
  const accentBorder = story.themeKey
    ? getThemeByKey(story.themeKey, colorMode).darkColor
    : '#c9a227';
  const isDraft = normalizeStatus(story.status) === 'draft';

  return (
    <Box
      borderRadius="xl"
      boxShadow={selected ? 'outline' : 'md'}
      outline={selected ? '3px solid' : 'none'}
      outlineColor={selected ? 'gold.400' : 'transparent'}
      outlineOffset="2px"
      sx={{ transition: 'box-shadow 0.2s ease, outline 0.2s ease' }}
      _hover={{ boxShadow: selected ? 'outline' : 'lg' }}
      position="relative"
      h="100%"
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
        whileHover={selectable ? undefined : { y: -4 }}
        whileTap={{ scale: 0.99 }}
        bg={cardBg}
        borderRadius="xl"
        borderWidth="1px"
        borderColor={borderColor}
        borderLeftWidth="4px"
        borderLeftColor={accentBorder}
        p={{ base: 4, md: 5 }}
        cursor="pointer"
        opacity={isDraft ? 0.9 : 1}
        onClick={onClick}
        h="100%"
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
        {story.thumbnail_url && (
          <Image
            src={story.thumbnail_url}
            alt={story.title}
            borderRadius="md"
            mb={3}
            maxH="120px"
            w="100%"
            objectFit="cover"
            fallbackSrc="https://via.placeholder.com/400x120?text=Story"
          />
        )}
        <HStack spacing={2} mb={2} flexWrap="wrap">
          {story.story_number && (
            <Badge colorScheme="yellow" variant="subtle" fontSize="10px">
              #{String(story.story_number).padStart(2, '0')}
            </Badge>
          )}
          {story.story_type && (
            <Badge colorScheme="purple" variant="subtle" fontSize="10px" textTransform="capitalize">
              {story.story_type}
            </Badge>
          )}
          <Badge colorScheme="gray" variant="subtle" fontSize="10px">
            {story.story_id}
          </Badge>
        </HStack>
        <Heading size="md" color={headingColor} mb={2} noOfLines={2}>
          {story.title}
        </Heading>
        <Text fontSize="sm" color={subColor} noOfLines={3}>
          {story.description}
        </Text>
      </Box>
    </Box>
  );
}

export default StoryCard;
