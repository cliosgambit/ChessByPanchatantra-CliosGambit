import React from 'react';
import { Box, Heading, Button } from '@chakra-ui/react';

const PollOverlay = ({ pollMoves, showPoll, setShowPoll }) => {
  if (!showPoll || pollMoves.length < 4) return null;
  return (
    <Box position="absolute" top={12} right={4} zIndex={2100} bg="white" borderRadius="md" boxShadow="xl" p={6} minW="260px" maxW="320px" border="2px solid #805ad5" display="flex" flexDirection="column" justifyContent="flex-end">
      <Heading size="sm" mb={4} color="purple.700" textAlign="center">Which is the best move?</Heading>
      {pollMoves.map((opt, idx) => (
        <Box key={idx} mb={2} p={2} borderRadius="md" bg={opt.isNone ? "gray.100" : "purple.50"} fontWeight="bold" textAlign="center">
          {opt.move}
        </Box>
      ))}
      <Button onClick={() => setShowPoll(false)} size="xs" variant="ghost" colorScheme="gray" alignSelf="flex-end" px={2} py={1} mt={2} fontWeight="bold">
        x <span style={{fontWeight:400, marginLeft:4}}>Close</span>
      </Button>
    </Box>
  );
};

export default PollOverlay; 