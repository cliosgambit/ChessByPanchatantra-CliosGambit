import { useMemo } from 'react';
import { mapDbPlayerToAppPlayer } from '../services/playersService';
import { useSupabaseTable } from './useSupabaseTable';
import { useDebouncedValue, filterBySearch } from '../utils/debounce';
import { useClientPagination } from '../utils/pagination';

const PLAYERS_SELECT =
  'Chess_com_ID, Player_Name, Joining_Date, rapid_rating, rapid_best, blitz_rating, blitz_best, bullet_rating, bullet_best, current_elo, chess_last_synced_at, puzzle_rush_best, tactics_highest, activity_tracker';

/**
 * Loads players from Supabase with realtime, debounced search, sorting, pagination.
 */
export function usePlayers({ search = '', pageSize = 25, sortKey = 'name' } = {}) {
  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, loading, error, refetch } = useSupabaseTable({
    table: 'players',
    select: PLAYERS_SELECT,
    orderBy: 'Player_Name',
    channelName: 'public:players-admin',
    mapRow: mapDbPlayerToAppPlayer,
    getRowId: (p) => p.id,
    getDeleteId: (old) => old?.Chess_com_ID ?? old?.chess_com_id,
  });

  const sorted = useMemo(() => {
    const list = [...items];
    if (sortKey === 'maxElo') {
      return list.sort((a, b) => Number(b.maxElo || 0) - Number(a.maxElo || 0));
    }
    if (sortKey === 'joined') {
      return list.sort((a, b) => String(b.joined).localeCompare(String(a.joined)));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [items, sortKey]);

  const filtered = useMemo(
    () => filterBySearch(sorted, debouncedSearch, ['chessId', 'name', 'maxElo']),
    [sorted, debouncedSearch]
  );

  const pagination = useClientPagination(filtered, pageSize);

  return {
    players: pagination.paginatedItems,
    filteredCount: filtered.length,
    loading,
    error,
    refetch,
    pagination,
  };
}
