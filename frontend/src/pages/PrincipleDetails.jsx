import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Spinner,
  Flex,
  Button,
  useColorModeValue,
  useBreakpointValue,
  Stack,
  Link,
  Wrap,
  WrapItem,
  IconButton,
  useDisclosure,
  useToast,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
} from '@chakra-ui/react';
import { AddIcon, CloseIcon } from '@chakra-ui/icons';
import { useParams, Link as RouterLink } from 'react-router-dom';
import ChessGame from './ChessGame';
import PuzzleModal from '../components/principles/PuzzleModal';
import { fetchPrincipleById } from '../services/principlesService';
import { fetchPuzzlesForPrinciple, unlinkPuzzleFromPrinciple } from '../services/puzzleService';

function formatPrincipleId(id) {
  if (!id) return '—';
  const str = String(id);
  return str.startsWith('P') ? str : `P${str}`;
}

function PrincipleDetails() {
  const { principleId } = useParams();
  const toast = useToast();
  const cancelRef = useRef();
  const [principle, setPrinciple] = useState(null);
  const [puzzles, setPuzzles] = useState([]);
  const [activePuzzleIndex, setActivePuzzleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSolution, setShowSolution] = useState(false);
  const [puzzleEditMode, setPuzzleEditMode] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const { isOpen: addOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const { isOpen: removeOpen, onOpen: onRemoveOpen, onClose: onRemoveClose } = useDisclosure();

  const isMobile = useBreakpointValue({ base: true, lg: false });

  const pageBg = useColorModeValue('#f4f1e8', 'navy.900');
  const cardBg = useColorModeValue('blue.50', 'blue.900');
  const cardEditBorder = useColorModeValue('orange.300', 'orange.500');
  const headingColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');
  const normalButtonBg = useColorModeValue('gray.200', 'gray.700');
  const normalButtonColor = useColorModeValue('gray.800', 'gray.100');
  const normalButtonBorder = useColorModeValue('gray.300', 'gray.600');
  const normalButtonHoverBg = useColorModeValue('gray.300', 'gray.600');
  const activeButtonBg = useColorModeValue('teal.500', 'teal.400');
  const activeButtonColor = 'white';
  const activeButtonBorder = useColorModeValue('teal.500', 'teal.400');

  const reloadPuzzles = useCallback(async (selectPuzzleId) => {
    const rows = await fetchPuzzlesForPrinciple(principleId);
    setPuzzles(rows);
    setActivePuzzleIndex((prev) => {
      if (selectPuzzleId) {
        const idx = rows.findIndex((p) => p.id === selectPuzzleId);
        return idx >= 0 ? idx : rows.length > 0 ? 0 : -1;
      }
      if (rows.length === 0) return -1;
      if (prev >= rows.length) return rows.length - 1;
      return prev;
    });
    setShowSolution(false);
    return rows;
  }, [principleId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [principleRow, puzzleRows] = await Promise.all([
          fetchPrincipleById(principleId),
          fetchPuzzlesForPrinciple(principleId),
        ]);

        if (cancelled) return;

        if (!principleRow) {
          setError('not_found');
          setPrinciple(null);
          setPuzzles([]);
          return;
        }

        setPrinciple(principleRow);
        setPuzzles(puzzleRows);
        setActivePuzzleIndex(puzzleRows.length > 0 ? 0 : -1);
        setShowSolution(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load principle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [principleId]);

  const activePuzzle = activePuzzleIndex >= 0 ? puzzles[activePuzzleIndex] : null;
  const principleText = principle?.principle || principle?.name || '';

  const handlePuzzleSelect = (index) => {
    if (index === activePuzzleIndex) return;
    setActivePuzzleIndex(index);
    setShowSolution(false);
  };

  const togglePuzzleEditMode = () => {
    setPuzzleEditMode((prev) => !prev);
  };

  const handleRemoveRequest = (puzzle) => {
    setRemoveTarget(puzzle);
    onRemoveOpen();
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget?.id) return;
    setRemoving(true);
    try {
      await unlinkPuzzleFromPrinciple(removeTarget.id);
      toast({ title: 'Puzzle removed from principle', status: 'success', duration: 2000 });
      const remaining = await reloadPuzzles();
      if (remaining.length === 0) {
        setPuzzleEditMode(false);
      }
      onRemoveClose();
      setRemoveTarget(null);
    } catch (err) {
      toast({
        title: err.message || 'Failed to remove puzzle',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setRemoving(false);
    }
  };

  const handlePuzzleSaved = async (savedPuzzle) => {
    try {
      if (savedPuzzle?.id) {
        await reloadPuzzles(savedPuzzle.id);
      } else {
        await reloadPuzzles();
      }
    } catch (err) {
      toast({
        title: 'Failed to refresh puzzles',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  const PuzzleSelector = (
    <Box
      p={4}
      bg={cardBg}
      borderRadius="md"
      borderWidth={puzzleEditMode ? '2px' : '0'}
      borderColor={puzzleEditMode ? cardEditBorder : 'transparent'}
      transition="border-color 0.2s ease"
    >
      <Heading size="xs" textTransform="uppercase" color="blue.600" mb={2}>
        Related Puzzles
      </Heading>

      {puzzles.length > 0 && (
        <Text fontSize="xs" color={subColor} mb={3}>
          {puzzles.length} puzzle{puzzles.length === 1 ? '' : 's'}
        </Text>
      )}

      {puzzleEditMode && puzzles.length > 0 && (
        <Text fontSize="xs" color="orange.600" mb={3} fontWeight="600">
          Edit mode — remove puzzles from this principle
        </Text>
      )}

      {puzzles.length === 0 ? (
        <Text fontSize="sm" color={subColor} mb={4}>
          No puzzles linked to this principle yet.
        </Text>
      ) : (
        <Wrap spacing={3} mb={4}>
          {puzzles.map((puzzle, index) => {
            const isActive = index === activePuzzleIndex;
            const label = puzzle.title || `Puzzle ${index + 1}`;
            return (
              <WrapItem key={puzzle.id || `puzzle-${index}`}>
                <Flex
                  align="center"
                  borderRadius="xl"
                  borderWidth="1px"
                  borderColor={isActive ? activeButtonBorder : normalButtonBorder}
                  bg={isActive ? activeButtonBg : normalButtonBg}
                  overflow="hidden"
                  transition="background 0.15s ease"
                  _hover={{ bg: isActive ? activeButtonBg : normalButtonHoverBg }}
                >
                  <Button
                    variant="unstyled"
                    size="sm"
                    px={5}
                    py={3}
                    whiteSpace="nowrap"
                    color={isActive ? activeButtonColor : normalButtonColor}
                    fontWeight="600"
                    height="auto"
                    minH={0}
                    onClick={() => handlePuzzleSelect(index)}
                  >
                    {label}
                  </Button>
                  {puzzleEditMode && (
                    <IconButton
                      aria-label={`Remove ${label}`}
                      icon={<CloseIcon boxSize={2.5} />}
                      size="xs"
                      variant="ghost"
                      color="red.400"
                      _hover={{ color: 'red.600', bg: 'red.50' }}
                      mr={1}
                      minW={6}
                      h={6}
                      onClick={() => handleRemoveRequest(puzzle)}
                    />
                  )}
                </Flex>
              </WrapItem>
            );
          })}
        </Wrap>
      )}

      <Flex gap={3} flexWrap="wrap" mt={puzzles.length > 0 ? 6 : 0}>
        <Button size="sm" colorScheme="gold" leftIcon={<AddIcon />} onClick={onAddOpen}>
          Add Puzzle
        </Button>
        {puzzles.length > 0 && (
          <Button
            size="sm"
            variant={puzzleEditMode ? 'solid' : 'outline'}
            colorScheme={puzzleEditMode ? 'orange' : 'blue'}
            onClick={togglePuzzleEditMode}
          >
            {puzzleEditMode ? 'Done' : 'Edit'}
          </Button>
        )}
      </Flex>
    </Box>
  );

  const SolutionBox = activePuzzle?.answer ? (
    <Box p={4} bg="green.50" borderRadius="md" mt={4}>
      <Heading size="sm" mb={3} color="green.700">
        Puzzle Solution
      </Heading>
      {!showSolution ? (
        <Button size="sm" colorScheme="teal" onClick={() => setShowSolution(true)}>
          Show Solution
        </Button>
      ) : (
        <Text mt={3} color="green.800" whiteSpace="pre-wrap">
          {activePuzzle.answer}
        </Text>
      )}
    </Box>
  ) : null;

  const ChessboardDisplay = (
    <Box w={{ base: '100%', lg: '100%' }}>
      {activePuzzle?.fen_with_move ? (
        <ChessGame
          key={`puzzle-${activePuzzle.id}-${activePuzzle.fen_with_move}`}
          initialFen={activePuzzle.fen_with_move}
          maxDepth={10}
          minDepth={5}
        />
      ) : (
        <Flex
          minH={{ base: '320px', md: '480px' }}
          align="center"
          justify="center"
          bg="gray.100"
          borderRadius="md"
        >
          <Text color="gray.500">
            {puzzles.length === 0
              ? 'No puzzles linked to this principle yet.'
              : 'Select a puzzle to begin.'}
          </Text>
        </Flex>
      )}
    </Box>
  );

  if (loading) {
    return (
      <Box p={8} textAlign="center" bg={pageBg} minH="100%">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (error === 'not_found' || !principle) {
    return (
      <Box px={{ base: 4, md: 8 }} py={8} bg={pageBg} minH="100%">
        <Link as={RouterLink} to="/principles" color="blue.600" fontSize="sm" mb={4} display="inline-block">
          ← Back to Principles
        </Link>
        <Heading size="md" color="red.500" mt={4}>
          Principle not found.
        </Heading>
      </Box>
    );
  }

  if (error) {
    return (
      <Box px={{ base: 4, md: 8 }} py={8} bg={pageBg} minH="100%">
        <Link as={RouterLink} to="/principles" color="blue.600" fontSize="sm" mb={4} display="inline-block">
          ← Back to Principles
        </Link>
        <Heading size="md" color="red.500" mt={4}>
          {error}
        </Heading>
      </Box>
    );
  }

  const leftPanel = (
    <Box>
      <Link as={RouterLink} to="/principles" color="blue.600" fontSize="sm" mb={4} display="inline-block">
        ← Back to Principles
      </Link>
      <Heading mb={2} size={{ base: 'lg', md: 'xl' }} color={headingColor} lineHeight="short">
        {principleText}
      </Heading>
      <Text fontSize="sm" color={subColor} mb={6} fontFamily="mono">
        {formatPrincipleId(principle.id)}
      </Text>
      {PuzzleSelector}
      {SolutionBox}
    </Box>
  );

  const removeLabel = removeTarget?.title || removeTarget?.id || 'this puzzle';

  return (
    <Box px={{ base: 3, md: 8 }} py={8} bg={pageBg} minH="100%">
      {isMobile ? (
        <Stack spacing={6}>
          {leftPanel}
          {ChessboardDisplay}
        </Stack>
      ) : (
        <Flex direction="row" gap={10} align="flex-start" maxW="1600px" mx="auto">
          <Box flex="1" maxW={{ lg: '480px' }}>
            {leftPanel}
          </Box>
          <Box flex="2" position="sticky" top="80px">
            {ChessboardDisplay}
          </Box>
        </Flex>
      )}

      <PuzzleModal
        isOpen={addOpen}
        onClose={onAddClose}
        principleId={principleId}
        onSuccess={handlePuzzleSaved}
      />

      <AlertDialog
        isOpen={removeOpen}
        leastDestructiveRef={cancelRef}
        onClose={onRemoveClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Remove puzzle from principle?
            </AlertDialogHeader>
            <AlertDialogBody>
              Remove <strong>{removeLabel}</strong> from this principle? The puzzle will remain in
              the database but will no longer be linked here.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={onRemoveClose} isDisabled={removing}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleRemoveConfirm} isLoading={removing}>
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}

export default PrincipleDetails;
