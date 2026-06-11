import { useCallback, useMemo } from 'react';
import { mapLoginToAppUser } from '../services/loginService';
import { useSupabaseTable } from './useSupabaseTable';
import { useDebouncedValue, filterBySearch } from '../utils/debounce';
import { useClientPagination } from '../utils/pagination';

/**
 * Loads Login table users with realtime sync, debounced search, role filter, pagination.
 */
export function useUsers({ pageSize = 25, roleFilter = 'all', search = '' } = {}) {
  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, loading, error, refetch, setItems } = useSupabaseTable({
    table: 'Login',
    select: 'Chess_com_ID, Player_Name, email, Role',
    orderBy: 'Player_Name',
    channelName: 'public:login-admin',
    mapRow: mapLoginToAppUser,
    getRowId: (u) => u.id,
    getDeleteId: (old) => old?.Chess_com_ID ?? old?.chess_com_id,
  });

  const filtered = useMemo(() => {
    let list = items;
    if (roleFilter !== 'all') {
      list = list.filter(
        (u) => u.roleRaw === roleFilter.toLowerCase() || u.role.toLowerCase() === roleFilter.toLowerCase()
      );
    }
    return filterBySearch(list, debouncedSearch, ['name', 'email', 'chessComId', 'role']);
  }, [items, roleFilter, debouncedSearch]);

  const pagination = useClientPagination(filtered, pageSize);

  const upsertLocal = useCallback(
    (user) => {
      if (!user) return;
      setItems((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev.map((u) => (u.id === user.id ? user : u));
        return [...prev, user].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    [setItems]
  );

  const removeLocal = useCallback(
    (id) => setItems((prev) => prev.filter((u) => u.id !== id)),
    [setItems]
  );

  return {
    users: pagination.paginatedItems,
    allUsers: items,
    filteredCount: filtered.length,
    loading,
    error,
    refetch,
    upsertLocal,
    removeLocal,
    pagination,
  };
}
