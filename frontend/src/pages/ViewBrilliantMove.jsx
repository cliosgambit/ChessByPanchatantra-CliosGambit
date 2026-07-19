import React, { useEffect, useMemo, useState } from 'react';
import { FiExternalLink, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BrilliantMoveBoardView from '../components/brilliantMoves/BrilliantMoveBoardView';
import BrilliantMoveVerificationBar from '../components/brilliantMoves/BrilliantMoveVerificationBar';
import FenHoverPreview from '../components/userProfile/FenHoverPreview';
import {
  fetchBrilliantMoveFromDb,
  fetchBrilliantMovesFromDb,
  fetchChessComGameMovesFromDb,
} from '../services/chessComDbService';
import {
  brilliantMoveDetailPath,
  filterBrilliantMoveRows,
  resolveBrilliantDayFilter,
  resolveBrilliantFilter,
  resolveReviewFilter,
} from '../utils/brilliantMovesFilters';
import './ViewBrilliantMove.css';

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(2);
}

function formatPieceLabel(pieceType) {
  if (!pieceType || pieceType === '—') return null;
  const text = String(pieceType).trim();
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function ViewBrilliantMove() {
  const navigate = useNavigate();
  const { moveId } = useParams();
  const [searchParams] = useSearchParams();
  const [move, setMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [gameList, setGameList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showMove, setShowMove] = useState(false);

  const navFilters = useMemo(
    () => ({
      day: resolveBrilliantDayFilter(searchParams),
      review: resolveReviewFilter(searchParams),
      brilliant: resolveBrilliantFilter(searchParams),
    }),
    [searchParams]
  );

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

  const filteredGameList = useMemo(
    () =>
      filterBrilliantMoveRows(gameList, {
        dayFilter: navFilters.day,
        reviewFilter: navFilters.review,
        brilliantFilter: navFilters.brilliant,
      }),
    [gameList, navFilters]
  );

  const gameNav = useMemo(() => {
    const currentIndex = filteredGameList.findIndex(
      (row) => String(row.id) === String(moveId)
    );
    if (currentIndex < 0) return { prevId: null, nextId: null, positionLabel: null };
    return {
      prevId: currentIndex > 0 ? filteredGameList[currentIndex - 1].id : null,
      nextId:
        currentIndex < filteredGameList.length - 1
          ? filteredGameList[currentIndex + 1].id
          : null,
      positionLabel: `${currentIndex + 1} / ${filteredGameList.length}`,
    };
  }, [filteredGameList, moveId]);

  const goToGame = (id) => {
    if (id != null) navigate(brilliantMoveDetailPath(id, navFilters));
  };

  useEffect(() => {
    let cancelled = false;
    setShowMove(false);

    async function load() {
      setLoading(true);
      setError(null);
      setMoveHistory([]);
      try {
        const data = await fetchBrilliantMoveFromDb(moveId);
        if (cancelled) return;
        setMove(data);

        if (data?.chessComId && data?.uuid) {
          setHistoryLoading(true);
          try {
            const historyData = await fetchChessComGameMovesFromDb(
              data.chessComId,
              data.uuid
            );
            if (!cancelled) setMoveHistory(historyData.moves || []);
          } catch {
            if (!cancelled) setMoveHistory([]);
          } finally {
            if (!cancelled) setHistoryLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load brilliant move.');
          setMove(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [moveId]);

  if (loading) {
    return (
      <div className="brilliant-view-page">
        <div className="brilliant-view-side">
          <p className="brilliant-view-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !move) {
    return (
      <div className="brilliant-view-page">
        <div className="brilliant-view-side">
          <p className="brilliant-view-error">{error || 'Brilliant move not found.'}</p>
        </div>
      </div>
    );
  }

  const sacrificedPiece = formatPieceLabel(move.sacrificedPieceType);
  const sacrificedSquare = move.sacrificedPieceSquare
    ? String(move.sacrificedPieceSquare).toUpperCase()
    : null;
  const positionFen = move.fenBeforeMove || move.fenAfterMove;
  const boardOrientation = move.turn === 'white' ? 'white' : 'black';

  return (
    <div className="brilliant-view-page">
      <BrilliantMoveVerificationBar move={move} />

      <aside className="brilliant-view-side">

        <h1 className="brilliant-view-title">Brilliant Move #{move.id}</h1>
        <p className="brilliant-view-sub">
          {[move.classification, move.playerRating != null ? `R${move.playerRating}` : null, move.playedDate]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <section className="brilliant-view-card">
          <h2>Game</h2>
          <p>{move.players || '—'}</p>
          <p className="brilliant-view-muted">
            {[move.timeControl, move.playedDate].filter(Boolean).join(' · ')}
          </p>
          {move.gameUrl ? (
            <a href={move.gameUrl} target="_blank" rel="noreferrer">
              Open on Chess.com <FiExternalLink aria-hidden />
            </a>
          ) : null}
        </section>

        <section className="brilliant-view-card">
          <h2>Details</h2>
          <dl className="brilliant-view-dl">
            <div>
              <dt>Turn</dt>
              <dd>{move.turn === 'white' ? 'White' : 'Black'}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{move.classification || '—'}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{move.sacType && move.sacType !== '—' ? move.sacType : '—'}</dd>
            </div>
            <div>
              <dt>Sacrifice</dt>
              <dd>
                {sacrificedPiece
                  ? sacrificedSquare
                    ? `${sacrificedPiece} on ${sacrificedSquare}`
                    : sacrificedPiece
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{formatScore(move.brillianceScore)}</dd>
            </div>
          </dl>

          {positionFen ? (
            <div className="brilliant-view-position">
              <p className="brilliant-view-position-label">Position</p>
              <FenHoverPreview
                fen={positionFen}
                uciMove={move.uciMove}
                orientation={boardOrientation}
                boardId={`brilliant-view-position-${move.id}`}
                boardSize={180}
                brilliantHighlight
                showBoardNotation
              />
              <p className="brilliant-view-muted brilliant-view-fen" title={positionFen}>
                {positionFen}
              </p>
            </div>
          ) : null}
        </section>

        <section className="brilliant-view-card">
          <h2>Brilliant move</h2>
          {!showMove ? (
            <button type="button" className="brilliant-view-btn" onClick={() => setShowMove(true)}>
              Show move
            </button>
          ) : (
            <p className="brilliant-view-san">
              {move.sanMove}
              {move.uciMove ? <span> · {move.uciMove}</span> : null}
            </p>
          )}
        </section>

        <section className="brilliant-view-card">
          <h2>Browse</h2>
          <div className="brilliant-view-browse">
            <button
              type="button"
              className="brilliant-view-btn brilliant-view-btn--ghost"
              onClick={() => goToGame(gameNav.prevId)}
              disabled={gameNav.prevId == null}
            >
              <FiChevronLeft aria-hidden /> Prev
            </button>
            <button
              type="button"
              className="brilliant-view-btn"
              onClick={() => goToGame(gameNav.nextId)}
              disabled={gameNav.nextId == null}
            >
              Next <FiChevronRight aria-hidden />
            </button>
          </div>
          {gameNav.positionLabel ? (
            <p className="brilliant-view-muted">{gameNav.positionLabel}</p>
          ) : null}
        </section>
      </aside>

      <main className="brilliant-view-main">
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
      </main>
    </div>
  );
}

export default ViewBrilliantMove;
