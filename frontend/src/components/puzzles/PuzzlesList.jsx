import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import FenHoverPreview from '../userProfile/FenHoverPreview';
import './PuzzlesList.css';

const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

function PuzzlesList({ rows }) {
  const navigate = useNavigate();
  const hideTimer = useRef(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });

  const revealPreview = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewVisible(true));
    });
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const updatePreviewPosition = useCallback((rowEl) => {
    if (!rowEl) return;
    const rowRect = rowEl.getBoundingClientRect();
    setPreviewPos({
      top: rowRect.top + rowRect.height / 2,
      left: rowRect.right + 14,
    });
  }, []);

  const handleRowHover = useCallback(
    (row, rowEl) => {
      if (!row?.puzzleFen) return;

      clearTimers();
      updatePreviewPosition(rowEl);
      setHoveredRow(row);
      setPreviewMounted(true);
      revealPreview();
    },
    [clearTimers, updatePreviewPosition, revealPreview]
  );

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      setPreviewVisible(false);
      hideTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        setHoveredRow(null);
      }, PREVIEW_ANIMATION_MS);
    }, PREVIEW_HIDE_DELAY_MS);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    clearTimers();
    if (hoveredRow) setPreviewVisible(true);
  }, [clearTimers, hoveredRow]);

  const openPuzzle = useCallback(
    (row) => {
      if (row?.id == null) return;

      clearTimers();
      setPreviewVisible(false);
      setPreviewMounted(false);
      setHoveredRow(null);
      navigate(`/puzzles/${row.id}`);
    },
    [clearTimers, navigate]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  const previewLastMove =
    hoveredRow?.previousMoveFrom && hoveredRow?.previousMoveTo
      ? { from: hoveredRow.previousMoveFrom, to: hoveredRow.previousMoveTo }
      : null;

  const hoverPreview =
    previewMounted && hoveredRow?.puzzleFen
      ? createPortal(
          <div
            className={`chess-game-hover-preview chess-game-hover-preview--portal${
              previewVisible ? ' chess-game-hover-preview--visible' : ''
            }`}
            style={{ top: previewPos.top, left: previewPos.left }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            role="presentation"
          >
            <FenHoverPreview
              fen={hoveredRow.puzzleFen}
              lastMove={previewLastMove}
              orientation={hoveredRow.turn === 'white' ? 'white' : 'black'}
              boardId="puzzle-hover-board"
            />
          </div>,
          document.body
        )
      : null;

  return (
    <div className="chess-puzzles-table">
      <div className="chess-puzzles-head" role="row">
        <span>Player / Game</span>
        <span>Solution</span>
        <span>Previous</span>
        <span>Saved</span>
      </div>

      <div className="chess-puzzles-list" onMouseLeave={scheduleHide}>
        {rows.map((row) => {
          const hasPreview = Boolean(row.puzzleFen);
          const isHovered = hoveredRow?.id === row.id && previewVisible;
          const clickable = row.id != null;

          return (
            <div
              key={row.id}
              className={`chess-puzzles-row-wrap${
                isHovered ? ' chess-puzzles-row-wrap--hovered' : ''
              }`}
              onMouseEnter={(event) => {
                if (hasPreview) handleRowHover(row, event.currentTarget);
              }}
            >
              {clickable ? (
                <div
                  role="button"
                  tabIndex={0}
                  className="chess-puzzles-row chess-puzzles-row--clickable"
                  onClick={() => openPuzzle(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPuzzle(row);
                    }
                  }}
                  aria-label={`Open puzzle: ${row.solutionSan || row.playersLabel || 'puzzle'}`}
                >
                  <div className="chess-puzzles-col chess-puzzles-col--meta">
                    <span className="chess-puzzles-primary">
                      {row.chessComId || row.playersLabel || 'View puzzle'}
                    </span>
                    <span className="chess-puzzles-subline">{row.playersLabel}</span>
                    <span className="chess-puzzles-subline">{row.timeControl}</span>
                  </div>

                  <div className="chess-puzzles-col chess-puzzles-col--solution">
                    <span className="chess-brilliant-move-link">{row.solutionSan}</span>
                  </div>

                  <div className="chess-puzzles-col chess-puzzles-col--previous">
                    {row.previousMoveSan || '—'}
                  </div>

                  <div className="chess-puzzles-col chess-puzzles-col--saved">
                    {row.savedDate || '—'}
                  </div>
                </div>
              ) : (
                <div className="chess-puzzles-row" role="row">
                  <div className="chess-puzzles-col chess-puzzles-col--meta">
                    <span className="chess-puzzles-primary">{row.playersLabel || '—'}</span>
                  </div>
                  <div className="chess-puzzles-col chess-puzzles-col--solution">{row.solutionSan}</div>
                  <div className="chess-puzzles-col chess-puzzles-col--previous">
                    {row.previousMoveSan || '—'}
                  </div>
                  <div className="chess-puzzles-col chess-puzzles-col--saved">
                    {row.savedDate || '—'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hoverPreview}
    </div>
  );
}

export default PuzzlesList;
