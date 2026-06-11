import { useEffect, useState } from 'react';

/** Debounce a value — useful for search inputs. */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function filterBySearch(items, query, fields) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    fields.some((field) => String(item[field] ?? '').toLowerCase().includes(q))
  );
}
