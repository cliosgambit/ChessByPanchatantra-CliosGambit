import React from 'react';
import { motion } from 'framer-motion';
import { Box, Heading, useColorModeValue } from '@chakra-ui/react';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.bgColor
 * @param {string} props.bgColorDark
 * @param {string} props.textColor
 * @param {string} props.textColorDark
 * @param {string} props.borderColor
 * @param {string} props.borderColorDark
 * @param {number} [props.index]
 * @param {() => void} [props.onClick]
 */
function DashboardSectionCard({
  label,
  bgColor,
  bgColorDark,
  textColor,
  textColorDark,
  borderColor,
  borderColorDark,
  index = 0,
  onClick,
}) {
  const bg = useColorModeValue(bgColor, bgColorDark);
  const color = useColorModeValue(textColor, textColorDark);
  const border = useColorModeValue(borderColor, borderColorDark);

  return (
    <Box
      as={motion.div}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      cursor="pointer"
      bg={bg}
      color={color}
      borderRadius="lg"
      borderWidth="2px"
      borderColor={border}
      boxShadow="sm"
      minH="200px"
      p={{ base: 5, md: 6 }}
      display="flex"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      _hover={{ boxShadow: 'md' }}
      sx={{ transition: 'box-shadow 0.2s ease, transform 0.2s ease' }}
    >
      <Heading size="md" fontWeight="600" letterSpacing="-0.01em">
        {label}
      </Heading>
    </Box>
  );
}

export default DashboardSectionCard;
