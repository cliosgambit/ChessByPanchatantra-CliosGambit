import React, { useRef } from 'react';

const TIME_CLASS_ICONS = {
  bullet: '/chess-icons/bullet.svg',
  blitz: '/chess-icons/blitz.svg',
  rapid: '/chess-icons/rapid.svg',
  daily: '/chess-icons/daily.svg',
};

function flagUrl(countryCode) {
  if (!countryCode) return null;
  return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
}

function PlayerLine({ username, rating, color, isSelf, countryCode }) {
  const flag = flagUrl(countryCode);

  return (
    <div className={`chess-game-player-line ${isSelf ? 'self' : 'opponent'}`}>
      <span className={`chess-game-piece-indicator chess-game-piece-indicator--${color}`} />
      <span className="chess-game-player-name">{username}</span>
      <span className="chess-game-rating">{rating ?? '—'}</span>
      {flag && <img src={flag} alt="" className="chess-game-player-flag" loading="lazy" />}
    </div>
  );
}

function GameHistoryRow({ game, onSelect, isHovered, onRowHover }) {
  const rowRef = useRef(null);
  const timeIcon = game.timeClass ? TIME_CLASS_ICONS[game.timeClass] : null;
  const showAccuracy = game.hasAccuracy;
  const canReview = Boolean(game.pgn && onSelect);

  const handleMouseEnter = () => {
    if (game.pgn && onRowHover) {
      onRowHover(game, rowRef.current);
    }
  };

  const handleRowClick = () => {
    if (canReview) onSelect?.(game);
  };

  const handleRowKeyDown = (event) => {
    if (!canReview) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(game);
    }
  };

  const content = (
    <>
      <div className="chess-game-col chess-game-col-type">
        {timeIcon ? (
          <img src={timeIcon} alt="" className="chess-game-type-icon" />
        ) : (
          <span className="chess-game-type-fallback">♟</span>
        )}
        <span className="chess-game-type-time">{game.timeControl}</span>
      </div>

      <div className="chess-game-col chess-game-col-players">
        <PlayerLine
          username={game.white}
          rating={game.whiteRating}
          color="white"
          isSelf={game.isWhite}
          countryCode={game.whiteCountryCode}
        />
        <PlayerLine
          username={game.black}
          rating={game.blackRating}
          color="black"
          isSelf={!game.isWhite}
          countryCode={game.blackCountryCode}
        />
      </div>

      <div className="chess-game-col chess-game-col-result">
        <div className="chess-game-score-stack">
          <span>{game.whiteScore ?? '—'}</span>
          <span>{game.blackScore ?? '—'}</span>
        </div>
        {game.resultType === 'win' && (
          <span className="chess-game-result-icon chess-game-result-icon--win" title="Win">
            +
          </span>
        )}
        {game.resultType === 'loss' && (
          <span className="chess-game-result-icon chess-game-result-icon--loss" title="Loss">
            −
          </span>
        )}
      </div>

      <div className="chess-game-col chess-game-col-accuracy">
        {showAccuracy ? (
          <div className="chess-game-accuracy-stack">
            <span>{game.whiteAccuracy}</span>
            <span>{game.blackAccuracy}</span>
          </div>
        ) : canReview ? (
          <span className="chess-game-review-btn" aria-hidden="true">
            Review
          </span>
        ) : (
          <span className="chess-game-accuracy-empty">—</span>
        )}
      </div>

      <div className="chess-game-col chess-game-col-moves">{game.moves ?? '—'}</div>
      <div className="chess-game-col chess-game-col-date">{game.date}</div>
    </>
  );

  const rowInner = canReview ? (
    <div
      role="button"
      tabIndex={0}
      className="chess-game-row chess-game-row--clickable"
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      aria-label={`View game: ${game.white} vs ${game.black}`}
    >
      {content}
    </div>
  ) : (
    <div className="chess-game-row">{content}</div>
  );

  return (
    <div
      ref={rowRef}
      className={`chess-game-row-wrap${isHovered ? ' chess-game-row-wrap--hovered' : ''}`}
      onMouseEnter={handleMouseEnter}
    >
      {rowInner}
    </div>
  );
}

export function GamesTableHeader() {
  return (
    <div className="chess-games-table-head">
      <span className="chess-games-col-type" aria-hidden="true" />
      <span>Players</span>
      <span>Result</span>
      <span>Accuracy</span>
      <span>Moves</span>
      <span>Date</span>
    </div>
  );
}

export default GameHistoryRow;
