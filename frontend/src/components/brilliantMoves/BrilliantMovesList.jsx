import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import FenHoverPreview from '../userProfile/FenHoverPreview';
import './BrilliantMovesList.css';

const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

function ReviewedCell({ row }) {
  const status = row.verificationStatus || 'pending';
  const isReviewed = row.isReviewed || status === 'approved' || status === 'rejected';

  if (!isReviewed) {
    return <span className="chess-review-chip chess-review-chip--no">No</span>;
  }

  const detail =
    status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Yes';

  return (
    <span
      className={`chess-review-chip chess-review-chip--yes chess-review-chip--${status}`}
      title={detail}
    >
      Yes
    </span>
  );
}

function BrilliantMovesList({ rows }) {
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
      if (!row?.fenAfterMove && !row?.fenBeforeMove) return;

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

  const openMove = useCallback(
    (row) => {
      if (row?.id == null) return;

      clearTimers();
      setPreviewVisible(false);
      setPreviewMounted(false);
      setHoveredRow(null);
      navigate(`/brilliant-moves/${row.id}`);
    },
    [clearTimers, navigate]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  const previewFen = hoveredRow?.fenAfterMove || hoveredRow?.fenBeforeMove;

  const hoverPreview =
    previewMounted && hoveredRow && previewFen
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
              fen={previewFen}
              uciMove={hoveredRow.uciMove}
              orientation={hoveredRow.turn === 'white' ? 'white' : 'black'}
              boardId="brilliant-move-hover-board"
            />
          </div>,
          document.body
        )
      : null;

  return (
    <div className="chess-brilliant-moves-table">
      <div className="chess-brilliant-moves-head" role="row">
        <span>Player</span>
        <span>Move</span>
        <span>Class</span>
        <span>FEN</span>
        <span>Score</span>
        <span>Rating</span>
        <span>Stage 4</span>
        <span>Reviewed</span>
        <span>Date</span>
      </div>

      <div className="chess-brilliant-moves-list" onMouseLeave={scheduleHide}>
        {rows.map((row) => {
          const moveClickable = row.id != null;
          const hasPreview = Boolean(row.fenAfterMove || row.fenBeforeMove);
          const isHovered = hoveredRow?.id === row.id && previewVisible;

          return (
            <div
              key={row.id}
              className={`chess-brilliant-moves-row-wrap${
                isHovered ? ' chess-brilliant-moves-row-wrap--hovered' : ''
              }${moveClickable ? ' chess-brilliant-moves-row-wrap--clickable' : ''}`}
              onMouseEnter={(event) => {
                if (hasPreview) handleRowHover(row, event.currentTarget);
              }}
            >
              <div
                className="chess-brilliant-moves-row"
                role={moveClickable ? 'link' : 'row'}
                tabIndex={moveClickable ? 0 : undefined}
                aria-label={
                  moveClickable ? `View brilliant move ${row.sanMove}` : undefined
                }
                onClick={() => {
                  if (moveClickable) openMove(row);
                }}
                onKeyDown={(event) => {
                  if (!moveClickable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMove(row);
                  }
                }}
              >
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--player">
                  <div className="chess-game-player-line self">
                    <span className="chess-game-player-name">
                      {row.chessComId || row.players}
                    </span>
                  </div>
                </div>

                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--move">
                  <span className="chess-brilliant-move-link">{row.sanMove}</span>
                </div>

                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--class">
                  {row.classification}
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--fen">
                  {hasPreview ? (
                    <code
                      className="chess-brilliant-fen"
                      title={row.fenBeforeMove || row.fenAfterMove}
                    >
                      {row.fenBeforeMove || row.fenAfterMove}
                    </code>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--score">
                  {row.brillianceScore != null ? row.brillianceScore.toFixed(2) : '—'}
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--rating">
                  {row.playerRating ?? '—'}
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--stage4">
                  <span
                    className={`chess-stage4-chip${
                      row.isBrilliant
                        ? ' chess-stage4-chip--brilliant'
                        : ' chess-stage4-chip--pass'
                    }`}
                  >
                    {row.isBrilliant ? 'Brilliant' : 'Passed'}
                  </span>
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--reviewed">
                  <ReviewedCell row={row} />
                </div>
                <div className="chess-brilliant-moves-col chess-brilliant-moves-col--date">
                  {row.playedDate}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hoverPreview}
    </div>
  );
}

export default BrilliantMovesList;
