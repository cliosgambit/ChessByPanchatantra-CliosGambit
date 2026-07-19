import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiGrid,
  FiList,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import PaginationBar from '../components/common/PaginationBar';
import { fetchLibraryStories } from '../services/libraryService';
import {
  addStoryToChapter,
  fetchChapter,
  fetchModule,
  removeStoryFromChapter,
  updateChapter,
  updateChapterStoryVisibility,
} from '../services/modulesService';
import { canManageContent } from '../utils/roles';
import './Modules.css';
import './Library.css';

const ITEMS_PER_PAGE = 50;
const PREVIEW_ANIMATION_MS = 280;
const PREVIEW_HIDE_DELAY_MS = 120;

function viewModeKey(moduleId, chapterId) {
  return `chapterDetailViewMode_${moduleId}_${chapterId}`;
}

function clampMenuPosition(x, y, menuWidth = 210, menuHeight = 200) {
  const pad = 8;
  const maxX = window.innerWidth - menuWidth - pad;
  const maxY = window.innerHeight - menuHeight - pad;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

function formatAdded(dateStr) {
  if (dateStr == null || dateStr === '') return '—';
  const raw = String(dateStr).trim();
  if (!raw) return '—';

  let normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone =
    /[zZ]$/.test(normalized) ||
    /[+-]\d{2}:\d{2}$/.test(normalized) ||
    /[+-]\d{2}$/.test(normalized);

  const d = new Date(hasTimezone ? normalized : `${normalized}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function ChapterDetailPage() {
  const { moduleId, chapterId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = canManageContent(user?.role);

  const tableWrapRef = useRef(null);
  const menuRef = useRef(null);
  const hideTimer = useRef(null);

  const [module, setModule] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [stories, setStories] = useState([]);
  const [moduleStoryIds, setModuleStoryIds] = useState(new Set());
  const [libraryStories, setLibraryStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState(null);
  const [addVisible, setAddVisible] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [contextMenu, setContextMenu] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(viewModeKey(moduleId, chapterId));
      return saved === 'table' || saved === 'cards' ? saved : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [hoveredStory, setHoveredStory] = useState(null);
  const [previewMounted, setPreviewMounted] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTop, setPreviewTop] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [chapterData, moduleData] = await Promise.all([
        fetchChapter(moduleId, chapterId),
        fetchModule(moduleId),
      ]);
      setModule(chapterData.module || moduleData.module || null);
      setChapter(chapterData.chapter || null);
      setStories(chapterData.stories || []);
      setModuleStoryIds(
        new Set((moduleData.attached_story_ids || []).map((id) => Number(id)))
      );
    } catch (err) {
      setError(err.message || 'Failed to load chapter.');
      setModule(null);
      setChapter(null);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId, chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(viewModeKey(moduleId, chapterId), viewMode);
    } catch {
      /* ignore */
    }
  }, [moduleId, chapterId, viewMode]);

  useEffect(() => {
    setContextMenu(null);
  }, [viewMode, currentPage, search]);

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

  const attachedIds = useMemo(() => moduleStoryIds, [moduleStoryIds]);

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

  const filteredStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stories;
    return stories.filter((story) => {
      const haystack = [
        story.title,
        story.subheading,
        story.status,
        story.visible_to_students ? 'visible' : 'hidden',
        String(story.moral_count ?? ''),
        String(story.image_count ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [stories, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filteredStories.length / ITEMS_PER_PAGE);
  const paginatedStories = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStories.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredStories, currentPage]);

  const chapterSubtitle = useMemo(() => {
    if (!chapter) return '';
    const updatedLabel =
      chapter.updated_at != null && chapter.updated_at !== ''
        ? formatAdded(chapter.updated_at)
        : null;
    const parts = [
      chapter.description,
      `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`,
      chapter.visible_to_students ? 'Visible to students' : 'Hidden from students',
      updatedLabel && updatedLabel !== '—' ? `Updated ${updatedLabel}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [chapter, stories.length]);

  const openPicker = async () => {
    setPickerOpen(true);
    setSelectedStoryId(null);
    setAddVisible(true);
    setError('');
    try {
      const data = await fetchLibraryStories();
      setLibraryStories(data.stories || []);
    } catch (err) {
      setError(err.message || 'Failed to load library stories.');
    }
  };

  const handleAddStory = async (e) => {
    e.preventDefault();
    if (!selectedStoryId) return;
    setBusy(true);
    setError('');
    try {
      await addStoryToChapter(moduleId, chapterId, selectedStoryId, addVisible);
      setPickerOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add story.');
    } finally {
      setBusy(false);
    }
  };

  const toggleChapterVisibility = async () => {
    if (!chapter) return;
    setBusy(true);
    setError('');
    try {
      const { chapter: updated } = await updateChapter(moduleId, chapter.id, {
        visible_to_students: !chapter.visible_to_students,
      });
      setChapter(updated);
    } catch (err) {
      setError(err.message || 'Failed to update chapter visibility.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStoryVisibility = async (story) => {
    setBusy(true);
    setError('');
    try {
      const { story: updated } = await updateChapterStoryVisibility(
        moduleId,
        chapterId,
        story.story_id,
        !story.visible_to_students
      );
      setStories((prev) =>
        prev.map((s) => (s.story_id === updated.story_id ? { ...s, ...updated } : s))
      );
    } catch (err) {
      setError(err.message || 'Failed to update story visibility.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (story) => {
    if (!window.confirm(`Remove “${story.title}” from this chapter?`)) return;
    setBusy(true);
    setError('');
    try {
      await removeStoryFromChapter(moduleId, chapterId, story.story_id);
      setStories((prev) => prev.filter((s) => s.story_id !== story.story_id));
    } catch (err) {
      setError(err.message || 'Failed to remove story.');
    } finally {
      setBusy(false);
    }
  };

  const openStory = (story) => {
    navigate(`/modules/${moduleId}/chapters/${chapterId}/stories/${story.story_id}`);
  };

  const openContextMenu = (e, story) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimers();
    setPreviewVisible(false);
    setPreviewMounted(false);
    setHoveredStory(null);
    const { x, y } = clampMenuPosition(e.clientX, e.clientY);
    setContextMenu({ x, y, story });
  };

  const editInLibrary = (story) => {
    setContextMenu(null);
    navigate(`/library/${story.story_id}`, {
      state: {
        edit: true,
        from: `/modules/${moduleId}/chapters/${chapterId}`,
        fromLabel: 'Back to Chapter',
      },
    });
  };

  const handleContextHide = (story) => {
    setContextMenu(null);
    toggleStoryVisibility(story);
  };

  const handleContextRemove = (story) => {
    setContextMenu(null);
    handleRemove(story);
  };

  if (loading) {
    return (
      <div className="library-page">
        <p className="library-muted" style={{ padding: '2rem 0' }}>
          Loading chapter…
        </p>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="library-page">
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            { label: 'Modules', to: '/modules' },
            { label: module?.name || 'Module', to: `/modules/${moduleId}` },
            { label: 'Chapter' },
          ]}
        />
        <p className="library-error">{error || 'Chapter not found.'}</p>
      </div>
    );
  }

  return (
    <div className="library-page">
      <div className="library-sticky-head">
        <header className="library-header">
          <div>
            <PageBreadcrumb
              items={[
                { label: 'Modules', to: '/modules' },
                { label: 'Modules', to: '/modules' },
                { label: module?.name || 'Module', to: `/modules/${moduleId}` },
                { label: chapter.name || 'Chapter' },
              ]}
            />
            <h1>{chapter.name}</h1>
            <p className="library-muted">{chapterSubtitle}</p>
          </div>
          {isAdmin ? (
            <div className="library-header-actions">
              <button
                type="button"
                className="library-btn"
                disabled={busy}
                onClick={toggleChapterVisibility}
              >
                {chapter.visible_to_students ? (
                  <>
                    <FiEyeOff aria-hidden /> Hide chapter
                  </>
                ) : (
                  <>
                    <FiEye aria-hidden /> Show to students
                  </>
                )}
              </button>
              <button
                type="button"
                className="library-btn library-btn--primary"
                onClick={openPicker}
              >
                <FiPlus aria-hidden /> Add story
              </button>
            </div>
          ) : null}
        </header>

        {stories.length > 0 ? (
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
        ) : null}
      </div>

      {error ? <p className="library-error">{error}</p> : null}

      {stories.length === 0 ? (
        <div className="library-empty">
          <h2>No stories in this chapter</h2>
          <p>
            {isAdmin
              ? 'Add a story from the library. Students only see stories marked visible.'
              : 'Nothing to show yet.'}
          </p>
          {isAdmin ? (
            <button type="button" className="library-btn library-btn--primary" onClick={openPicker}>
              <FiPlus aria-hidden /> Add story
            </button>
          ) : null}
        </div>
      ) : null}

      {stories.length > 0 && filteredStories.length === 0 ? (
        <div className="library-empty">
          <h2>No matches</h2>
          <p>Try a different search term.</p>
        </div>
      ) : null}

      {paginatedStories.length > 0 && viewMode === 'cards' ? (
        <>
          <div className="library-grid">
            {paginatedStories.map((story) => (
              <article
                key={story.story_id}
                className={`library-card library-card--clickable${
                  contextMenu?.story?.story_id === story.story_id ? ' library-card--menu-open' : ''
                }`}
                role="link"
                tabIndex={0}
                onClick={() => openStory(story)}
                onContextMenu={(e) => openContextMenu(e, story)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStory(story);
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
                    <span className={`library-status library-status--${story.status || 'draft'}`}>
                      {story.status || 'draft'}
                    </span>
                    <span className="library-muted">
                      {story.moral_count || 0} morals · {story.image_count || 0} images
                    </span>
                  </div>
                  <h2>{story.title}</h2>
                  {story.subheading ? (
                    <p className="library-card-sub">{story.subheading}</p>
                  ) : null}
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
      ) : null}

      {paginatedStories.length > 0 && viewMode === 'table' ? (
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
                  <th scope="col">Morals</th>
                  <th scope="col">Images</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStories.map((story, index) => {
                  const serialNumber = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                  return (
                    <tr
                      key={story.story_id}
                      className={`library-table-row${
                        hoveredStory?.story_id === story.story_id && previewMounted
                          ? ' is-previewing'
                          : ''
                      }${
                        contextMenu?.story?.story_id === story.story_id ? ' is-menu-open' : ''
                      }`}
                      onMouseEnter={(e) => handleRowHover(story, e.currentTarget)}
                      onClick={() => openStory(story)}
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
                        <span className={`library-status library-status--${story.status || 'draft'}`}>
                          {story.status || 'draft'}
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
      ) : null}

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
            disabled={busy}
            onClick={() => handleContextHide(contextMenu.story)}
          >
            {contextMenu.story.visible_to_students ? (
              <>
                <FiEyeOff aria-hidden /> Hide from students
              </>
            ) : (
              <>
                <FiEye aria-hidden /> Show to students
              </>
            )}
          </button>
          <button
            type="button"
            className="library-context-menu-item"
            role="menuitem"
            onClick={() => editInLibrary(contextMenu.story)}
          >
            <FiEdit2 aria-hidden /> Edit
          </button>
          <button
            type="button"
            className="library-context-menu-item library-context-menu-item--danger"
            role="menuitem"
            disabled={busy}
            onClick={() => handleContextRemove(contextMenu.story)}
          >
            <FiTrash2 aria-hidden /> Remove
          </button>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="modules-modal" role="dialog" aria-modal="true">
          <form className="modules-modal-card" onSubmit={handleAddStory}>
            <div className="modules-modal-header">
              <div>
                <h2 className="modules-modal-title">Add story from library</h2>
                <p className="modules-modal-sub">
                  Pick a library story to attach. Edit content anytime in Library.
                </p>
              </div>
              <button
                type="button"
                className="modules-icon-btn"
                aria-label="Close"
                onClick={() => setPickerOpen(false)}
              >
                <FiX aria-hidden />
              </button>
            </div>
            <div className="modules-form">
              <div className="modules-picker-list">
                {libraryStories.length === 0 ? (
                  <p className="modules-muted">No library stories found.</p>
                ) : (
                  libraryStories.map((story) => {
                    const already = attachedIds.has(Number(story.id));
                    const selected = selectedStoryId === story.id;
                    return (
                      <button
                        key={story.id}
                        type="button"
                        className={`modules-picker-item${
                          selected ? ' modules-picker-item--selected' : ''
                        }`}
                        disabled={already}
                        onClick={() => setSelectedStoryId(story.id)}
                      >
                        <span
                          className="modules-picker-cover"
                          style={
                            story.cover_image
                              ? { backgroundImage: `url(${story.cover_image})` }
                              : undefined
                          }
                        />
                        <span>
                          <strong>{story.title}</strong>
                          <br />
                          <span className="modules-muted">
                            {already ? 'Already in module' : story.status}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <label className="modules-toggle">
                <input
                  type="checkbox"
                  checked={addVisible}
                  onChange={(e) => setAddVisible(e.target.checked)}
                />
                Visible to students when added
              </label>
            </div>
            <div className="modules-modal-actions">
              <button type="button" className="modules-btn" onClick={() => setPickerOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="modules-btn modules-btn--primary"
                disabled={busy || !selectedStoryId}
              >
                Add to chapter
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default ChapterDetailPage;
