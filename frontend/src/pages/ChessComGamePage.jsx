import React, { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi';
import ChessComGameViewer from '../components/userProfile/ChessComGameViewer';
import { loadChessComGame } from '../utils/chessComGameNavigation';
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
  const location = useLocation();
  const navigate = useNavigate();
  const profileUsername = decodeURIComponent(userId || '');

  const game = useMemo(() => {
    if (location.state?.game) return location.state.game;
    return loadChessComGame(profileUsername, gameId);
  }, [location.state, profileUsername, gameId]);

  if (!game) {
    return (
      <div className="chess-game-page">
        <div className="chess-game-page-inner">
          <header className="chess-game-page-topbar">
            <button
              type="button"
              className="chess-game-topbar-btn"
              onClick={() => navigate(`/users/${encodeURIComponent(profileUsername)}`)}
            >
              <FiArrowLeft />
              <span>Back to Profile</span>
            </button>
          </header>
          <div className="chess-game-page-empty">
            Game data not found. Open a game from the player profile.
          </div>
        </div>
      </div>
    );
  }

  const timeIcon = game.timeClass ? TIME_CLASS_ICONS[game.timeClass] : null;

  return (
    <div className="chess-game-page">
      <div className="chess-game-page-inner">
        <header className="chess-game-page-topbar">
          <button
            type="button"
            className="chess-game-topbar-btn"
            onClick={() => navigate(`/users/${encodeURIComponent(profileUsername)}`)}
          >
            <FiArrowLeft />
            <span>Back to Profile</span>
          </button>

          <div className="chess-game-page-meta">
            {timeIcon && (
              <img src={timeIcon} alt="" className="chess-game-page-meta-icon" />
            )}
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

        <ChessComGameViewer game={game} profileUsername={profileUsername} />
      </div>
    </div>
  );
}

export default ChessComGamePage;
