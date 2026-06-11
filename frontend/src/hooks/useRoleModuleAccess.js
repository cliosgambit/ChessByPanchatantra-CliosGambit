import { useState, useEffect, useCallback } from 'react';
import { parseAccessArray } from '../utils/parseAccessArray';
import { fetchRoleAccess } from '../utils/fetchRoleAccess';

export function useRoleModuleAccess(role) {
  const [modAccess, setModAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccess = useCallback(async () => {
    if (!role) {
      setModAccess([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoleAccess(role);
      setModAccess(parseAccessArray(data.mod_access));
    } catch (err) {
      console.warn(`[useRoleModuleAccess] ${role}:`, err.message);
      setError(err.message);
      setModAccess([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const updateModAccess = async (newAccess) => {
    if (!role) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/access-control/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mod_access: newAccess }),
      });
      if (!res.ok) {
        throw new Error(`Update failed with status ${res.status}`);
      }
      await fetchAccess();
    } catch (err) {
      console.warn(`[useRoleModuleAccess] update ${role}:`, err.message);
      setError(err.message);
      setLoading(false);
    }
  };

  return { modAccess, updateModAccess, loading, error, refetch: fetchAccess };
}
