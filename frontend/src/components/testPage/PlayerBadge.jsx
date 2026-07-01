import React from 'react';

const PlayerBadge = ({ name, rating, color, clock }) => {
  if (!name) return <div className="tp-player-placeholder" data-player-badge />;
  return (
    <div className="tp-player" data-player-badge>
      <div className="tp-player-info">
        <div className="tp-player-name-row">
          <div className={`tp-player-dot tp-player-dot--${color}`} />
          <span className="tp-player-name">{name}</span>
        </div>
        <span className="tp-player-rating">{rating || 'Rating: —'}</span>
      </div>
      {clock ? (
        <div className="tp-player-clock">
          <span>{clock}</span>
        </div>
      ) : null}
    </div>
  );
};

export default PlayerBadge;
