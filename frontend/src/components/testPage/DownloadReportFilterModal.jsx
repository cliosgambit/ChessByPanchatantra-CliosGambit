import React, { useMemo, useState } from 'react';
import {
  ALL_MOVES_FILTER,
  STAGE1_ONLY_FILTER,
  countMovesPassingStage,
  filterRowsByStagePass,
} from '../../utils/testPageDownloadFilter';

export default function DownloadReportFilterModal({
  open,
  reportType = 'summary',
  totalMoves = 0,
  tableMoveRows = [],
  stageMaps,
  onCancel,
  onConfirm,
}) {
  const [filter, setFilter] = useState(ALL_MOVES_FILTER);

  const stage1Count = useMemo(
    () => countMovesPassingStage(tableMoveRows, stageMaps, 'stage1'),
    [tableMoveRows, stageMaps]
  );

  const filteredCount = useMemo(
    () => filterRowsByStagePass(tableMoveRows, stageMaps, filter).length,
    [tableMoveRows, stageMaps, filter]
  );

  if (!open) return null;

  const title = reportType === 'feature' ? 'Download feature report' : 'Download summary report';

  return (
    <div className="tp-download-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="tp-download-modal tp-download-modal--simple"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-download-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tp-download-modal-head">
          <h3 id="tp-download-modal-title">{title}</h3>
          <button type="button" className="tp-download-modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tp-download-modal-options">
          <label className="tp-download-modal-option">
            <input
              type="radio"
              name="download-filter"
              checked={filter.mode === 'all'}
              onChange={() => setFilter(ALL_MOVES_FILTER)}
            />
            <span>
              <strong>All moves</strong>
              <span className="tp-download-modal-count">{totalMoves} moves</span>
            </span>
          </label>

          <label className="tp-download-modal-option">
            <input
              type="radio"
              name="download-filter"
              checked={filter.mode === 'stage1'}
              onChange={() => setFilter(STAGE1_ONLY_FILTER)}
            />
            <span>
              <strong>Stage 1 only</strong>
              <span className="tp-download-modal-count">{stage1Count} moves</span>
            </span>
          </label>
        </div>

        <div className="tp-download-modal-actions">
          <button type="button" className="tp-download-modal-btn tp-download-modal-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="tp-download-modal-btn tp-download-modal-btn--primary"
            disabled={filteredCount === 0}
            onClick={() => onConfirm(filter)}
          >
            Download ({filteredCount})
          </button>
        </div>
      </div>
    </div>
  );
}
