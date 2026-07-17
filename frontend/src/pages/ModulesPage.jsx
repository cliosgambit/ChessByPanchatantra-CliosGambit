import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  createModule,
  deleteModule,
  fetchModules,
  updateModule,
} from '../services/modulesService';
import './Modules.css';

const MODULE_THEMES = ['green', 'tan', 'blue', 'purple', 'orange'];

function moduleTheme(index, isLocked) {
  if (isLocked) return 'locked';
  return MODULE_THEMES[index % MODULE_THEMES.length];
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

function ModulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';
  const menuRef = useRef(null);

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', visible_to_students: false });
  const [contextMenu, setContextMenu] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchModules();
      setModules(data.modules || []);
    } catch (err) {
      setError(err.message || 'Failed to load modules.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const openContextMenu = (e, mod) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY);
    setContextMenu({ x, y, module: mod });
  };

  const openCreate = () => {
    setEditingModuleId(null);
    setForm({ name: '', description: '', visible_to_students: false });
    setModal('create');
  };

  const openEdit = (mod) => {
    setContextMenu(null);
    setEditingModuleId(mod.id);
    setForm({
      name: mod.name || '',
      description: mod.description || '',
      visible_to_students: Boolean(mod.visible_to_students),
    });
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setEditingModuleId(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createModule(form);
      closeModal();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create module.');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editingModuleId) return;
    setBusy(true);
    setError('');
    try {
      const { module: updated } = await updateModule(editingModuleId, form);
      setModules((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      closeModal();
    } catch (err) {
      setError(err.message || 'Failed to update module.');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisibility = async (mod) => {
    if (!isAdmin) return;
    setBusy(true);
    setError('');
    setContextMenu(null);
    try {
      const { module: updated } = await updateModule(mod.id, {
        visible_to_students: !mod.visible_to_students,
      });
      setModules((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      setError(err.message || 'Failed to update visibility.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (mod) => {
    if (!window.confirm(`Delete module “${mod.name}”?`)) return;
    setBusy(true);
    setError('');
    setContextMenu(null);
    try {
      await deleteModule(mod.id);
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
    } catch (err) {
      setError(err.message || 'Failed to delete module.');
    } finally {
      setBusy(false);
    }
  };

  const openModule = (mod) => {
    setContextMenu(null);
    navigate(`/modules/${mod.id}`);
  };

  return (
    <div className="modules-page modules-page--gallery">
      <div className="modules-page-toolbar">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', to: '/dashboard' },
            { label: 'Modules' },
          ]}
        />
        {isAdmin ? (
          <button type="button" className="modules-btn modules-btn--primary" onClick={openCreate}>
            <FiPlus aria-hidden /> New module
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>

      <h1 className="modules-page-title">Modules</h1>

      {loading ? <p className="modules-loading">Loading modules…</p> : null}
      {error ? <p className="modules-error modules-error--center">{error}</p> : null}

      {!loading && modules.length === 0 ? (
        <div className="modules-empty modules-empty--gallery">
          <h2>{isAdmin ? 'No modules yet' : 'No modules available'}</h2>
          <p>
            {isAdmin
              ? 'Create a module, then add chapters and stories from the library.'
              : 'Visible modules will show up here when your coach publishes them.'}
          </p>
          {isAdmin ? (
            <button type="button" className="modules-btn modules-btn--primary" onClick={openCreate}>
              <FiPlus aria-hidden /> New module
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && modules.length > 0 ? (
        <div className="modules-grid-wrap">
          <div className="modules-grid modules-grid--gallery">
            {modules.map((mod, index) => {
              const isLocked = isAdmin && !mod.visible_to_students;
              const theme = moduleTheme(index, isLocked);
              return (
                <article
                  key={mod.id}
                  className={[
                    'modules-card',
                    'modules-card--gallery',
                    `modules-card--${theme}`,
                    isLocked ? 'modules-card--locked' : '',
                    'modules-card--clickable',
                    contextMenu?.module?.id === mod.id ? 'modules-card--menu-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/modules/${mod.id}`)}
                  onContextMenu={(e) => openContextMenu(e, mod)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/modules/${mod.id}`);
                    }
                  }}
                >
                  <h2 className="modules-card-name">{mod.name}</h2>
                  {mod.description ? (
                    <p className="modules-card-description">{mod.description}</p>
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
          <p className="modules-context-menu-title">{contextMenu.module.name}</p>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            onClick={() => openModule(contextMenu.module)}
          >
            <FiFolder aria-hidden /> Open module
          </button>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            onClick={() => openEdit(contextMenu.module)}
          >
            <FiEdit2 aria-hidden /> Edit module
          </button>
          <button
            type="button"
            className="modules-context-menu-item"
            role="menuitem"
            disabled={busy}
            onClick={() => toggleVisibility(contextMenu.module)}
          >
            {contextMenu.module.visible_to_students ? (
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
            onClick={() => handleDelete(contextMenu.module)}
          >
            <FiTrash2 aria-hidden /> Delete module
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
                  {modal === 'edit' ? 'Edit module' : 'New module'}
                </h2>
                <p className="modules-modal-sub">
                  {modal === 'edit'
                    ? 'Update the module name, description, or student visibility.'
                    : 'Add chapters from the module page after creating it.'}
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
                  placeholder="e.g. Opening principles"
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

export default ModulesPage;
