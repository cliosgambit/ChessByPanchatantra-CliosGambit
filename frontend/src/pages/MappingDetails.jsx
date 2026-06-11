import React, { useEffect, useState, useCallback } from 'react';
import {
    Box, Heading, Text, Spinner, Flex,
    Button, Wrap, WrapItem, useToast, useColorModeValue,
    Progress,
    Stack, // Added for responsive layout
    useBreakpointValue, // Added for conditional rendering
} from '@chakra-ui/react';
import { useParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
    fetchStoryById,
    fetchStoryMappings,
    fetchPrinciplePosition,
    fetchRatedPuzzlesForPrinciple,
    fetchPuzzleById,
    fetchPuzzleAnswer,
} from '../services/curriculumService';
import ChessGame from './ChessGame';
import { useAuth } from '../AppContext';
import PollOverlay from './PollOverlay';

function shuffleArray(array) {
    // Fisher-Yates shuffle
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

const fetchPuzzleSolution = async (initialFen, depth, ply) => {
    const solutionMoves = [];
    const tempGame = new Chess(initialFen);

    try {
        for (let i = 0; i < ply; i++) {
            if (tempGame.isGameOver()) {
                console.warn("[fetchPuzzleSolution] Game over, stopping analysis early.");
                break;
            }

            const currentFen = tempGame.fen();
            const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(currentFen)}&depth=${Math.min(depth, 15)}`;
            
            const res = await fetch(url);
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`API error on move ${i + 1}: ${res.status} - ${errorText}`);
            }

            const data = await res.json();

            // Correctly parse the "bestmove <move> ponder <move>" string
            if (data.success && data.bestmove && typeof data.bestmove === 'string') {
                const moveParts = data.bestmove.split(' ');
                if (moveParts.length < 2) {
                    throw new Error(`API returned invalid bestmove format on move ${i + 1}: ${data.bestmove}`);
                }
                const bestMoveUci = moveParts[1]; // "e2e4" or "a7a8q"
                
                const moveResult = tempGame.move(bestMoveUci, { sloppy: true });

                if (!moveResult) {
                    throw new Error(`Invalid move '${bestMoveUci}' returned by API for FEN '${currentFen}'.`);
                }
                
                solutionMoves.push({ move: bestMoveUci });

            } else {
                throw new Error(`API did not return a best move on move ${i + 1}. Response: ${JSON.stringify(data)}`);
            }
        }
        
        return solutionMoves;

    } catch (err) {
        console.error("[fetchPuzzleSolution] Network/API fetch error during sequence analysis:", err.message);
        throw err;
    }
};

async function fetchEvaluationAtDepth(fen, depth = 10) {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const data = await res.json();
        if (data.success && typeof data.evaluation === 'number') {
            return { evaluation: data.evaluation, mate: data.mate };
        } else {
            return { error: 'No evaluation' };
        }
    } catch (e) {
        return { error: e.message };
    }
}

function MappingDetails() {
    // --- State Hooks (Unchanged) ---
    const { storyId, mappingId } = useParams();
    const [story, setStory] = useState(null);
    const [mapping, setMapping] = useState(null);
    const [principle, setPrinciple] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const toast = useToast();
    const [originalFen, setOriginalFen] = useState(null);
    const [currentFen, setCurrentFen] = useState(null);
    const [activeSource, setActiveSource] = useState({ type: null, id: null, fen: null });
    const [isPuzzleLoading, setIsPuzzleLoading] = useState(false);
    const [puzzleAnswer, setPuzzleAnswer] = useState('');
    const [showOriginalSolution, setShowOriginalSolution] = useState(false);
    const [fetchedRatedPuzzles, setFetchedRatedPuzzles] = useState([]);
    const [ratedPuzzleSolutionLine, setRatedPuzzleSolutionLine] = useState([]);
    const [isFetchingRatedSolution, setIsFetchingRatedSolution] = useState(false);
    const [showRatedSolution, setShowRatedSolution] = useState(false);
    const [currentFetchingFen, setCurrentFetchingFen] = useState(null);
    const [aiConfig, setAiConfig] = useState({ maxDepth: 10, minDepth: 5 });
    const { user } = useAuth();
    const [pollMoves, setPollMoves] = useState([]); // [{move, evaluation, isAnswer}]
    const [showPoll, setShowPoll] = useState(false);

    // --- [NEW] Responsive Hook ---
    // Use 'lg' breakpoint to give the two-column layout more space
    const isMobile = useBreakpointValue({ base: true, lg: false });

    // --- UI Styling (Unchanged) ---
    const bgBox = useColorModeValue("blue.50", "blue.900");
    const textColor = useColorModeValue("gray.700", "gray.300");
    const gmButtonBg = useColorModeValue("yellow.400", "yellow.600");
    const gmButtonColor = useColorModeValue("gray.800", "whiteAlpha.900");
    const gmButtonBorder = useColorModeValue("yellow.500", "yellow.700");
    const gmButtonHoverBg = useColorModeValue("yellow.500", "yellow.700");
    const activeGmButtonBg = useColorModeValue("yellow.300", "yellow.500");
    const activeGmButtonColor = useColorModeValue("black", "white");
    const activeGmButtonBorder = useColorModeValue("yellow.500", "yellow.600");
    const activeGmButtonBoxShadow = useColorModeValue("0 0 8px rgba(255, 215, 0, 0.7)", "0 0 12px rgba(255, 223, 0, 0.5)");
    const normalButtonBg = useColorModeValue("gray.200", "gray.700");
    const normalButtonColor = useColorModeValue("gray.800", "gray.100");
    const normalButtonBorder = useColorModeValue("gray.300", "gray.600");
    const normalButtonHoverBg = useColorModeValue("gray.300", "gray.600");
    const activeButtonBg = useColorModeValue("teal.500", "teal.400");
    const activeButtonColor = "white";
    const activeButtonBorder = useColorModeValue("teal.500", "teal.400");

    // --- Data Fetching and State Management (Unchanged) ---
    useEffect(() => {
        setLoading(true); setError(null);
        const fetchData = async () => {
            try {
                const [storyRow, mappingRows] = await Promise.all([
                    fetchStoryById(storyId),
                    fetchStoryMappings(storyId),
                ]);
                setStory(storyRow);
                const foundMapping = mappingRows.find(
                    (m) => m.mapping_id.toString() === mappingId.toString()
                );
                if (!foundMapping) throw new Error('Mapping not found');
                setMapping(foundMapping);

                const principleId = foundMapping.principle_id;
                if (principleId) {
                    const [principleRow, ratedPuzzles] = await Promise.all([
                        fetchPrinciplePosition(principleId),
                        fetchRatedPuzzlesForPrinciple(principleId),
                    ]);
                    setPrinciple(principleRow);
                    if (principleRow.fen_with_move) {
                        setOriginalFen(principleRow.fen_with_move);
                        setCurrentFen(principleRow.fen_with_move);
                        setActiveSource({
                            type: 'original_pos',
                            id: 'original_pos',
                            fen: principleRow.fen_with_move,
                        });
                    }
                    setFetchedRatedPuzzles(ratedPuzzles);
                }
            } catch (err) {
                const message = err.message || 'Failed to load page data';
                setError(message);
                toast({
                    title: 'Failed to load page data',
                    description: message,
                    status: 'error',
                    duration: 5100,
                    isClosable: true,
                });
            } finally { setLoading(false); }
        };
        fetchData();
    }, [storyId, mappingId, toast]);

    useEffect(() => {
        let newConfig = { maxDepth: 10, minDepth: 5 };
        if (activeSource.type === 'rated_puzzle') {
            newConfig = { maxDepth: 15, minDepth: 10 };
        }
        setAiConfig(newConfig);
    }, [activeSource]);

    // --- Helper Functions and Handlers (Unchanged) ---
    const getCleanedPuzzleArray = (str) => {
        if (!str || typeof str !== 'string') return [];
        return str.trim().replace(/^\[|\]$/g, '').replace(/'/g, '').split(',').map(p => p.trim()).filter(Boolean);
    };
    const originalPuzzleIdsFromPrinciple = principle ? getCleanedPuzzleArray(principle.puzzle_list) : [];

    const handleOriginalPositionClick = () => {
        if (!originalFen || activeSource.type === 'original_pos') return;
        setCurrentFen(originalFen);
        setActiveSource({ type: 'original_pos', id: 'original_pos', fen: originalFen });
        setPuzzleAnswer(''); setShowOriginalSolution(false);
        setRatedPuzzleSolutionLine([]); setShowRatedSolution(false);
    };

    const handleOriginalPuzzleClick = async (puzzleId) => {
        if (activeSource.id === puzzleId) return;
        setShowPoll(false);
        setPollMoves([]);
        setIsPuzzleLoading(true); setPuzzleAnswer(''); setShowOriginalSolution(false);
        setRatedPuzzleSolutionLine([]); setShowRatedSolution(false);
        try {
            console.log('request sent to mapping page for the poll');
            const puzzle = await fetchPuzzleById(puzzleId);
            const puzzleFen = puzzle?.fen_with_move;
            if (!puzzleFen) throw new Error(`Puzzle ${puzzleId} has no FEN.`);
            setCurrentFen(puzzleFen);
            setActiveSource({ type: 'original_puzzle', id: puzzleId, fen: puzzleFen });
            const answerRes = await fetchPuzzleAnswer(puzzleId);
            setPuzzleAnswer(answerRes.answer || 'No answer available.');
            console.log('request received for the poll');
            if (answerRes.answer) {
                try {
                    const matchMove = answerRes.answer.match(/\b([a-hKQRBN][^\s]*)/i);
                    const answerMove = matchMove ? matchMove[1] : null;
                    const chess = new Chess(puzzleFen);
                    const legalMoves = chess.moves();
                    const match = legalMoves.find(m => m.toLowerCase() === (answerMove || '').toLowerCase());
                    if (match) {
                        const evalPromises = legalMoves.map(move => {
                            const chessCopy = new Chess(puzzleFen);
                            chessCopy.move(move);
                            const newFen = chessCopy.fen();
                            return fetchEvaluationAtDepth(newFen, 10).then(evalResult => ({
                                move,
                                evaluation: evalResult.evaluation,
                                mate: evalResult.mate,
                                error: evalResult.error
                            })).catch(e => {
                                console.error('Error during move evaluation:', e);
                                return { move, evaluation: undefined };
                            });
                        });
                        Promise.all(evalPromises).then(results => {
                            try {
                                const filtered = results.filter(r => r.evaluation !== undefined);
                                const isWhite = chess.turn() === 'w';
                                filtered.sort((a, b) => isWhite ? b.evaluation - a.evaluation : a.evaluation - b.evaluation);
                                const answerEval = filtered.find(r => r.move.toLowerCase() === answerMove.toLowerCase());
                                const topOtherMoves = filtered.filter(r => r.move.toLowerCase() !== answerMove.toLowerCase()).slice(0, 3);
                                if (answerEval) {
                                    let pollOptions = shuffleArray([
                                        { move: answerEval.move, evaluation: answerEval.evaluation, isAnswer: true },
                                        ...topOtherMoves.map(r => ({ move: r.move, evaluation: r.evaluation, isAnswer: false }))
                                    ]);
                                    pollOptions = pollOptions.slice(0, 4);
                                    pollOptions.push({ move: 'None of the above', evaluation: null, isAnswer: false, isNone: true });
                                    if (pollOptions.length === 5) {
                                        console.log('4 moves for poll is ready');
                                        console.log('Poll moves:', pollOptions.slice(0, 4).map(opt => opt.move));
                                    }
                                    setPollMoves(pollOptions);
                                    setShowPoll(false);
                                    if (pollOptions.length === 5) {
                                        console.log('poll enabled !');
                                    }
                                } else if (match) {
                                    // If answerEval not found but answer move is legal, include it with evaluation: null
                                    let pollOptions = shuffleArray([
                                        { move: match, evaluation: null, isAnswer: true },
                                        ...topOtherMoves.map(r => ({ move: r.move, evaluation: r.evaluation, isAnswer: false }))
                                    ]);
                                    pollOptions = pollOptions.slice(0, 4);
                                    pollOptions.push({ move: 'None of the above', evaluation: null, isAnswer: false, isNone: true });
                                    if (pollOptions.length === 5) {
                                        console.log('4 moves for poll is ready');
                                        console.log('Poll moves:', pollOptions.slice(0, 4).map(opt => opt.move));
                                    }
                                    setPollMoves(pollOptions);
                                    setShowPoll(false);
                                    if (pollOptions.length === 5) {
                                        console.log('poll enabled !');
                                    }
                                } else {
                                    setPollMoves([]);
                                    setShowPoll(false);
                                    console.error('Poll error: answer move evaluation not found');
                                }
                            } catch (e) {
                                setPollMoves([]);
                                setShowPoll(false);
                                console.error('Poll error during poll option processing:', e);
                            }
                        }).catch(e => {
                            setPollMoves([]);
                            setShowPoll(false);
                            console.error('Poll error during Promise.all:', e);
                        });
                    } else {
                        setPollMoves([]);
                        setShowPoll(false);
                        console.error('Poll error: answer move does not match legal moves');
                    }
                } catch (e) {
                    setPollMoves([]);
                    setShowPoll(false);
                    console.error('Poll error during answer move extraction or matching:', e);
                }
            } else {
                setPollMoves([]);
                setShowPoll(false);
                console.error('Poll error: no answer found');
            }
        } catch (err) {
            toast({ title: "Error Loading Puzzle", description: err.message, status: 'error' });
            if (originalFen) { handleOriginalPositionClick(); }
            console.error('Poll error: main try/catch', err);
        } finally { setIsPuzzleLoading(false); }
    };

    const fetchBestMoveSequence = useCallback(async (initialRatedFen) => {
        if (!initialRatedFen || currentFetchingFen === initialRatedFen) return;
        setIsFetchingRatedSolution(true);
        setCurrentFetchingFen(initialRatedFen);
        setRatedPuzzleSolutionLine([]);
        try {
            const depthPerMove = 15;
            const numPly = 28; 
            
            const solutionMoveObjects = await fetchPuzzleSolution(initialRatedFen, depthPerMove, numPly);

            const gameInstance = new Chess(initialRatedFen);
            const sanMoves = solutionMoveObjects.map(moveInfo => {
                const moveResult = gameInstance.move(moveInfo.move, { sloppy: true });
                return moveResult ? moveResult.san : `(${moveInfo.move})`;
            });
            
            if (sanMoves.length === 0) {
                throw new Error("Analysis returned no valid moves.");
            }
            
            setRatedPuzzleSolutionLine(sanMoves);
            toast({ title: "GM Analysis Complete", status: "success", duration: 3000, isClosable: true });
        } catch (error) {
            setRatedPuzzleSolutionLine([`Error: ${error.message}`]);
            toast({ title: "Error during analysis", description: error.message, status: "error", duration: 5100, isClosable: true });
        } finally {
            setIsFetchingRatedSolution(false);
            setCurrentFetchingFen(null);
        }
    }, [currentFetchingFen, toast]);

    const handleRatedPuzzleClick = async (ratedPuzzleObject, index) => {
        const fenValue = ratedPuzzleObject.Fen;
        if (!fenValue) return;
        const ratedPuzzleId = `rated-${index}-${fenValue.substring(0,10)}`;
        if (activeSource.id === ratedPuzzleId) return;
        setCurrentFen(fenValue);
        setActiveSource({ type: 'rated_puzzle', id: ratedPuzzleId, fen: fenValue });
        setPuzzleAnswer(''); setShowOriginalSolution(false);
        setShowRatedSolution(false); setRatedPuzzleSolutionLine([]);
        toast({ title: `Loaded GM Position ${index + 1}`, description: "Fetching analysis...", status: 'info', duration: 2000 });
        fetchBestMoveSequence(fenValue);
        // For coach: log all possible moves and their evaluation at depth 10
        if (user?.role === 'coach') {
            const chess = new Chess(fenValue);
            const moves = chess.moves();
            const isWhite = chess.turn() === 'w';
            const evalPromises = moves.map(move => {
                const chessCopy = new Chess(fenValue);
                chessCopy.move(move);
                const newFen = chessCopy.fen();
                return fetchEvaluationAtDepth(newFen, 10).then(evalResult => ({
                    move,
                    evaluation: evalResult.evaluation,
                    mate: evalResult.mate,
                    error: evalResult.error
                }));
            });
            Promise.all(evalPromises).then(results => {
                // Filter out moves with no evaluation
                const filtered = results.filter(r => r.evaluation !== undefined);
                // Sort by evaluation (best for the player to move)
                filtered.sort((a, b) => isWhite ? b.evaluation - a.evaluation : a.evaluation - b.evaluation);
                // Take top 4
                const topMoves = filtered.slice(0, 4);
                topMoves.forEach(r => {
                    console.log(`[Coach] Move: ${r.move}, Evaluation: ${r.evaluation}`);
                });
            });
        }
    };

    if (loading) return <Box p={8} textAlign="center"><Spinner size="xl" /></Box>;
    if (error && !story) return <Box p={8} textAlign="center" color="red.500"><Heading size="md">Error</Heading><Text>{error}</Text></Box>;
    
    // --- [NEW] Reusable UI Blocks ---
    const StoryHeader = (
        <Box>
            {story && <Heading mb={3} size={{ base: 'lg', md: 'xl' }}>{story.title}</Heading>}
            {story && <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.500" mb={6}>{story.description}</Text>}
        </Box>
    );

    const InfoAndPrincipleBoxes = (
        <>
            {mapping && (<Box p={4} bg={bgBox} borderRadius="md" mb={6}><Heading size="sm" mb={2} color="blue.700">Story Message</Heading><Text color={textColor}>{mapping.story_text}</Text></Box>)}
            {principle && (<Box p={4} bg={bgBox} borderRadius="md" mb={6}><Heading size="sm" mb={2} color="blue.700">Principle</Heading><Text color={textColor}>{principle.principle}</Text></Box>)}
        </>
    );

    const PuzzleControls = (
        <Box p={4} bg={bgBox} borderRadius="md" mb={6}>
            <Heading size="xs" mb={3} textTransform="uppercase" color="blue.600">Positions & Puzzles</Heading>
            <Wrap spacing={3}>
                {originalFen && (
                    <WrapItem>
                        <Button size="sm" bg={activeSource.type === 'original_pos' ? activeButtonBg : normalButtonBg} color={activeSource.type === 'original_pos' ? activeButtonColor : normalButtonColor} borderColor={activeSource.type === 'original_pos' ? activeButtonBorder : normalButtonBorder} borderWidth="1px" _hover={{ bg: activeSource.type === 'original_pos' ? activeButtonBg : normalButtonHoverBg }} onClick={handleOriginalPositionClick}>Position</Button>
                    </WrapItem>
                )}
                {originalPuzzleIdsFromPrinciple.map((puzzleId, index) => (
                    <WrapItem key={`original-${puzzleId}`}>
                        <Button size="sm" bg={activeSource.id === puzzleId ? activeButtonBg : normalButtonBg} color={activeSource.id === puzzleId ? activeButtonColor : normalButtonColor} borderColor={activeSource.id === puzzleId ? activeButtonBorder : normalButtonBorder} borderWidth="1px" _hover={{ bg: activeSource.id === puzzleId ? activeButtonBg : normalButtonHoverBg }} onClick={() => handleOriginalPuzzleClick(puzzleId)} isLoading={isPuzzleLoading && activeSource.id === puzzleId} isDisabled={isPuzzleLoading}>
                            {index + 1}
                        </Button>
                    </WrapItem>
                ))}
                {fetchedRatedPuzzles.map((ratedPuzzle, index) => {
                    const ratedPuzzleId = `rated-${index}-${ratedPuzzle.Fen?.substring(0,10)}`;
                    const isActive = activeSource.id === ratedPuzzleId;
                    return (
                        <WrapItem key={`rated-${index}`}>
                                                        <Button size="sm" bg={isActive ? activeGmButtonBg : gmButtonBg} color={isActive ? activeGmButtonColor : gmButtonColor} borderColor={isActive ? activeGmButtonBorder : gmButtonBorder} borderWidth="1px" boxShadow={isActive ? activeGmButtonBoxShadow : "none"} _hover={{ bg: gmButtonHoverBg, boxShadow: isActive ? activeGmButtonBoxShadow : "md" }} onClick={() => handleRatedPuzzleClick(ratedPuzzle, index)}>
                                GM-{index + 1}
                            </Button>
                        </WrapItem>
                    );
                })}
            </Wrap>
        </Box>
    );


    const SolutionBoxes = (
        <Box mt={4}> {/* Added margin-top to space it from the board in mobile view */}
            {activeSource.type === 'original_puzzle' && puzzleAnswer && (
                <Box p={4} bg="green.50" borderRadius="md" mb={4}>
                    <Heading size="sm" mb={3} color="green.700">Puzzle Solution</Heading>
                    {!showOriginalSolution ? (<Button size="sm" colorScheme="teal" onClick={() => setShowOriginalSolution(true)}>Show Solution</Button>)
                        : (<Text mt={3} color="green.800" whiteSpace="pre-wrap">{puzzleAnswer}</Text>)}
                </Box>
            )}
            {activeSource.type === 'rated_puzzle' && (
                <Box p={4} bg="purple.50" borderRadius="md" mb={4}>
                    <Heading size="sm" mb={3} color="purple.700">GM Position Analysis</Heading>
                    {isFetchingRatedSolution && (<Flex direction="column" align="center"><Spinner color="purple.500" mb={2}/><Text fontSize="sm" color="purple.600">Analyzing...</Text><Progress size="xs" isIndeterminate colorScheme="purple" width="80%" mt={1} /></Flex>)}
                    {!isFetchingRatedSolution && ratedPuzzleSolutionLine.length > 0 && (
                        <>
                            {!showRatedSolution ? (<Button size="sm" colorScheme="purple" onClick={() => setShowRatedSolution(true)}>Show Analysis</Button>)
                                : (<Text mt={3} color="purple.800" whiteSpace="pre-wrap">{ratedPuzzleSolutionLine.map((move, idx) => (<React.Fragment key={idx}>{idx > 0 && (idx % 2 === 0 ? <br /> : " ")}{idx % 2 === 0 && `${Math.floor(idx/2) + 1}. `}{move}</React.Fragment>))}</Text>)}
                        </>
                    )}
                    {!isFetchingRatedSolution && ratedPuzzleSolutionLine.length === 0 && activeSource.fen && (
                         <Text fontSize="sm" color="purple.600">Analysis not started or no moves found.</Text>
                    )}
                </Box>
            )}
        </Box>
    );
    
    const ChessboardDisplay = (
        // Responsive width and auto margin for centering on mobile
        <Box w={{ base: "90%", lg: "100%" }} mx={{ base: "auto", lg: "0" }}>
            {isPuzzleLoading ?
                // Adjusted min-height for mobile
                (<Flex minH={{base: "320px", md:"480px"}} align="center" justify="center" bg="gray.100" borderRadius="md"><Spinner size="xl" /></Flex>)
                : currentFen ? (
                    <ChessGame 
                        key={`${activeSource.type}-${activeSource.id}`} 
                        initialFen={currentFen} 
                        maxDepth={aiConfig.maxDepth}
                        minDepth={aiConfig.minDepth}
                    />
                )
                : (<Flex minH={{base: "320px", md:"480px"}} align="center" justify="center" bg="gray.100" borderRadius="md"><Text color="gray.500">Select a position</Text></Flex>)
            }
        </Box>
    );

    return (
        <Box px={{ base: 3, md: 8 }} py={8} position="relative">
            {/* Poll Button and Overlay */}
            <Box position="absolute" top={4} right={4} zIndex={2000}>
                {pollMoves.length >= 4 && !showPoll && (
                    <Button colorScheme="purple" size="sm" onClick={() => setShowPoll(true)}>
                        Show Poll
                    </Button>
                )}
            </Box>
            <PollOverlay pollMoves={pollMoves} showPoll={showPoll} setShowPoll={setShowPoll} />
            {isMobile ? (
                // --- NEW MOBILE LAYOUT ---
                // Reordered to place chessboard and solutions at the end.
                <Stack spacing={6}>
                    {StoryHeader}
                    {InfoAndPrincipleBoxes}
                    {PuzzleControls}
                    {ChessboardDisplay}
                    {SolutionBoxes}
                </Stack>
            ) : (
                // --- DESKTOP LAYOUT ---
                // Added a maxW and mx="auto" here to control width on large screens
                <Flex direction="row" gap={10} align="flex-start" maxW="1600px" mx="auto">
                    <Box flex={{ base: "1", lg: "1.2" }} maxW={{lg: "600px"}}>
                        {StoryHeader}
                        {InfoAndPrincipleBoxes}
                        {PuzzleControls}
                        {SolutionBoxes}
                    </Box>
                    <Box flex={{ base: "1", lg: "1.5" }} position="sticky" top="80px">
                        {ChessboardDisplay}
                    </Box>
                </Flex>
            )}
        </Box>
    );
}

export default MappingDetails;