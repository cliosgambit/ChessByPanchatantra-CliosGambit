import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiEdit2,
  FiEye,
  FiEyeOff,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { fetchLibraryStories } from '../services/libraryService';
import {
  addStoryToModule,
  fetchModule,
  removeStoryFromModule,
  updateModule,
  updateModuleStoryVisibility,
} from '../services/modulesService';
import './Modules.css';

function formatAdded(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z')).toLocaleString();
  } catch {
    return dateStr;
  }
}

function ModuleDetailPage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [module, setModule] = useState(null);
  const [stories, setStories] = useState([]);
  const [libraryStories, setLibraryStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState(null);
  const [addVisible, setAddVisible] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchModule(moduleId);
      setModule(data.module || null);
      setStories(data.stories || []);
    } catch (err) {
      setError(err.message || 'Failed to load module.');
      setModule(null);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const attachedIds = useMemo(
    () => new Set(stories.map((s) => Number(s.story_id))),
    [stories]
  );

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
      await addStoryToModule(moduleId, selectedStoryId, addVisible);
      setPickerOpen(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to add story.');
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

  const toggleStoryVisibility = async (story) => {
    setBusy(true);
    setError('');
    try {
      const { story: updated } = await updateModuleStoryVisibility(
        moduleId,
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
    if (!window.confirm(`Remove “${story.title}” from this module?`)) return;
    setBusy(true);
    setError('');
    try {
      await removeStoryFromModule(moduleId, story.story_id);
      setStories((prev) => prev.filter((s) => s.story_id !== story.story_id));
    } catch (err) {
      setError(err.message || 'Failed to remove story.');
    } finally {
      setBusy(false);
    }
  };

  const openStory = (story) => {
    navigate(`/modules/${moduleId}/stories/${story.story_id}`);
  };

  const editInLibrary = (story) => {
    navigate(`/library/${story.story_id}`, {
      state: {
        edit: true,
        from: `/modules/${moduleId}`,
        fromLabel: 'Back to Module',
      },
    });
  };

  if (loading) {
    return (
      <div className="modules-page">
        <p className="modules-muted">Loading module…</p>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="modules-page">
        <button type="button" className="modules-back" onClick={() => navigate('/modules')}>
          <FiArrowLeft aria-hidden /> Modules
        </button>
        <p className="modules-error">{error || 'Module not found.'}</p>
      </div>
    );
  }

  return (
    <div className="modules-page">
      <header className="modules-header">
        <div>
          <button type="button" className="modules-back" onClick={() => navigate('/modules')}>
            <FiArrowLeft aria-hidden /> Modules
          </button>
          <h1>{module.name}</h1>
          {module.description ? <p className="modules-muted">{module.description}</p> : null}
          <div className="modules-card-meta" style={{ marginTop: '0.65rem' }}>
            <span
              className={`modules-badge ${
                module.visible_to_students ? 'modules-badge--visible' : 'modules-badge--hidden'
              }`}
            >
              {module.visible_to_students ? (
                <>
                  <FiEye aria-hidden /> Module visible
                </>
              ) : (
                <>
                  <FiEyeOff aria-hidden /> Module hidden
                </>
              )}
            </span>
            <span className="modules-muted">
              {stories.length} stor{stories.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
        </div>
        {isAdmin ? (
          <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
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
            <button
              type="button"
              className="modules-btn modules-btn--primary"
              onClick={openPicker}
            >
              <FiPlus aria-hidden /> Add story
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="modules-error">{error}</p> : null}

      {stories.length === 0 ? (
        <div className="modules-empty">
          <h2>No stories in this module</h2>
          <p>
            {isAdmin
              ? 'Add a story from the library. Students only see stories marked visible.'
              : 'Nothing to show yet.'}
          </p>
          {isAdmin ? (
            <button type="button" className="modules-btn modules-btn--primary" onClick={openPicker}>
              <FiPlus aria-hidden /> Add story
            </button>
          ) : null}
        </div>
      ) : (
        <div className="modules-story-list">
          {stories.map((story) => (
            <div key={story.story_id} className="modules-story-row">
              <div
                className="modules-story-cover"
                style={
                  story.cover_image
                    ? { backgroundImage: `url(${story.cover_image})` }
                    : undefined
                }
                role="button"
                tabIndex={0}
                onClick={() => openStory(story)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStory(story);
                  }
                }}
              />
              <div className="modules-story-body">
                <h3>
                  <button
                    type="button"
                    className="modules-back"
                    style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}
                    onClick={() => openStory(story)}
                  >
                    {story.title}
                  </button>
                </h3>
                {story.subheading ? <p>{story.subheading}</p> : null}
                <p>Added {formatAdded(story.added_at)}</p>
                {isAdmin ? (
                  <span
                    className={`modules-badge ${
                      story.visible_to_students
                        ? 'modules-badge--visible'
                        : 'modules-badge--hidden'
                    }`}
                    style={{ marginTop: '0.35rem' }}
                  >
                    {story.visible_to_students ? 'Visible to students' : 'Hidden from students'}
                  </span>
                ) : null}
              </div>
              {isAdmin ? (
                <div className="modules-story-actions">
                  <button
                    type="button"
                    className="modules-btn"
                    disabled={busy}
                    onClick={() => toggleStoryVisibility(story)}
                  >
                    {story.visible_to_students ? (
                      <>
                        <FiEyeOff aria-hidden /> Hide
                      </>
                    ) : (
                      <>
                        <FiEye aria-hidden /> Show
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="modules-btn"
                    onClick={() => editInLibrary(story)}
                  >
                    <FiEdit2 aria-hidden /> Edit in Library
                  </button>
                  <button
                    type="button"
                    className="modules-btn modules-btn--danger"
                    disabled={busy}
                    onClick={() => handleRemove(story)}
                  >
                    <FiTrash2 aria-hidden /> Remove
                  </button>
                </div>
              ) : (
                <div className="modules-story-actions">
                  <button
                    type="button"
                    className="modules-btn modules-btn--primary"
                    onClick={() => openStory(story)}
                  >
                    Open
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
                Add to module
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export default ModuleDetailPage;
