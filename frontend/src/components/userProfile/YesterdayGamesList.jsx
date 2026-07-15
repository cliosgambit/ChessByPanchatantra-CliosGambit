import React, { useEffect, useState } from 'react';
import { fetchChessComPlayerGamesByDayFromDb } from '../../services/chessComDbService';
import GameHistoryList from './GameHistoryList';

function YesterdayGamesList({ username, onSelect }) {
  const [games, setGames] = useState([]);
  const [dayLabel, setDayLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setGames([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChessComPlayerGamesByDayFromDb(safeUsername, { day: 'yesterday' })
      .then((result) => {
        if (cancelled) return;
        setGames(result.games || []);
        setDayLabel(result.label || 'Yesterday');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load yesterday’s games.');
        setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return <div className="chess-profile-empty">Loading yesterday’s games…</div>;
  }

  if (error) {
    return <div className="chess-profile-empty chess-win-streak-error">{error}</div>;
  }

  if (!games.length) {
    return (
      <div className="chess-profile-empty">
        No games played yesterday{dayLabel ? ` (${dayLabel})` : ''}.
      </div>
    );
  }

  return (
    <div className="chess-yesterday-games-list">
      <div className="chess-month-title" style={{ marginBottom: '0.75rem' }}>
        <h4>{dayLabel || 'Yesterday'}</h4>
        <span>
          {games.length} game{games.length === 1 ? '' : 's'}
        </span>
      </div>
      <GameHistoryList games={games} onSelect={onSelect} profileUsername={username} />
    </div>
  );
}

export default YesterdayGamesList;
