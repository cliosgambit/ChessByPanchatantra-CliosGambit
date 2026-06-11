import { useState, useEffect, useCallback } from 'react';
import { parseAccessArray } from '../utils/parseAccessArray';
import { fetchRoleAccess } from '../utils/fetchRoleAccess';

export function useRoleChapterAccess(role) {
  const [chapAccess, setChapAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccess = useCallback(async () => {
    if (!role) {
      setChapAccess([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoleAccess(role);
      setChapAccess(parseAccessArray(data.chap_access));
    } catch (err) {
      console.warn(`[useRoleChapterAccess] ${role}:`, err.message);
      setError(err.message);
      setChapAccess([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const updateChapAccess = async (newAccess) => {
    if (!role) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/access-control/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chap_access: newAccess }),
      });
      if (!res.ok) throw new Error(`Update failed with status ${res.status}`);
      await fetchAccess();
    } catch (err) {
      console.warn(`[useRoleChapterAccess] update ${role}:`, err.message);
      setError(err.message);
      setLoading(false);
    }
  };

  return { chapAccess, updateChapAccess, loading, error, refetch: fetchAccess };
}
