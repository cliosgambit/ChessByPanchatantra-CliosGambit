import { useCallback, useEffect, useState } from 'react';
import { fetchModules, subscribeToModules, unsubscribeChannel } from '../services/curriculumService';
import { withRetry } from '../utils/retry';

export function useCurriculum() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await withRetry(() => fetchModules());
      setModules(rows);
    } catch (err) {
      setError(err.message || 'Failed to load modules');
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let channel = null;
    load();
    channel = subscribeToModules({
      onChange: () => load(),
      onRefetch: load,
      onError: (err) => setError(err.message),
    });
    return () => {
      if (channel) unsubscribeChannel(channel);
    };
  }, [load]);

  return { modules, loading, error, refetch: load };
}
