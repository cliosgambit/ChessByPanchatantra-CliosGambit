import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiFolder,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import {
  createChapter,
  deleteChapter,
  fetchModule,
  updateChapter,
  updateModule,
} from '../services/modulesService';
import { canManageContent } from '../utils/roles';
import './Modules.css';

const CHAPTER_THEMES = ['green', 'tan', 'blue', 'purple', 'orange'];

function chapterTheme(index, isLocked) {
  if (isLocked) return 'locked';
  return CHAPTER_THEMES[index % CHAPTER_THEMES.length];
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

function ModuleDetailPage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = canManageContent(user?.role);
  const menuRef = useRef(null);

  const [module, setModule] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', visible_to_students: false });
  const [contextMenu, setContextMenu] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchModule(moduleId);
      setModule(data.module || null);
      setChapters(data.chapters || []);
    } catch (err) {
      setError(err.message || 'Failed to load module.');
      setModule(null);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const openContextMenu = (e, chapter) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY);
    setContextMenu({ x, y, chapter });
  };

  const openCreate = () => {
    setEditingChapterId(null);
    setForm({ name: '', description: '', visible_to_students: false });
    setModal('create');
  };

  const openEdit = (chapter) => {
    setContextMenu(null);
    setEditingChapterId(chapter.id);
    setForm({
      name: chapter.name || '',
      description: chapter.description || '',
      visible_to_students: Boolean(chapter.visible_to_students),
    });
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setEditingChapterId(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createChapter(moduleId, form);
      closeModal();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create chapter.');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingChapterId) return;
    setBusy(true);
    setError('');
    try {
      const { chapter: updated } = await updateChapter(moduleId, editingChapterId, form);
      setChapters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      closeModal();
    } catch (err) {
      setError(err.message || 'Failed to update chapter.');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisibility = async (chapter) => {
    if (!isAdmin) return;
    setBusy(true);
    setError('');
    setContextMenu(null);
    try {
      const { chapter: updated } = await updateChapter(moduleId, chapter.id, {
        visible_to_students: !chapter.visible_to_students,
      });
      setChapters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      setError(err.message || 'Failed to update visibility.');
    } finally {
      setBusy(false);
    }
  };

  const toggleModuleVisibility = async () => {
    if (!module) return;
    setBusy(true);
    setError('');
    try {
      const { module: updated } = await updateModule(module.id, {
        visible_to_students: !module.visible_to_students,
      });
      setModule(updated);
    } catch (err) {
      setError(err.message || 'Failed to update module visibility.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (chapter) => {
    if (!window.confirm(`Delete chapter “${chapter.name}”? Stories in it will be removed from this module.`)) {
      return;
    }
    setBusy(true);
    setError('');
    setContextMenu(null);
    try {
      await deleteChapter(moduleId, chapter.id);
      setChapters((prev) => prev.filter((c) => c.id !== chapter.id));
    } catch (err) {
      setError(err.message || 'Failed to delete chapter.');
    } finally {
      setBusy(false);
    }
  };

  const openChapter = (chapter) => {
    setContextMenu(null);
    navigate(`/modules/${moduleId}/chapters/${chapter.id}`);
  };

  if (loading) {
    return (
      <div className="modules-page modules-page--gallery">
        <p className="modules-loading">Loading module…</p>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="modules-page modules-page--gallery">
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            { label: 'Modules', to: '/modules' },
            { label: 'Module' },
          ]}
        />
        <p className="modules-error modules-error--center">{error || 'Module not found.'}</p>
      </div>
    );
  }

  return (
    <div className="modules-page modules-page--gallery">
      <div className="modules-page-toolbar">
        <PageBreadcrumb
          items={[
            { label: 'Modules', to: '/modules' },
            { label: 'Modules', to: '/modules' },
            { label: module.name || 'Module' },
          ]}
        />
        {isAdmin ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="modules-btn"
              disabled={busy}
              onClick={toggleModuleVisibility}
            >
              {module.visible_to_students ? (
                <>
                  <FiEyeOff aria-hidden /> Hide module
                </>
              ) : (
                <>
                  <FiEye aria-hidden /> Show to students
                </>
              )}
            </button>
            <button type="button" className="modules-btn modules-btn--primary" onClick={openCreate}>
              <FiPlus aria-hidden /> New chapter
            </button>
          </div>
        ) : (
          <span aria-hidden />
        )}
      </div>

      <h1 className="modules-page-title">Chapters</h1>
      {module.description ? (
        <p className="modules-muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          {module.description}
        </p>
      ) : null}

      {error ? <p className="modules-error modules-error--center">{error}</p> : null}

      {chapters.length === 0 ? (
        <div className="modules-empty modules-empty--gallery">
          <h2>{isAdmin ? 'No chapters yet' : 'No chapters available'}</h2>
          <p>
            {isAdmin
              ? 'Create a chapter, then add stories from the library.'
              : 'Visible chapters will show up here when your coach publishes them.'}
          </p>
          {isAdmin ? (
            <button type="button" className="modules-btn modules-btn--primary" onClick={openCreate}>
              <FiPlus aria-hidden /> New chapter
            </button>
          ) : null}
        </div>
      ) : null}

      {chapters.length > 0 ? (
        <div className="modules-grid-wrap">
          <div className="modules-grid modules-grid--gallery">
            {chapters.map((chapter, index) => {
              const isLocked = isAdmin && !chapter.visible_to_students;
              const theme = chapterTheme(index, isLocked);
              return (
                <article
                  key={chapter.id}
                  className={[
                    'modules-card',
                    'modules-card--gallery',
                    `modules-card--${theme}`,
                    isLocked ? 'modules-card--locked' : '',
                    'modules-card--clickable',
                    contextMenu?.chapter?.id === chapter.id ? 'modules-card--menu-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="link"
                  tabIndex={0}
                  onClick={() => openChapter(chapter)}
                  onContextMenu={(e) => openContextMenu(e, chapter)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openChapter(chapter);
                    }
                  }}
                >
                  <h2 className="modules-card-name">{chapter.name}</h2>
                  {chapter.description ? (
                    <p className="modules-card-description">{chapter.description}</p>
                  ) : (
                    <p className="modules-card-description modules-card-description--empty">
                      No description
                    </p>
                  )}
                  {isLocked ? <span className="modules-locked-badge">Locked</span> : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          ref={menuRef}
          className="modules-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <p className="modules-context-menu-title">{contextMenu.chapter.name}</p>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            onClick={() => openChapter(contextMenu.chapter)}
          >
            <FiFolder aria-hidden /> Open chapter
          </button>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            onClick={() => openEdit(contextMenu.chapter)}
          >
            <FiEdit2 aria-hidden /> Edit chapter
          </button>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            disabled={busy}
            onClick={() => toggleVisibility(contextMenu.chapter)}
          >
            {contextMenu.chapter.visible_to_students ? (
              <>
                <FiEyeOff aria-hidden /> Hide from students
              </>
            ) : (
              <>
                <FiEye aria-hidden /> Show to students
              </>
            )}
          </button>
          <div className="modules-context-menu-divider" role="separator" />
          <button
            type="button"
            className="modules-context-menu-item modules-context-menu-item--danger"
            role="menuitem"
            disabled={busy}
            onClick={() => handleDelete(contextMenu.chapter)}
          >
            <FiTrash2 aria-hidden /> Delete chapter
          </button>
        </div>
      ) : null}

      {modal === 'create' || modal === 'edit' ? (
        <div className="modules-modal" role="dialog" aria-modal="true">
          <form
            className="modules-modal-card"
            onSubmit={modal === 'edit' ? handleEdit : handleCreate}
          >
            <div className="modules-modal-header">
              <div>
                <h2 className="modules-modal-title">
                  {modal === 'edit' ? 'Edit chapter' : 'New chapter'}
                </h2>
                <p className="modules-modal-sub">
                  {modal === 'edit'
                    ? 'Update the chapter name, description, or student visibility.'
                    : 'Add stories from the library after creating it.'}
                </p>
              </div>
              <button
                type="button"
                className="modules-icon-btn"
                aria-label="Close"
                onClick={closeModal}
              >
                <FiX aria-hidden />
              </button>
            </div>
            <div className="modules-form">
              <label className="modules-field">
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                  placeholder="e.g. Opening fundamentals"
                />
              </label>
              <label className="modules-field">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional short description"
                />
              </label>
              <label className="modules-toggle">
                <input
                  type="checkbox"
                  checked={form.visible_to_students}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, visible_to_students: e.target.checked }))
                  }
                />
                Visible to students
              </label>
            </div>
            <div className="modules-modal-actions">
              <button type="button" className="modules-btn" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="modules-btn modules-btn--primary" disabled={busy}>
                {modal === 'edit' ? 'Save changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default ModuleDetailPage;
