import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi';
import CustomGamePage from './test/CustomGamePage';
import { fetchChessComGameFromDb } from '../services/chessComDbService';
import { loadChessComGame } from '../utils/chessComGameNavigation';
import { sanitizeChessComPgn } from '../utils/chessComPgnUtils';
import '../components/userProfile/ChessComGamePage.css';

const TIME_CLASS_ICONS = {
  bullet: '/chess-icons/bullet.svg',
  blitz: '/chess-icons/blitz.svg',
  rapid: '/chess-icons/rapid.svg',
  daily: '/chess-icons/daily.svg',
};

function timeClassLabel(timeClass) {
  if (!timeClass) return 'Game';
  return timeClass.charAt(0).toUpperCase() + timeClass.slice(1);
}

function ChessComGamePage() {
  const { userId, gameId } = useParams();
  const navigate = useNavigate();
  const profileUsername = decodeURIComponent(userId || '');
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setLoading(true);
      setError(null);
      try {
        const fromDb = await fetchChessComGameFromDb(profileUsername, gameId);
        if (!cancelled && fromDb) {
          setGame(fromDb);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          const cached = loadChessComGame(profileUsername, gameId);
          if (cached) {
            setGame(cached);
            return;
          }
          setError(err.message || 'Game not found.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGame();
    return () => {
      cancelled = true;
    };
  }, [profileUsername, gameId]);

  const playerOverride = useMemo(() => {
    if (!game) return null;
    return {
      white: game.white || game.whiteUsername || 'White',
      black: game.black || game.blackUsername || 'Black',
      whiteRating: game.whiteRating ?? null,
      blackRating: game.blackRating ?? null,
    };
  }, [game]);

  const defaultOrientation = useMemo(() => {
    if (!game || !profileUsername) return 'white';
    const self = String(profileUsername).toLowerCase();
    const black = String(game.black || game.blackUsername || '').toLowerCase();
    if (game.isWhite === false || black === self) return 'black';
    return 'white';
  }, [game, profileUsername]);

  const initialPgn = useMemo(() => {
    if (!game?.pgn) return null;
    return sanitizeChessComPgn(game.pgn);
  }, [game?.pgn]);

  if (loading) {
    return (
      <div className="chess-game-page">
        <div className="chess-game-page-inner">
          <div className="chess-game-page-empty">Loading game…</div>
        </div>
      </div>
    );
  }

  if (!game || !initialPgn) {
    return (
      <div className="chess-game-page">
        <div className="chess-game-page-inner">
          <header className="chess-game-page-topbar">
            <button
              type="button"
              className="chess-game-topbar-btn"
              onClick={() => navigate(`/players/${encodeURIComponent(profileUsername)}`)}
            >
              <FiArrowLeft />
              <span>Back to Profile</span>
            </button>
          </header>
          <div className="chess-game-page-empty">
            {error || 'Game data not found. Sync games from the player profile first.'}
          </div>
        </div>
      </div>
    );
  }

  const timeIcon = game.timeClass ? TIME_CLASS_ICONS[game.timeClass] : null;

  return (
    <div className="chess-game-page chess-game-page--test">
      <div className="chess-game-page-inner chess-game-page-inner--test">
        <header className="chess-game-page-topbar">
          <button
            type="button"
            className="chess-game-topbar-btn"
            onClick={() => navigate(`/players/${encodeURIComponent(profileUsername)}`)}
          >
            <FiArrowLeft />
            <span>Back to Profile</span>
          </button>

          <div className="chess-game-page-meta">
            {timeIcon && <img src={timeIcon} alt="" className="chess-game-page-meta-icon" />}
            <span className="chess-game-page-meta-type">{timeClassLabel(game.timeClass)}</span>
            <span className="chess-game-page-meta-dot">·</span>
            <span>{game.timeControl}</span>
            <span className="chess-game-page-meta-dot">·</span>
            <span>{game.date}</span>
            {game.rated && (
              <>
                <span className="chess-game-page-meta-dot">·</span>
                <span>Rated</span>
              </>
            )}
          </div>

          {game.gameUrl && (
            <a
              href={game.gameUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="chess-game-topbar-btn chess-game-topbar-btn--link"
            >
              <FiExternalLink />
              <span>Chess.com</span>
            </a>
          )}
        </header>

        <CustomGamePage
          boardId={`ChessComReview-${game.uuid || gameId}`}
          inputSource="chess_com_review"
          hideBrilliancePanel
          hideImport
          initialPgn={initialPgn}
          chessComUuid={game.uuid || gameId}
          profileUsername={profileUsername}
          defaultOrientation={defaultOrientation}
          playerOverride={playerOverride}
        />
      </div>
    </div>
  );
}

export default ChessComGamePage;
