import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDisclosure, useToast } from '@chakra-ui/react';
import { FiArrowLeft, FiEdit2, FiEye, FiEyeOff, FiShuffle, FiBarChart2 } from 'react-icons/fi';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import ChroniclesPuzzleBoard from '../components/chronicles/ChroniclesPuzzleBoard';
import ChroniclesEditPuzzleModal from '../components/chronicles/ChroniclesEditPuzzleModal';
import {
  fetchChessPuzzleById,
  pickRandomUnusedChessPuzzle,
  updatePuzzle,
} from '../services/puzzleService';
import {
  fetchPollResponsesForPuzzle,
  savePollResponse,
  summarizePollResponses,
} from '../services/puzzlePollService';
import { buildPollOptionsForPuzzle } from '../utils/puzzlePollUtils';
import './ChroniclesChessPuzzlePage.css';

function formatMoveHistoryLines(moves) {
  const lines = [];
  for (let index = 0; index < moves.length; index += 2) {
    const moveNumber = Math.floor(index / 2) + 1;
    const white = moves[index] || '';
    const black = moves[index + 1] || '';
    lines.push({ moveNumber, white, black });
  }
  return lines;
}

function ChroniclesChessPuzzlePage() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editModal = useDisclosure();

  const [puzzle, setPuzzle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [boardResetKey, setBoardResetKey] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [pollOptions, setPollOptions] = useState([]);
  const [pollLoading, setPollLoading] = useState(false);
  const [pollVisible, setPollVisible] = useState(false);
  const [pollResponses, setPollResponses] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [puzzleRow, responses] = await Promise.all([
        fetchChessPuzzleById(puzzleId),
        fetchPollResponsesForPuzzle(puzzleId).catch(() => []),
      ]);
      setPuzzle(puzzleRow);
      setPollResponses(responses);
      setShowAnswer(false);
      setPollOptions([]);
      setPollVisible(false);
      setBoardResetKey((value) => value + 1);
    } catch (err) {
      setError(err.message || 'Failed to load puzzle.');
      setPuzzle(null);
    } finally {
      setLoading(false);
    }
  }, [puzzleId]);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  const pollSummary = useMemo(() => summarizePollResponses(pollResponses), [pollResponses]);
  const historyLines = useMemo(() => formatMoveHistoryLines(moveHistory), [moveHistory]);

  const handleMoveHistoryChange = useCallback((moves) => {
    setMoveHistory(moves);
  }, []);

  const handleNextUnused = async () => {
    const nextPuzzle = await pickRandomUnusedChessPuzzle(puzzleId);
    if (!nextPuzzle) {
      toast({
        title: 'No unused puzzles left',
        status: 'info',
        duration: 2500,
      });
      return;
    }
    navigate(`/chronicles/puzzles/chess/${encodeURIComponent(nextPuzzle.chess_puzzle_id)}`);
  };

  const handleGetPoll = async () => {
    if (!puzzle?.fen_with_move) {
      toast({
        title: 'Poll unavailable',
        description: 'This puzzle needs a valid FEN.',
        status: 'warning',
        duration: 2500,
      });
      return;
    }

    setPollLoading(true);
    try {
      const options = await buildPollOptionsForPuzzle(puzzle.fen_with_move);
      setPollOptions(options);
      setPollVisible(true);
    } catch (err) {
      toast({
        title: 'Could not build poll',
        description: err.message,
        status: 'error',
        duration: 3500,
      });
    } finally {
      setPollLoading(false);
    }
  };

  const handlePollSelect = async (option) => {
    if (!puzzle?.chess_puzzle_id) return;

    const isCorrect = Boolean(option.isAnswer);
    try {
      const saved = await savePollResponse({
        puzzleId: puzzle.chess_puzzle_id,
        selectedMove: option.move,
        isCorrect,
        pollOptions,
      });
      setPollResponses((prev) => [saved, ...prev]);
      toast({
        title: isCorrect ? 'Correct move' : 'Recorded',
        description: isCorrect ? 'You picked the best move.' : `You selected ${option.move}.`,
        status: isCorrect ? 'success' : 'info',
        duration: 2500,
      });
    } catch (err) {
      toast({
        title: 'Failed to save poll answer',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    }
  };

  const handleSaveEdit = async (payload) => {
    setSaving(true);
    try {
      await updatePuzzle(puzzleId, payload);
      toast({ title: 'Puzzle updated', status: 'success', duration: 2000 });
      editModal.onClose();
      await loadPuzzle();
    } catch (err) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="chronicles-puzzle-page">
        <LoadingPanel message="Loading puzzle…" />
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div className="chronicles-puzzle-page">
        <ErrorPanel title="Puzzle unavailable" message={error || 'Not found.'} onRetry={loadPuzzle} />
      </div>
    );
  }

  return (
    <div className="chronicles-puzzle-page">
      <header className="chronicles-puzzle-page-header">
        <button
          type="button"
          className="chronicles-back-btn"
          onClick={() => navigate('/chronicles?tab=puzzles')}
        >
          <FiArrowLeft aria-hidden />
          Back to Chronicles
        </button>
        <div>
          <h1 className="chronicles-puzzle-page-title">{puzzle.chess_puzzle_id}</h1>
          <p className="chronicles-puzzle-page-subtitle">Chess puzzle workspace</p>
        </div>
      </header>

      <div className="chronicles-puzzle-workspace">
        <aside className="chronicles-puzzle-meta">
          <h2 className="chronicles-puzzle-meta-title">Puzzle details</h2>

          <dl className="chronicles-puzzle-meta-list">
            <div>
              <dt>Puzzle ID</dt>
              <dd>{puzzle.chess_puzzle_id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={`dashboard-status-pill dashboard-status-pill--${
                    puzzle.isUsed ? 'completed' : 'progress'
                  }`}
                >
                  {puzzle.isUsed ? 'Used' : 'Not used'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Principle</dt>
              <dd>{puzzle.principleLabel || '—'}</dd>
            </div>
            <div>
              <dt>Module</dt>
              <dd>{puzzle.moduleLabel}</dd>
            </div>
            <div>
              <dt>Chapter</dt>
              <dd>{puzzle.chapterLabel}</dd>
            </div>
            <div>
              <dt>Story</dt>
              <dd>{puzzle.storyLabel}</dd>
            </div>
            <div>
              <dt>Poll responses</dt>
              <dd>
                {pollSummary.total} total · {pollSummary.correct} correct
              </dd>
            </div>
          </dl>

          <div className="chronicles-puzzle-actions">
            <button type="button" className="chronicles-secondary-btn" onClick={handleNextUnused}>
              <FiShuffle aria-hidden />
              Next unused random
            </button>
            <button type="button" className="chronicles-secondary-btn" onClick={editModal.onOpen}>
              <FiEdit2 aria-hidden />
              Edit puzzle
            </button>
            <button
              type="button"
              className="chronicles-secondary-btn"
              onClick={() => setShowAnswer((value) => !value)}
            >
              {showAnswer ? <FiEyeOff aria-hidden /> : <FiEye aria-hidden />}
              {showAnswer ? 'Hide answer' : 'Show answer'}
            </button>
            <button
              type="button"
              className="chronicles-primary-btn"
              onClick={handleGetPoll}
              disabled={pollLoading}
            >
              <FiBarChart2 aria-hidden />
              {pollLoading ? 'Building poll…' : 'Get poll options'}
            </button>
          </div>

          {showAnswer ? (
            <div className="chronicles-puzzle-answer-box">
              <strong>Answer</strong>
              <p>{puzzle.answer || 'No answer stored.'}</p>
            </div>
          ) : null}

          {pollVisible && pollOptions.length >= 2 ? (
            <div className="chronicles-puzzle-poll-box">
              <h3>Which is the best move?</h3>
              <p className="chronicles-puzzle-poll-note">Top 4 moves by Stockfish evaluation (shuffled)</p>
              {pollOptions.map((option) => (
                <button
                  key={option.move}
                  type="button"
                  className="chronicles-puzzle-poll-option"
                  onClick={() => handlePollSelect(option)}
                >
                  {option.move}
                  {option.evaluation != null ? (
                    <span className="chronicles-puzzle-poll-eval">
                      {option.evaluation > 0 ? '+' : ''}
                      {(option.evaluation / 100).toFixed(2)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <div className="chronicles-puzzle-center">
          <ChroniclesPuzzleBoard
            initialFen={puzzle.fen_with_move}
            onMoveHistoryChange={handleMoveHistoryChange}
            resetKey={boardResetKey}
          />
        </div>

        <aside className="chronicles-puzzle-history">
          <h2 className="chronicles-puzzle-history-title">Move history</h2>
          <div className="chronicles-puzzle-history-scroll">
            {historyLines.length === 0 ? (
              <p className="chronicles-puzzle-history-empty">Play a move on the board to begin.</p>
            ) : (
              <table className="chronicles-puzzle-history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>White</th>
                    <th>Black</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLines.map((line) => (
                    <tr key={line.moveNumber}>
                      <td>{line.moveNumber}.</td>
                      <td>{line.white}</td>
                      <td>{line.black}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>

      <ChroniclesEditPuzzleModal
        isOpen={editModal.isOpen}
        onClose={editModal.onClose}
        puzzle={puzzle}
        onSave={handleSaveEdit}
        saving={saving}
      />
    </div>
  );
}

export default ChroniclesChessPuzzlePage;
