import { useMemo, useState, useCallback } from 'react';

export function paginateArray(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function useClientPagination(items, pageSize = 25) {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(
    () => paginateArray(items, safePage, pageSize),
    [items, safePage, pageSize]
  );

  const goToPage = useCallback(
    (next) => setPage(Math.max(1, Math.min(totalPages, next))),
    [totalPages]
  );

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    paginatedItems,
    goToPage,
    setPage: goToPage,
  };
}
