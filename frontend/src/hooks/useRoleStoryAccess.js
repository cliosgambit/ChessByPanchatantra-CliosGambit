import { useState, useEffect, useCallback } from 'react';
import { parseAccessArray } from '../utils/parseAccessArray';
import { fetchRoleAccess } from '../utils/fetchRoleAccess';

export function useRoleStoryAccess(role) {
  const [storyAccess, setStoryAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccess = useCallback(async () => {
    if (!role) {
      setStoryAccess([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoleAccess(role);
      setStoryAccess(parseAccessArray(data.story_access));
    } catch (err) {
      console.warn(`[useRoleStoryAccess] ${role}:`, err.message);
      setError(err.message);
      setStoryAccess([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const updateStoryAccess = async (newAccess) => {
    if (!role) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/access-control/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_access: newAccess }),
      });
      if (!res.ok) throw new Error(`Update failed with status ${res.status}`);
      await fetchAccess();
    } catch (err) {
      console.warn(`[useRoleStoryAccess] update ${role}:`, err.message);
      setError(err.message);
      setLoading(false);
    }
  };

  return { storyAccess, updateStoryAccess, loading, error, refetch: fetchAccess };
}
