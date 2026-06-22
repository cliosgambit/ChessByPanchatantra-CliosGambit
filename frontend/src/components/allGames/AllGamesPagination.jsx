import React from 'react';

function AllGamesPagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="all-games-pagination">
      <span className="all-games-pagination-summary">
        Showing {start}–{end} of {total} games
      </span>
      <div className="all-games-pagination-controls">
        <button
          type="button"
          className="all-games-pagination-btn"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          aria-label="First page"
        >
          First
        </button>
        <button
          type="button"
          className="all-games-pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="all-games-pagination-status">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="all-games-pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </button>
        <button
          type="button"
          className="all-games-pagination-btn"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
        >
          Last
        </button>
      </div>
    </div>
  );
}

export default AllGamesPagination;
