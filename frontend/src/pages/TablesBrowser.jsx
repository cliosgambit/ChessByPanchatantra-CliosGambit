import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchTableList, fetchTablePreview } from '../services/tableBrowserService';
import './TablesBrowser.css';

function cellValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function TablesBrowser() {
  const { tableName } = useParams();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError('');
      try {
        const data = await fetchTableList();
        if (!cancelled) setTables(data.tables || []);
      } catch (err) {
        if (!cancelled) setListError(err.message || 'Failed to load tables.');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tableName) {
      setPreview(null);
      setPreviewError('');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const data = await fetchTablePreview(tableName, 50);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err.message || 'Failed to load rows.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tableName]);

  const columns = useMemo(() => {
    if (preview?.columns?.length) return preview.columns.map((c) => c.name);
    if (preview?.rows?.[0]) return Object.keys(preview.rows[0]);
    return [];
  }, [preview]);

  const HIGHLIGHT_TABLES = [
    // Auth / students
    'Login',
    'Students',
    'players',
    // Library
    'Stories',
    'Story_Images',
    'Morals',
    'story_moral_mapping',
    'moral_puzzle_assignments',
    // Puzzle sources
    '3000_rated_puzzles',
    'lichess_puzzles',
    'chesscom_random_puzzles',
    // Chess.com sync / reports
    'chess_com_profiles',
    'chess_com_games',
    'chess_com_archives',
    'chess_com_moves',
    'chess_com_clubs',
    'chess_com_sync_raw',
  ];

  const sortedTables = useMemo(() => {
    const rank = (name) => {
      const idx = HIGHLIGHT_TABLES.indexOf(name);
      return idx === -1 ? 1000 : idx;
    };
    return [...tables].sort((a, b) => {
      const ra = rank(a.name);
      const rb = rank(b.name);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [tables]);

  return (
    <div className="tables-browser">
      <aside className="tables-sidebar">
        <div className="tables-sidebar-head">
          <h2>Tables</h2>
          <span className="tables-sidebar-count">{tables.length}</span>
        </div>
        {listLoading && <p className="tables-muted">Loading…</p>}
        {listError && <p className="tables-error">{listError}</p>}
        {!listLoading && !listError && (
          <nav className="tables-nav" aria-label="Database tables">
            {sortedTables.map((t) => {
              const active = t.name === tableName;
              const isHighlight = HIGHLIGHT_TABLES.includes(t.name);
              const isLogin = t.name === 'Login';
              return (
                <button
                  key={t.name}
                  type="button"
                  className={[
                    'tables-nav-item',
                    active ? 'tables-nav-item--active' : '',
                    isHighlight ? 'tables-nav-item--highlight' : '',
                    isLogin ? 'tables-nav-item--login' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => navigate(`/tables/${encodeURIComponent(t.name)}`)}
                >
                  <span className="tables-nav-name">
                    {t.name}
                    {isHighlight ? <em className="tables-nav-badge">active</em> : null}
                  </span>
                  <span className="tables-nav-rows">{t.rowCount}</span>
                </button>
              );
            })}
          </nav>
        )}
      </aside>

      <section className="tables-main">
        {!tableName && (
          <div className="tables-empty">
            <h1>Database tables</h1>
            <p>Select a table from the side list to preview the first 50 rows.</p>
          </div>
        )}

        {tableName && (
          <>
            <header className="tables-main-head">
              <div>
                <h1>{tableName}</h1>
                {preview && (
                  <p className="tables-muted">
                    Showing {Math.min(preview.limit, preview.rows?.length || 0)} of {preview.rowCount}{' '}
                    rows
                  </p>
                )}
              </div>
              {preview?.columns?.length > 0 && (
                <div className="tables-schema">
                  {preview.columns.map((col) => (
                    <span key={col.name} className="tables-schema-chip" title={col.type}>
                      {col.name}
                      {col.pk ? ' ★' : ''}
                      <em>{col.type || 'TEXT'}</em>
                    </span>
                  ))}
                </div>
              )}
            </header>

            {previewLoading && <p className="tables-muted">Loading rows…</p>}
            {previewError && <p className="tables-error">{previewError}</p>}

            {!previewLoading && !previewError && preview && (
              <div className="tables-scroll">
                {columns.length === 0 ? (
                  <p className="tables-muted">Table is empty.</p>
                ) : (
                  <table className="tables-grid">
                    <thead>
                      <tr>
                        {columns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.rows || []).map((row, idx) => (
                        <tr key={idx}>
                          {columns.map((col) => (
                            <td key={col} title={cellValue(row[col])}>
                              {cellValue(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default TablesBrowser;
