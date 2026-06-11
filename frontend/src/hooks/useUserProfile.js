import { useCallback, useEffect, useState } from 'react';
import { fetchFullUserProfile } from '../services/userProfileService';

export function useUserProfile(userId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setData(null);
      setError('User ID is required.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const decodedId = decodeURIComponent(userId);
      const profile = await fetchFullUserProfile(decodedId);
      if (!profile) {
        setData(null);
        setError('User not found.');
        return;
      }
      setData(profile);
    } catch (err) {
      setData(null);
      setError(err.message || 'Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
