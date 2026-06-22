import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchChessComArchivesFromDb,
  fetchChessComClubsFromDb,
  fetchChessComGamesFromDb,
  fetchChessComMonthlyGamesFromDb,
  fetchChessComProfileFromDb,
  syncChessComPlayer,
} from '../services/chessComDbService';

const POLL_MS = 2000;

export function useChessComUserData(username) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [archives, setArchives] = useState([]);
  const [monthlyGames, setMonthlyGames] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [clubs, setClubs] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [backgroundSync, setBackgroundSync] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const monthlyLoadedRef = useRef(false);
  const pollTimerRef = useRef(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const applyProfileSummary = useCallback((summary) => {
    setPending(Boolean(summary.pending));
    setBackgroundSync(Boolean(summary.backgroundSync));

    if (!summary.linked) {
      if (!summary.pending) {
        setProfile(null);
        setStats(null);
        setTotalGames(0);
        setError(summary.error || 'Player not found.');
      }
      return summary.pending;
    }

    setProfile(summary.profile);
    setStats(summary.stats);
    setTotalGames(summary.totalGames || 0);
    setLastSyncedAt(summary.lastSyncedAt || null);
    setError(summary.error || null);
    setPending(false);
    return false;
  }, []);

  const loadProfile = useCallback(async () => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setProfile(null);
      setStats(null);
      setPending(false);
      setError('Chess.com username is required.');
      setProfileLoading(false);
      return false;
    }

    try {
      const summary = await fetchChessComProfileFromDb(safeUsername);
      return applyProfileSummary(summary);
    } catch (err) {
      setError(err.message || 'Failed to load profile.');
      setPending(false);
      return false;
    }
  }, [username, applyProfileSummary]);

  const loadGames = useCallback(async () => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) {
      setRecentGames([]);
      setGamesLoading(false);
      return;
    }

    try {
      const data = await fetchChessComGamesFromDb(safeUsername, 25);
      setRecentGames(data.games || []);
      if (data.total != null) {
        setTotalGames((prev) => Math.max(prev, data.total));
      }
    } catch (err) {
      setError((prev) => prev || err.message || 'Failed to load games.');
    } finally {
      setGamesLoading(false);
    }
  }, [username]);

  const loadArchivesAndClubs = useCallback(async () => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername) return;

    try {
      const [archivesRes, clubsRes] = await Promise.all([
        fetchChessComArchivesFromDb(safeUsername),
        fetchChessComClubsFromDb(safeUsername),
      ]);
      setArchives(archivesRes.archives || []);
      setClubs(clubsRes.clubs || []);
    } catch {
      // Non-critical — archives/clubs can stay empty
    }
  }, [username]);

  const loadAll = useCallback(
    async ({ forceSync = false } = {}) => {
      const safeUsername = decodeURIComponent(username || '').trim();
      if (!safeUsername) {
        setError('Chess.com username is required.');
        setProfileLoading(false);
        setGamesLoading(false);
        return;
      }

      clearPoll();
      if (forceSync) setSyncing(true);
      else {
        setProfileLoading(true);
        setGamesLoading(true);
      }
      setError(null);
      monthlyLoadedRef.current = false;
      setMonthlyGames([]);

      if (forceSync) {
        try {
          await syncChessComPlayer(safeUsername);
        } catch (err) {
          setError(err.message || 'Sync failed.');
        } finally {
          setSyncing(false);
        }
      }

      const stillPending = await loadProfile();
      loadGames();
      loadArchivesAndClubs();

      if (stillPending) {
        pollTimerRef.current = setInterval(async () => {
          const pendingAgain = await loadProfile();
          if (!pendingAgain) {
            clearPoll();
            loadGames();
            loadArchivesAndClubs();
            setProfileLoading(false);
          }
        }, POLL_MS);
      }

      setProfileLoading(false);
    },
    [username, clearPoll, loadProfile, loadGames, loadArchivesAndClubs]
  );

  const loadMonthlyGames = useCallback(async () => {
    const safeUsername = decodeURIComponent(username || '').trim();
    if (!safeUsername || monthlyLoadedRef.current) return;

    setMonthlyLoading(true);
    try {
      const data = await fetchChessComMonthlyGamesFromDb(safeUsername, {
        months: 12,
        perMonth: 8,
      });
      setMonthlyGames(data.monthlyGames || []);
      monthlyLoadedRef.current = true;
    } catch (err) {
      setError((prev) => prev || err.message || 'Failed to load monthly games.');
    } finally {
      setMonthlyLoading(false);
    }
  }, [username]);

  const syncFromChessCom = useCallback(async () => {
    await loadAll({ forceSync: true });
  }, [loadAll]);

  useEffect(() => {
    loadAll({ forceSync: false });
    return clearPoll;
  }, [loadAll, clearPoll]);

  return {
    profile,
    stats,
    archives,
    monthlyGames,
    recentGames,
    totalGames,
    clubs,
    loading: profileLoading,
    profileLoading,
    gamesLoading,
    syncing,
    monthlyLoading,
    backgroundSync,
    pending,
    error,
    lastSyncedAt,
    refetch: () => loadAll({ forceSync: false }),
    syncFromChessCom,
    loadMonthlyGames,
  };
}
