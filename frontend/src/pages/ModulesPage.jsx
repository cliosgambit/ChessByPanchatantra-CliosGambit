import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiEye, FiEyeOff, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import {
  createModule,
  deleteModule,
  fetchModules,
  updateModule,
} from '../services/modulesService';
import './Modules.css';

function formatAdded(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr.replace(' ', 'T') + 'Z').toLocaleString();
  } catch {
    return dateStr;
  }
}

function ModulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', visible_to_students: false });

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

  const openCreate = () => {
    setForm({ name: '', description: '', visible_to_students: false });
    setModal('create');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createModule(form);
      setModal(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create module.');
    } finally {
      setBusy(false);
    }
  };

  const toggleVisibility = async (mod, e) => {
    e.stopPropagation();
    if (!isAdmin) return;
    setBusy(true);
    setError('');
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

  const handleDelete = async (mod, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete module “${mod.name}”?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteModule(mod.id);
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
    } catch (err) {
      setError(err.message || 'Failed to delete module.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modules-page">
      <header className="modules-header">
        <div>
          <button type="button" className="modules-back" onClick={() => navigate('/dashboard')}>
            <FiArrowLeft aria-hidden /> Dashboard
          </button>
          <h1>Modules</h1>
          <p className="modules-muted">
            {isAdmin
              ? 'Group library stories into modules and control student visibility.'
              : 'Stories assigned to you by your coach.'}
          </p>
        </div>
        {isAdmin ? (
          <button type="button" className="modules-btn modules-btn--primary" onClick={openCreate}>
            <FiPlus aria-hidden /> New module
          </button>
        ) : null}
      </header>

      {loading ? <p className="modules-muted">Loading modules…</p> : null}
      {error ? <p className="modules-error">{error}</p> : null}

      {!loading && modules.length === 0 ? (
        <div className="modules-empty">
          <h2>{isAdmin ? 'No modules yet' : 'No modules available'}</h2>
          <p>
            {isAdmin
              ? 'Create a module, then add stories from the library.'
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
        <div className="modules-grid">
          {modules.map((mod) => (
            <article
              key={mod.id}
              className="modules-card modules-card--clickable"
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/modules/${mod.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/modules/${mod.id}`);
                }
              }}
            >
              <div className="modules-card-top">
                <h2>{mod.name}</h2>
                <span
                  className={`modules-badge ${
                    mod.visible_to_students ? 'modules-badge--visible' : 'modules-badge--hidden'
                  }`}
                >
                  {mod.visible_to_students ? (
                    <>
                      <FiEye aria-hidden /> Visible
                    </>
                  ) : (
                    <>
                      <FiEyeOff aria-hidden /> Hidden
                    </>
                  )}
                </span>
              </div>
              {mod.description ? <p className="modules-card-desc">{mod.description}</p> : null}
              <div className="modules-card-meta">
                <span className="modules-muted">
                  {mod.story_count} stor{mod.story_count === 1 ? 'y' : 'ies'}
                </span>
                {mod.updated_at ? (
                  <span className="modules-muted">Updated {formatAdded(mod.updated_at)}</span>
                ) : null}
              </div>
              {isAdmin ? (
                <div className="modules-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="modules-btn"
                    disabled={busy}
                    onClick={(e) => toggleVisibility(mod, e)}
                  >
                    {mod.visible_to_students ? (
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
                    className="modules-btn modules-btn--danger"
                    disabled={busy}
                    onClick={(e) => handleDelete(mod, e)}
                  >
                    <FiTrash2 aria-hidden /> Delete
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {modal === 'create' ? (
        <div className="modules-modal" role="dialog" aria-modal="true">
          <form className="modules-modal-card" onSubmit={handleCreate}>
            <div className="modules-modal-header">
              <div>
                <h2 className="modules-modal-title">New module</h2>
                <p className="modules-modal-sub">Add stories from the library after creating it.</p>
              </div>
              <button
                type="button"
                className="modules-icon-btn"
                aria-label="Close"
                onClick={() => setModal(null)}
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
              <button type="button" className="modules-btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="modules-btn modules-btn--primary" disabled={busy}>
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default ModulesPage;
