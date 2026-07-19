import React, { useMemo, useState, useRef } from 'react';
import MoveClassIcon from './MoveClassIcon';

function LoadPgnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18v-6" strokeLinecap="round" />
      <path d="M9 15h6" strokeLinecap="round" />
    </svg>
  );
}

function moveClassLabel(c) {
  if (!c) return null;
  if (c === 'book') return 'Book';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function moveClassTextClass(c) {
  switch (c) {
    case 'best':
    case 'excellent':
    case 'good':
      return 'tp-move-san--good';
    case 'inaccuracy':
      return 'tp-move-san--inaccuracy';
    case 'mistake':
      return 'tp-move-san--mistake';
    case 'blunder':
      return 'tp-move-san--blunder';
    case 'book':
      return 'tp-move-san--book';
    default:
      return '';
  }
}

const LeftSidebar = ({
  history,
  navIndex,
  setNavIndex,
  timeline,
  loadPGN,
  layout = 'sidebar',
  moveClassifications = [],
  boardWidth = 560,
  hideImport = false,
  hideOverview = false,
  columnHeight,
  importing = false,
  /** 0-based ply to mark as the pioneer / focus sacrifice move. */
  highlightPly = null,
}) => {
  const pageStack = layout === 'pageStack';
  const asideHeight = columnHeight ?? boardWidth + 112;
  const [pgnInput, setPgnInput] = useState('');
  const [showPgnInput, setShowPgnInput] = useState(false);
  const fileInputRef = useRef(null);

  const movePairs = useMemo(() => {
    const res = [];
    for (let i = 0; i < history.length; i += 2) {
      res.push({
        num: Math.floor(i / 2) + 1,
        w: history[i]?.san,
        b: history[i + 1]?.san,
        wClock: history[i]?.clock,
        bClock: history[i + 1]?.clock,
        wClass: moveClassifications[i] ?? null,
        bClass: moveClassifications[i + 1] ?? null,
      });
    }
    return res;
  }, [history, moveClassifications]);

  const handleLoadPgn = async () => {
    const result = loadPGN(pgnInput);
    const ok = result instanceof Promise ? await result : result;
    if (ok) {
      setPgnInput('');
      setShowPgnInput(false);
    } else {
      alert('Invalid or empty PGN. Please check the format and try again.');
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setPgnInput(text);
      const result = loadPGN(text);
      const ok = result instanceof Promise ? await result : result;
      if (ok) {
        setPgnInput('');
        setShowPgnInput(false);
      } else {
        alert('Invalid or empty PGN. Please check the format and try again.');
      }
    } catch {
      alert('Could not read the selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const overviewStats = useMemo(() => {
    const stats = {
      w: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, missed: 0 },
      b: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, missed: 0 },
    };

    moveClassifications.forEach((cls, i) => {
      if (!cls) return;
      const color = i % 2 === 0 ? 'w' : 'b';
      const c = cls.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(stats[color], c)) {
        stats[color][c]++;
      }
    });

    return stats;
  }, [moveClassifications]);

  const STAT_ROWS = [
    { key: 'best', label: 'Best Move' },
    { key: 'excellent', label: 'Excellent' },
    { key: 'good', label: 'Good' },
    { key: 'book', label: 'Book' },
    { key: 'inaccuracy', label: 'Inaccuracy' },
    { key: 'mistake', label: 'Mistake' },
    { key: 'blunder', label: 'Blunder' },
  ];

  const historyHeight = hideOverview
    ? Math.max(200, boardWidth + 40)
    : boardWidth / 2 + 72;

  const overviewHeight = boardWidth / 2 + 24;

  return (
    <aside
      className={`tp-left-sidebar${hideOverview ? ' tp-left-sidebar--history-only' : ''}`}
      style={pageStack ? { height: `${asideHeight}px` } : undefined}
    >
      <div
        className="tp-move-history"
        style={!hideOverview && !pageStack ? { height: `${historyHeight}px` } : undefined}
      >
        <div className="tp-panel-header">
          <h2>Move History</h2>
          {!hideImport && (
            <button
              type="button"
              className="tp-load-pgn-btn"
              onClick={() => setShowPgnInput(!showPgnInput)}
              title="Load PGN"
              aria-label="Load PGN"
            >
              <LoadPgnIcon />
            </button>
          )}
        </div>

        {!hideImport && showPgnInput && (
          <div className="tp-pgn-import">
            <textarea
              placeholder="Paste PGN here…"
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              spellCheck={false}
            />
            <div className="tp-pgn-import-actions">
              <button
                type="button"
                className="tp-pgn-load-btn"
                onClick={handleLoadPgn}
                disabled={importing || !pgnInput.trim()}
              >
                {importing ? 'Loading…' : 'Load Game'}
              </button>
              <button
                type="button"
                className="tp-pgn-file-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                .pgn file
              </button>
              <button
                type="button"
                className="tp-pgn-cancel-btn"
                onClick={() => setShowPgnInput(false)}
              >
                Cancel
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,text/plain"
              hidden
              onChange={handleFileChange}
            />
          </div>
        )}

        <div className="tp-move-list">
          {movePairs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '1rem 0' }}>
              Load a PGN to see moves
            </p>
          ) : (
            movePairs.map((pair, i) => {
              const whitePly = i * 2;
              const blackPly = i * 2 + 1;
              const whiteIsFocus = highlightPly != null && highlightPly === whitePly;
              const blackIsFocus = highlightPly != null && highlightPly === blackPly;
              return (
              <div key={i} className="tp-move-row">
                <span className="tp-move-num">{pair.num}.</span>
                <div
                  className={`tp-move-pill${navIndex === whitePly + 1 ? ' tp-move-pill--active' : ''}${
                    whiteIsFocus ? ' tp-move-pill--pioneer' : ''
                  }`}
                  onClick={() => setNavIndex(whitePly + 1)}
                  role="button"
                  tabIndex={0}
                  title={whiteIsFocus ? 'Piece sacrifice' : undefined}
                  onKeyDown={(e) => e.key === 'Enter' && setNavIndex(whitePly + 1)}
                >
                  <div className="tp-move-pill-main">
                    <MoveClassIcon moveClass={pair.wClass} title={moveClassLabel(pair.wClass) || undefined} />
                    <span className={`tp-move-san ${moveClassTextClass(pair.wClass)}`}>{pair.w}</span>
                    {whiteIsFocus ? <span className="tp-move-pioneer-tag">!!</span> : null}
                  </div>
                  {pair.wClock ? <span className="tp-move-clock">{pair.wClock}</span> : null}
                </div>
                {pair.b ? (
                  <div
                    className={`tp-move-pill${navIndex === blackPly + 1 ? ' tp-move-pill--active' : ''}${
                      blackIsFocus ? ' tp-move-pill--pioneer' : ''
                    }`}
                    onClick={() => setNavIndex(blackPly + 1)}
                    role="button"
                    tabIndex={0}
                    title={blackIsFocus ? 'Piece sacrifice' : undefined}
                    onKeyDown={(e) => e.key === 'Enter' && setNavIndex(blackPly + 1)}
                  >
                    <div className="tp-move-pill-main">
                      <MoveClassIcon moveClass={pair.bClass} title={moveClassLabel(pair.bClass) || undefined} />
                      <span className={`tp-move-san ${moveClassTextClass(pair.bClass)}`}>{pair.b}</span>
                      {blackIsFocus ? <span className="tp-move-pioneer-tag">!!</span> : null}
                    </div>
                    {pair.bClock ? <span className="tp-move-clock">{pair.bClock}</span> : null}
                  </div>
                ) : (
                  <div />
                )}
              </div>
              );
            })
          )}
        </div>

        <div className="tp-move-nav">
          <button type="button" onClick={() => setNavIndex(0)} title="Start" aria-label="Start">
            <i className="fas fa-fast-backward text-xs" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setNavIndex(Math.max(0, navIndex - 1))}
            title="Previous"
            aria-label="Previous"
          >
            <i className="fas fa-chevron-left text-xs" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setNavIndex(Math.min(timeline.length - 1, navIndex + 1))}
            title="Next"
            aria-label="Next"
          >
            <i className="fas fa-chevron-right text-xs" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setNavIndex(timeline.length - 1)}
            title="End"
            aria-label="End"
          >
            <i className="fas fa-fast-forward text-xs" aria-hidden />
          </button>
        </div>
      </div>

      {!hideOverview && (
        <div className="tp-class-panel shrink-0" style={{ height: `${overviewHeight}px` }}>
          <div className="tp-class-body">
            <div>
              {STAT_ROWS.map((row) => {
                const wLit = overviewStats.w[row.key] > 0;
                const bLit = overviewStats.b[row.key] > 0;
                const labelLit = wLit || bLit;
                return (
                  <div key={row.key} className="tp-class-row">
                    <span className={`tp-class-count ${wLit ? 'tp-class-count--lit' : 'tp-class-count--dim'}`}>
                      {overviewStats.w[row.key]}
                    </span>
                    <div className="tp-class-label">
                      <MoveClassIcon moveClass={row.key} />
                      <span className={labelLit ? 'tp-class-label-text--lit' : 'tp-class-label-text--dim'}>
                        {row.label}
                      </span>
                    </div>
                    <span className={`tp-class-count text-right ${bLit ? 'tp-class-count--lit' : 'tp-class-count--dim'}`}>
                      {overviewStats.b[row.key]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="tp-class-footer">
            <span>White</span>
            <span>Black</span>
          </div>
        </div>
      )}
    </aside>
  );
};

export default LeftSidebar;
