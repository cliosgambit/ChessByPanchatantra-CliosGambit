import { useCallback, useEffect, useState } from 'react';
import {
  fetchChessComArchives,
  fetchChessComClubs,
  fetchChessComMonthlyGames,
  fetchChessComProfile,
  fetchChessComRecentGames,
  fetchChessComStats,
} from '../services/chessComApiService';

export function useChessComUserData(username) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [archives, setArchives] = useState([]);
  const [monthlyGames, setMonthlyGames] = useState([]);
  const [recentGames, setRecentGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
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

    setLoading(true);
    setError(null);

    try {
      const profileRes = await fetchChessComProfile(safeUsername);
      const apiUsername = profileRes.profile?.username || safeUsername;

      const [statsRes, archivesRes, monthsRes, gamesRes, clubsRes] = await Promise.all([
        fetchChessComStats(apiUsername),
        fetchChessComArchives(apiUsername),
        fetchChessComMonthlyGames(apiUsername, 12),
        fetchChessComRecentGames(apiUsername, 25),
        fetchChessComClubs(apiUsername),
      ]);

      const errors = [
        profileRes.error,
        statsRes.error,
        archivesRes.error,
        monthsRes.error,
        gamesRes.error,
        clubsRes.error,
      ].filter(Boolean);
      setProfile(profileRes.profile);
      setStats(statsRes.stats);
      setArchives(archivesRes.archives);
      setMonthlyGames(monthsRes.months);
      setRecentGames(gamesRes.games);
      setTotalGames(gamesRes.totalGames);
      setClubs(clubsRes.clubs);
      setError(errors[0] || null);
    } catch (err) {
      setProfile(null);
      setStats(null);
      setArchives([]);
      setMonthlyGames([]);
      setRecentGames([]);
      setTotalGames(0);
      setClubs([]);
      setError(err.message || 'Failed to load Chess.com data.');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
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
    error,
    refetch: load,
  };
}
