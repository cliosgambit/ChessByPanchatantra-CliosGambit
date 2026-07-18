import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiSearch,
  FiGrid,
  FiList,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import {
  deleteLibraryStory,
  fetchLibraryStories,
} from '../services/libraryService';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import PaginationBar from '../components/common/PaginationBar';
import { canManageContent } from '../utils/roles';
import './Library.css';

const ITEMS_PER_PAGE = 50;

const VIEW_KEY = 'libraryViewMode';
const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

const USAGE_OPTIONS = [
  { value: 'all', label: 'Both' },
  { value: 'used', label: 'Used' },
  { value: 'unused', label: 'Unused' },
];

function clampMenuPosition(x, y, menuWidth = 180, menuHeight = 140) {
  const pad = 8;
  const maxX = window.innerWidth - menuWidth - pad;
  const maxY = window.innerHeight - menuHeight - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = canManageContent(user?.role);
  const tableWrapRef = useRef(null);
  const menuRef = useRef(null);
  const hideTimer = useRef(null);

  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState('all');
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === 'table' || saved === 'cards' ? saved : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [contextMenu, setContextMenu] = useState(null);

  const [hoveredStory, setHoveredStory] = useState(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTop, setPreviewTop] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchLibraryStories();
      setStories(data.stories || []);
    } catch (err) {
      setError(err.message || 'Failed to load stories.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setContextMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const clearTimers = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const revealPreview = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPreviewVisible(true));
    });
  }, []);

  const updatePreviewPosition = useCallback((rowEl) => {
    if (!tableWrapRef.current || !rowEl) return;
    const wrapRect = tableWrapRef.current.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    setPreviewTop(rowRect.top - wrapRect.top + rowRect.height / 2);
  }, []);

  const handleRowHover = useCallback(
    (story, rowEl) => {
      if (contextMenu || !story?.cover_image) {
        clearTimers();
        setPreviewVisible(false);
        setPreviewMounted(false);
        setHoveredStory(null);
        return;
      }

      clearTimers();
      updatePreviewPosition(rowEl);
      setHoveredStory(story);
      setPreviewMounted(true);
      revealPreview();
    },
    [clearTimers, updatePreviewPosition, revealPreview, contextMenu]
  );

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimer.current = setTimeout(() => {
      setPreviewVisible(false);
      hideTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        setHoveredStory(null);
      }, PREVIEW_ANIMATION_MS);
    }, PREVIEW_HIDE_DELAY_MS);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    clearTimers();
    if (hoveredStory) setPreviewVisible(true);
  }, [clearTimers, hoveredStory]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (viewMode !== 'table') {
      clearTimers();
      setPreviewVisible(false);
      setPreviewMounted(false);
      setHoveredStory(null);
    }
  }, [viewMode, clearTimers]);

  const usageCounts = useMemo(() => {
    let used = 0;
    let unused = 0;
    for (const story of stories) {
      if (story.is_used) used += 1;
      else unused += 1;
    }
    return { all: stories.length, used, unused };
  }, [stories]);

  const filteredStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stories.filter((story) => {
      if (usageFilter === 'used' && !story.is_used) return false;
      if (usageFilter === 'unused' && story.is_used) return false;
      if (!q) return true;
      const haystack = [
        story.title,
        story.subheading,
        story.status,
        story.is_used ? 'used' : 'unused',
        String(story.moral_count ?? ''),
        String(story.image_count ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [stories, search, usageFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, usageFilter]);

  const totalPages = Math.ceil(filteredStories.length / ITEMS_PER_PAGE);
  const paginatedStories = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStories.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStories, currentPage]);

  const openContextMenu = (e, story) => {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimers();
    setPreviewVisible(false);
    setPreviewMounted(false);
    setHoveredStory(null);
    const { x, y } = clampMenuPosition(e.clientX, e.clientY);
    setContextMenu({ x, y, story });
  };

  const handleEdit = (story) => {
    setContextMenu(null);
    navigate(`/library/${story.id}`, { state: { edit: true } });
  };

  const handleDelete = async (story) => {
    setContextMenu(null);
    if (!window.confirm(`Delete story “${story.title}”?`)) return;
    setDeletingId(story.id);
    try {
      await deleteLibraryStory(story.id);
      setStories((prev) => prev.filter((s) => s.id !== story.id));
    } catch (err) {
      setError(err.message || 'Failed to delete story.');
    } finally {
      setDeletingId(null);
    }
  };

  const openStory = (id) => navigate(`/library/${id}`);

  return (
    <div className="library-page">
      <div className="library-sticky-head">
        <header className="library-header">
          <div>
            <PageBreadcrumb
              items={[
                { label: 'Dashboard', to: '/dashboard' },
                { label: 'Library' },
              ]}
            />
            <h1>Library</h1>
            <p className="library-muted">Create and manage stories for CLIO.</p>
          </div>
          {canManage ? (
            <Link to="/library/new" className="library-btn library-btn--primary">
              <FiPlus aria-hidden /> Add Story
            </Link>
          ) : null}
        </header>

        <div className="library-toolbar">
          <label className="library-search">
            <FiSearch aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stories…"
              aria-label="Search stories"
            />
          </label>

          <div className="library-usage-filter" role="group" aria-label="Usage filter">
            {USAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`library-usage-filter-btn${
                  usageFilter === opt.value ? ' is-active' : ''
                }`}
                aria-pressed={usageFilter === opt.value}
                onClick={() => setUsageFilter(opt.value)}
              >
                <span>{opt.label}</span>
                <span className="library-usage-filter-count">
                  {usageCounts[opt.value]}
                </span>
              </button>
            ))}
          </div>

          <div className="library-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`library-view-btn${viewMode === 'cards' ? ' is-active' : ''}`}
              onClick={() => setViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
            >
              <FiGrid aria-hidden /> Cards
            </button>
            <button
              type="button"
              className={`library-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
            >
              <FiList aria-hidden /> Table
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="library-muted">Loading stories…</p>}
      {error && <p className="library-error">{error}</p>}

      {!loading && !error && stories.length === 0 && (
        <div className="library-empty">
          <h2>No stories yet</h2>
          <p>Add your first story to get started.</p>
          {canManage ? (
            <Link to="/library/new" className="library-btn library-btn--primary">
              <FiPlus aria-hidden /> Add Story
            </Link>
          ) : null}
        </div>
      )}

      {!loading && stories.length > 0 && filteredStories.length === 0 && (
        <div className="library-empty">
          <h2>No matches</h2>
          <p>Try a different search term.</p>
        </div>
      )}

      {!loading && paginatedStories.length > 0 && viewMode === 'cards' && (
        <>
          <div className="library-grid">
            {paginatedStories.map((story) => (
              <article
                key={story.id}
                className={`library-card library-card--clickable${
                  contextMenu?.story?.id === story.id ? ' library-card--menu-open' : ''
                }`}
                role="link"
                tabIndex={0}
                onClick={() => openStory(story.id)}
                onContextMenu={(e) => openContextMenu(e, story)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStory(story.id);
                  }
                }}
              >
                <div
                  className="library-card-cover"
                  style={
                    story.cover_image
                      ? { backgroundImage: `url(${story.cover_image})` }
                      : undefined
                  }
                />
                <div className="library-card-body">
                  <div className="library-card-meta">
                    <span className={`library-status library-status--${story.status}`}>
                      {story.status}
                    </span>
                    <span
                      className={`library-usage-badge${
                        story.is_used
                          ? ' library-usage-badge--used'
                          : ' library-usage-badge--unused'
                      }`}
                    >
                      {story.is_used ? 'Used' : 'Unused'}
                    </span>
                    <span className="library-muted">
                      {story.moral_count || 0} morals · {story.image_count || 0} images
                    </span>
                  </div>
                  <h2>{story.title}</h2>
                  {story.subheading ? <p className="library-card-sub">{story.subheading}</p> : null}
                </div>
              </article>
            ))}
          </div>
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            total={filteredStories.length}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {!loading && paginatedStories.length > 0 && viewMode === 'table' && (
        <>
          <div
            className="library-table-wrap"
            ref={tableWrapRef}
            onMouseLeave={scheduleHide}
          >
            <table className="library-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Cover</th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Usage</th>
                  <th scope="col">Morals</th>
                  <th scope="col">Images</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStories.map((story, index) => {
                  const serialNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                  return (
                    <tr
                      key={story.id}
                      className={`library-table-row${
                        hoveredStory?.id === story.id && previewMounted ? ' is-previewing' : ''
                      }${
                        contextMenu?.story?.id === story.id ? ' is-menu-open' : ''
                      }`}
                      onMouseEnter={(e) => handleRowHover(story, e.currentTarget)}
                      onClick={() => openStory(story.id)}
                      onContextMenu={(e) => openContextMenu(e, story)}
                    >
                      <td>{serialNumber}</td>
                      <td>
                        <div
                          className="library-table-cover"
                          style={
                            story.cover_image
                              ? { backgroundImage: `url(${story.cover_image})` }
                              : undefined
                          }
                          aria-hidden
                        />
                      </td>
                      <td>
                        <div className="library-table-title">{story.title}</div>
                        {story.subheading ? (
                          <div className="library-table-sub">{story.subheading}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`library-status library-status--${story.status}`}>
                          {story.status}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`library-usage-badge${
                            story.is_used
                              ? ' library-usage-badge--used'
                              : ' library-usage-badge--unused'
                          }`}
                        >
                          {story.is_used ? 'Used' : 'Unused'}
                        </span>
                      </td>
                      <td>{story.moral_count || 0}</td>
                      <td>{story.image_count || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {previewMounted && hoveredStory?.cover_image ? (
              <div
                className={`library-hover-preview${previewVisible ? ' is-visible' : ''}`}
                style={{ top: previewTop }}
                onMouseEnter={cancelHide}
                onMouseLeave={scheduleHide}
                role="presentation"
              >
                <img
                  src={hoveredStory.cover_image}
                  alt=""
                  className="library-hover-preview-img"
                />
              </div>
            ) : null}
          </div>
          <PaginationBar
            page={currentPage}
            totalPages={totalPages}
            total={filteredStories.length}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {contextMenu ? (
        <div
          ref={menuRef}
          className="library-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <p className="library-context-menu-title">{contextMenu.story.title}</p>
          <button
            type="button"
            className="library-context-menu-item"
            role="menuitem"
            onClick={() => handleEdit(contextMenu.story)}
          >
            <FiEdit2 aria-hidden /> Edit
          </button>
          <button
            type="button"
            className="library-context-menu-item library-context-menu-item--danger"
            role="menuitem"
            disabled={deletingId === contextMenu.story.id}
            onClick={() => handleDelete(contextMenu.story)}
          >
            <FiTrash2 aria-hidden /> Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default Library;
