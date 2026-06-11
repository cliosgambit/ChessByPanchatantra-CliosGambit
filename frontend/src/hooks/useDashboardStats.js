import { useCallback, useEffect, useState } from 'react';
import { fetchDashboardStats } from '../services/dashboardService';
import { withRetry } from '../utils/retry';

export function useDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await withRetry(() => fetchDashboardStats());
      setStats(data);
    } catch (err) {
      console.error('[useDashboardStats]', err);
      setError(err.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return { stats, loading, error, refetch: load };
}
