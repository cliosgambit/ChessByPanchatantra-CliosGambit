import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTable } from '../lib/supabase/crud';
import { subscribeToTable, unsubscribeChannel } from '../lib/supabase/realtime';
import { isBackendDataProxyEnabled } from '../lib/supabase/config';
import { withRetry } from '../utils/retry';

const PROXY_POLL_MS = 30_000;

/**
 * Generic hook: fetch a table once, optional realtime or polling, stable cleanup.
 */
export function useSupabaseTable({
  table,
  select = '*',
  orderBy,
  ascending = true,
  channelName,
  mapRow,
  getRowId = (row) => row?.id,
  getDeleteId = (oldRow) => oldRow?.id ?? oldRow?.Chess_com_ID,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mapRowRef = useRef(mapRow);
  const getRowIdRef = useRef(getRowId);
  const getDeleteIdRef = useRef(getDeleteId);
  mapRowRef.current = mapRow;
  getRowIdRef.current = getRowId;
  getDeleteIdRef.current = getDeleteId;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await withRetry(() => fetchTable(table, { select, orderBy, ascending }));
      setItems(rows.map((row) => mapRowRef.current(row)).filter(Boolean));
    } catch (err) {
      console.error(`[useSupabaseTable:${table}]`, err);
      setError(err.message || `Failed to load ${table}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [table, select, orderBy, ascending]);

  useEffect(() => {
    let channel = null;
    let pollTimer = null;
    let cancelled = false;
    const viaProxy = isBackendDataProxyEnabled();

    const setup = async () => {
      await load();
      if (cancelled) return;

      if (viaProxy) {
        pollTimer = setInterval(() => {
          if (!cancelled) load();
        }, PROXY_POLL_MS);
        return;
      }

      channel = subscribeToTable(table, channelName, {
        onInsert: (raw) => {
          const mapped = mapRowRef.current(raw);
          if (!mapped) return;
          setItems((prev) => {
            const id = getRowIdRef.current(mapped);
            if (prev.some((r) => getRowIdRef.current(r) === id)) return prev;
            return [...prev, mapped];
          });
        },
        onUpdate: (raw) => {
          const mapped = mapRowRef.current(raw);
          if (!mapped) return;
          setItems((prev) =>
            prev.map((r) =>
              getRowIdRef.current(r) === getRowIdRef.current(mapped) ? mapped : r
            )
          );
        },
        onDelete: (old) => {
          const id = getDeleteIdRef.current(old);
          if (!id) return;
          setItems((prev) => prev.filter((r) => getRowIdRef.current(r) !== id));
        },
        onError: (err) => {
          console.error(`[useSupabaseTable:${table}] realtime`, err);
          setError((prev) => prev || err.message);
        },
      });
    };

    setup();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (channel) unsubscribeChannel(channel);
    };
  }, [load, table, channelName]);

  return { items, loading, error, refetch: load, setItems };
}
