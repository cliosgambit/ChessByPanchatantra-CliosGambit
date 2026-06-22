import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import PuzzleBoardView from '../components/puzzles/PuzzleBoardView';
import {
  fetchBrilliantPuzzleFromDb,
  fetchBrilliantPuzzlesFromDb,
} from '../services/chessComDbService';
import '../components/userProfile/ChessComProfilePage.css';
import './ViewBrilliantMove.css';
import './ViewPuzzle.css';

function ViewPuzzle() {
  const navigate = useNavigate();
  const { puzzleId } = useParams();
  const [puzzle, setPuzzle] = useState(null);
  const [puzzleList, setPuzzleList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPuzzleList() {
      try {
        const data = await fetchBrilliantPuzzlesFromDb({ limit: 2000 });
        if (!cancelled) setPuzzleList(data.rows || []);
      } catch {
        if (!cancelled) setPuzzleList([]);
      }
    }

    loadPuzzleList();
    return () => {
      cancelled = true;
    };
  }, []);

  const puzzleNav = useMemo(() => {
    const currentIndex = puzzleList.findIndex((row) => String(row.id) === String(puzzleId));
    if (currentIndex < 0) {
      return { prevId: null, nextId: null, positionLabel: null };
    }

    return {
      prevId: currentIndex > 0 ? puzzleList[currentIndex - 1].id : null,
      nextId: currentIndex < puzzleList.length - 1 ? puzzleList[currentIndex + 1].id : null,
      positionLabel: `Puzzle ${currentIndex + 1} of ${puzzleList.length}`,
    };
  }, [puzzleList, puzzleId]);

  const goToPuzzle = (id) => {
    if (id != null) navigate(`/puzzles/${id}`);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBrilliantPuzzleFromDb(puzzleId);
        if (!cancelled) setPuzzle(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load puzzle.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [puzzleId]);

  return (
    <Box className="chess-profile-page">
      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card view-brilliant-move-page-header">
          <button
            type="button"
            className="chess-btn-secondary view-brilliant-move-back"
            onClick={() => navigate('/puzzles')}
          >
            <FiArrowLeft />
            <span>Back to Puzzles</span>
          </button>
        </div>
      </div>

      <div className="chess-profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <main className="chess-profile-main">
          <section className="chess-profile-panel view-brilliant-move-panel">
            <div className="chess-profile-panel-body view-brilliant-move-body">
              {loading ? (
                <LoadingPanel message="Loading puzzle..." />
              ) : error ? (
                <ErrorPanel title="Unable to load puzzle" message={error} />
              ) : (
                <PuzzleBoardView
                  puzzle={puzzle}
                  prevPuzzleId={puzzleNav.prevId}
                  nextPuzzleId={puzzleNav.nextId}
                  positionLabel={puzzleNav.positionLabel}
                  onPrevPuzzle={() => goToPuzzle(puzzleNav.prevId)}
                  onNextPuzzle={() => goToPuzzle(puzzleNav.nextId)}
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </Box>
  );
}

export default ViewPuzzle;
