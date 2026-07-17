import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingPanel from '../components/common/LoadingPanel';
import ErrorPanel from '../components/common/ErrorPanel';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import BrilliantMoveBoardView from '../components/brilliantMoves/BrilliantMoveBoardView';
import BrilliantMoveVerificationBar from '../components/brilliantMoves/BrilliantMoveVerificationBar';
import {
  fetchBrilliantMoveFromDb,
  fetchBrilliantMovesFromDb,
  fetchChessComGameMovesFromDb,
} from '../services/chessComDbService';
import '../components/userProfile/ChessComProfilePage.css';
import './ViewBrilliantMove.css';

function ViewBrilliantMove() {
  const navigate = useNavigate();
  const { moveId } = useParams();
  const [move, setMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [gameList, setGameList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGameList() {
      try {
        const data = await fetchBrilliantMovesFromDb({ limit: 1000 });
        if (!cancelled) setGameList(data.rows || []);
      } catch {
        if (!cancelled) setGameList([]);
      }
    }

    loadGameList();
    return () => {
      cancelled = true;
    };
  }, []);

  const gameNav = useMemo(() => {
    const currentIndex = gameList.findIndex((row) => String(row.id) === String(moveId));
    if (currentIndex < 0) {
      return { prevId: null, nextId: null, positionLabel: null };
    }

    return {
      prevId: currentIndex > 0 ? gameList[currentIndex - 1].id : null,
      nextId:
        currentIndex < gameList.length - 1 ? gameList[currentIndex + 1].id : null,
      positionLabel: `Game ${currentIndex + 1} of ${gameList.length}`,
    };
  }, [gameList, moveId]);

  const goToGame = (id) => {
    if (id != null) navigate(`/brilliant-moves/${id}`);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBrilliantMoveFromDb(moveId);
        if (cancelled) return;
        setMove(data);

        if (data?.chessComId && data?.uuid) {
          setHistoryLoading(true);
          try {
            const historyData = await fetchChessComGameMovesFromDb(data.chessComId, data.uuid);
            if (!cancelled) setMoveHistory(historyData.moves || []);
          } catch {
            if (!cancelled) setMoveHistory([]);
          } finally {
            if (!cancelled) setHistoryLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load brilliant move.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [moveId]);

  return (
    <Box className="chess-profile-page">
      {!loading && !error && move && <BrilliantMoveVerificationBar move={move} />}

      <div className="chess-profile-header-wrap">
        <div className="chess-profile-header-card view-brilliant-move-page-header">
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', to: '/dashboard' },
              { label: 'Brilliant Moves', to: '/brilliant-moves' },
              { label: moveId ? `Move #${moveId}` : 'Move' },
            ]}
          />
        </div>
      </div>

      <div className="chess-profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <main className="chess-profile-main">
          <section className="chess-profile-panel view-brilliant-move-panel">
            <div className="chess-profile-panel-body view-brilliant-move-body">
              {loading ? (
                <LoadingPanel message="Loading brilliant move..." />
              ) : error ? (
                <ErrorPanel title="Unable to load brilliant move" message={error} />
              ) : (
                <BrilliantMoveBoardView
                  move={move}
                  moveHistory={moveHistory}
                  historyLoading={historyLoading}
                  prevGameId={gameNav.prevId}
                  nextGameId={gameNav.nextId}
                  gamePositionLabel={gameNav.positionLabel}
                  onPrevGame={() => goToGame(gameNav.prevId)}
                  onNextGame={() => goToGame(gameNav.nextId)}
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </Box>
  );
}

export default ViewBrilliantMove;
