import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FiExternalLink } from 'react-icons/fi';
import CustomGamePage from './test/CustomGamePage';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
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
  const profileUsername = decodeURIComponent(userId || '');
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loadedUuidRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      // Avoid unmounting CustomGamePage when we already have this game (remount
      // restarted analysis and raced Strict Mode double-effects).
      const alreadyLoaded = loadedUuidRef.current === gameId && game;
      if (!alreadyLoaded) setLoading(true);
      setError(null);
      try {
        const fromDb = await fetchChessComGameFromDb(profileUsername, gameId);
        if (!cancelled && fromDb) {
          loadedUuidRef.current = gameId;
          setGame(fromDb);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          const cached = loadChessComGame(profileUsername, gameId);
          if (cached) {
            loadedUuidRef.current = gameId;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when route ids change
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

  if (loading && !game) {
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
            <PageBreadcrumb
              items={[
                { label: 'Dashboard', to: '/dashboard' },
                { label: 'Students', to: '/students' },
                {
                  label: profileUsername || 'Profile',
                  to: `/players/${encodeURIComponent(profileUsername)}/new`,
                },
                { label: 'Game' },
              ]}
            />
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
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', to: '/dashboard' },
              { label: 'Students', to: '/students' },
              {
                label: profileUsername || 'Profile',
                to: `/players/${encodeURIComponent(profileUsername)}/new`,
              },
              { label: 'Game' },
            ]}
          />

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
          key={game.uuid || gameId}
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
