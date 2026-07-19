import React, { useRef } from 'react';
import { getChessComGameId } from '../../utils/chessComGameNavigation';

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

function GameHistoryRow({
  game,
  onSelect,
  isHovered,
  onRowHover,
  extraColumn,
  renderAccuracy = null,
  rowClassName = '',
}) {
  const rowRef = useRef(null);
  const timeIcon = game.timeClass ? TIME_CLASS_ICONS[game.timeClass] : null;
  const showAccuracy = game.hasAccuracy;
  const gameId = getChessComGameId(game);
  const canReview = Boolean(gameId && onSelect);
  const isReviewed = game.brillianceRun?.stage4Status === 'completed';
  const stage4PassedCount = Number(game.brillianceRun?.stage4BrilliantCount) || 0;

  const handleMouseEnter = () => {
    if (onRowHover && gameId) {
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
        {renderAccuracy ? (
          renderAccuracy(game)
        ) : showAccuracy ? (
          <div className="chess-game-accuracy-stack">
            <span>{game.whiteAccuracy}</span>
            <span>{game.blackAccuracy}</span>
          </div>
        ) : isReviewed ? (
          <span
            className="chess-stage4-passed"
            title={`${stage4PassedCount} Stage 4 passed move${stage4PassedCount === 1 ? '' : 's'}`}
          >
            {stage4PassedCount}
          </span>
        ) : canReview ? (
          <span className="chess-game-review-btn" aria-hidden="true">
            Review
          </span>
        ) : (
          <span className="chess-game-accuracy-empty">—</span>
        )}
      </div>

      <div className="chess-game-col chess-game-col-moves">{game.moves ?? '—'}</div>
      {extraColumn ? <div className="chess-game-col chess-game-col-extra">{extraColumn(game)}</div> : null}
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
      className={`chess-game-row-wrap${isHovered ? ' chess-game-row-wrap--hovered' : ''}${
        rowClassName ? ` ${rowClassName}` : ''
      }`}
      onMouseEnter={handleMouseEnter}
    >
      {rowInner}
    </div>
  );
}

export function GamesTableHeader({ extraColumnLabel = null, dateColumnLabel = 'Date' }) {
  return (
    <div className="chess-games-table-head">
      <span className="chess-games-col-type" aria-hidden="true" />
      <span>Players</span>
      <span>Result</span>
      <span>Accuracy</span>
      <span>Moves</span>
      {extraColumnLabel ? <span>{extraColumnLabel}</span> : null}
      <span>{dateColumnLabel}</span>
    </div>
  );
}

export default GameHistoryRow;
