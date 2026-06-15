import { useCallback, useEffect, useState } from 'react';
import { fetchChessComBundle, syncChessComPlayer } from '../services/chessComDbService';

export function useChessComUserData(username) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [archives, setArchives] = useState([]);
  const [monthlyGames, setMonthlyGames] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const load = useCallback(
    async ({ forceSync = false } = {}) => {
      const safeUsername = decodeURIComponent(username || '').trim();
      if (!safeUsername) {
        setProfile(null);
        setStats(null);
        setArchives([]);
        setMonthlyGames([]);
        setRecentGames([]);
        setTotalGames(0);
        setClubs([]);
        setError('Chess.com username is required.');
        setLoading(false);
        return;
      }

      if (forceSync) setSyncing(true);
      else setLoading(true);
      setError(null);

      try {
        const bundle = await fetchChessComBundle(safeUsername, { forceSync });

        if (!bundle.linked) {
          setProfile(null);
          setStats(null);
          setArchives([]);
          setMonthlyGames([]);
          setRecentGames([]);
          setTotalGames(0);
          setClubs([]);
          setError(bundle.error || 'Player not found.');
          return;
        }

        setProfile(bundle.profile);
        setStats(bundle.stats);
        setArchives(bundle.archives || []);
        setMonthlyGames(bundle.monthlyGames || []);
        setRecentGames(bundle.recentGames || []);
        setTotalGames(bundle.totalGames || 0);
        setClubs(bundle.clubs || []);
        setLastSyncedAt(bundle.lastSyncedAt || null);
        setError(bundle.error || null);
      } catch (err) {
        setProfile(null);
        setStats(null);
        setArchives([]);
        setMonthlyGames([]);
        setRecentGames([]);
        setTotalGames(0);
        setClubs([]);
        setError(err.message || 'Failed to load Chess.com data from database.');
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [username]
  );

  const syncFromChessCom = useCallback(async () => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) return;
    setSyncing(true);
    setError(null);
    try {
      await syncChessComPlayer(safeUsername);
      await load({ forceSync: false });
    } catch (err) {
      setError(err.message || 'Sync failed.');
      setSyncing(false);
    }
  }, [username, load]);

  useEffect(() => {
    load({ forceSync: false });
  }, [load]);

  return {
    profile,
    stats,
    archives,
    monthlyGames,
    recentGames,
    totalGames,
    clubs,
    loading,
    syncing,
    error,
    lastSyncedAt,
    refetch: () => load({ forceSync: false }),
    syncFromChessCom,
  };
}
