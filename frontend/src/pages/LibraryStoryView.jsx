import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiPlus,
  FiTrash2,
  FiUpload,
  FiX,
  FiCheck,
} from 'react-icons/fi';
import {
  createLibraryMoral,
  deleteLibraryMoral,
  fetchLibraryMorals,
  fetchLibraryStory,
  updateLibraryStory,
  uploadLibraryImages,
} from '../services/libraryService';
import './LibraryStoryView.css';

function imageUrlsFromStory(story) {
  const list = Array.isArray(story?.images) ? story.images : [];
  return list
    .map((img) => (typeof img === 'string' ? img : img?.image_url || img?.url))
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function moralIdsFromStory(story) {
  const list = Array.isArray(story?.morals) ? story.morals : [];
  return [
    ...new Set(
      list
        .map((m) => Number(m?.id ?? m?.moral_id))
        .filter((id) => Number.isFinite(id))
    ),
  ];
}

function filesFromClipboard(clipboardData) {
  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function LibraryStoryView() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [story, setStory] = useState(null);
  const [moralsCatalog, setMoralsCatalog] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(Boolean(location.state?.edit));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newMoral, setNewMoral] = useState('');
  const [deletingMoralId, setDeletingMoralId] = useState(null);

  const [draft, setDraft] = useState({
    title: '',
    subheading: '',
    status: 'draft',
    images: [],
    moral_ids: [],
  });

  const loadStory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const storyData = await fetchLibraryStory(storyId);
      const next = storyData?.story;
      if (!next) {
        setError('Story not found.');
        setStory(null);
        return;
      }
      setStory(next);
      setDraft({
        title: next.title || '',
        subheading: next.subheading || '',
        status: next.status === 'published' ? 'published' : 'draft',
        images: imageUrlsFromStory(next),
        moral_ids: moralIdsFromStory(next),
      });
      setIndex(0);
    } catch (err) {
      setError(err.message || 'Failed to load story.');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  const loadMoralsCatalog = useCallback(async () => {
    try {
      const moralsData = await fetchLibraryMorals();
      setMoralsCatalog(
        (moralsData?.morals || []).map((m) => ({ ...m, id: Number(m.id) }))
      );
    } catch (err) {
      setError(err.message || 'Failed to load morals.');
    }
  }, []);

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  useEffect(() => {
    if (location.state?.edit) {
      setEditing(true);
      loadMoralsCatalog();
    }
  }, [location.state?.edit, loadMoralsCatalog]);

  const images = editing ? draft.images : imageUrlsFromStory(story);

  const linkedMorals = useMemo(() => {
    if (!editing) {
      return Array.isArray(story?.morals) ? story.morals : [];
    }
    const idSet = new Set(draft.moral_ids.map(Number).filter(Number.isFinite));
    const byId = new Map();
    for (const m of story?.morals || []) {
      byId.set(Number(m.id), m);
    }
    for (const m of moralsCatalog) {
      if (idSet.has(Number(m.id))) {
        byId.set(Number(m.id), m);
      }
    }
    return draft.moral_ids
      .map(Number)
      .filter(Number.isFinite)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }, [editing, story, draft.moral_ids, moralsCatalog]);

  const goPrev = useCallback(() => {
    if (!images.length) return;
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    if (!images.length) return;
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (editing) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, goPrev, goNext]);

  useEffect(() => {
    if (!images.length) {
      setIndex(0);
      return;
    }
    if (index >= images.length) setIndex(images.length - 1);
  }, [images.length, index]);

  const startEdit = async () => {
    if (!story) return;
    setDraft({
      title: story.title || '',
      subheading: story.subheading || '',
      status: story.status === 'published' ? 'published' : 'draft',
      images: imageUrlsFromStory(story),
      moral_ids: moralIdsFromStory(story),
    });
    setError('');
    if (!moralsCatalog.length) {
      await loadMoralsCatalog();
    }
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!story) return;
    setDraft({
      title: story.title || '',
      subheading: story.subheading || '',
      status: story.status === 'published' ? 'published' : 'draft',
      images: imageUrlsFromStory(story),
      moral_ids: moralIdsFromStory(story),
    });
    setError('');
    setNewMoral('');
    setEditing(false);
    setIndex(0);
  };

  const removeMoralFromStory = (id) => {
    const moralId = Number(id);
    if (!Number.isFinite(moralId)) return;
    setDraft((prev) => ({
      ...prev,
      moral_ids: prev.moral_ids.map(Number).filter((mid) => mid !== moralId),
    }));
  };

  const handleAddMoral = async () => {
    const name = newMoral.trim();
    if (!name) return;
    setError('');
    try {
      const data = await createLibraryMoral(name);
      const created = data.moral;
      const id = Number(created.id);
      setMoralsCatalog((prev) =>
        prev.some((m) => Number(m.id) === id)
          ? prev
          : [...prev, { ...created, id }]
      );
      setDraft((prev) => ({
        ...prev,
        moral_ids: [
          ...new Set([...prev.moral_ids.map(Number).filter(Number.isFinite), id]),
        ],
      }));
      setNewMoral('');
    } catch (err) {
      setError(err.message || 'Failed to create moral.');
    }
  };

  const handleDeleteMoral = async (moral) => {
    const id = Number(moral.id);
    if (!Number.isFinite(id)) return;
    const label = moral.moral_name || moral.moral_code || id;
    if (!window.confirm(`Delete moral “${label}”? This removes it from all stories.`)) {
      return;
    }
    setError('');
    setDeletingMoralId(id);
    try {
      await deleteLibraryMoral(id);
      setMoralsCatalog((prev) => prev.filter((m) => Number(m.id) !== id));
      setDraft((prev) => ({
        ...prev,
        moral_ids: prev.moral_ids.map(Number).filter((mid) => mid !== id),
      }));
    } catch (err) {
      setError(err.message || 'Failed to delete moral.');
    } finally {
      setDeletingMoralId(null);
    }
  };

  const uploadImages = async (files, { replaceCurrent = false } = {}) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setError('');
    setUploading(true);
    try {
      const data = await uploadLibraryImages(list);
      const urls = (Array.isArray(data?.urls) ? data.urls : null)
        || (data?.url ? [data.url] : []);
      const cleaned = urls.map((u) => String(u || '').trim()).filter(Boolean);
      if (!cleaned.length) throw new Error('No image URLs returned.');

      setDraft((prev) => {
        if (replaceCurrent && prev.images.length) {
          const next = [...prev.images];
          next[index] = cleaned[0];
          const extras = cleaned.slice(1).filter((u) => !next.includes(u));
          return { ...prev, images: [...next, ...extras] };
        }
        const merged = [...prev.images];
        for (const url of cleaned) {
          if (!merged.includes(url)) merged.push(url);
        }
        return { ...prev, images: merged };
      });
    } catch (err) {
      setError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleAddImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await uploadImages(files);
  };

  const handleReplaceCurrent = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    await uploadImages(files.slice(0, 1), { replaceCurrent: true });
  };

  const handlePasteImages = async (e) => {
    if (!editing) return;
    const files = filesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    await uploadImages(files);
  };

  const removeCurrentImage = () => {
    setDraft((prev) => {
      if (!prev.images.length) return prev;
      const next = prev.images.filter((_, i) => i !== index);
      return { ...prev, images: next };
    });
  };

  const handleSave = async () => {
    setError('');
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!draft.moral_ids.length) {
      setError('Each story must have at least one moral.');
      return;
    }

    setSaving(true);
    try {
      const data = await updateLibraryStory(storyId, {
        title: draft.title.trim(),
        subheading: draft.subheading.trim() || null,
        status: draft.status,
        images: draft.images.map((url, i) => ({
          image_url: url,
          display_order: i,
        })),
        moral_ids: draft.moral_ids.map(Number).filter(Number.isFinite),
      });
      const saved = data?.story;
      if (saved) {
        setStory(saved);
        setDraft({
          title: saved.title || '',
          subheading: saved.subheading || '',
          status: saved.status === 'published' ? 'published' : 'draft',
          images: imageUrlsFromStory(saved),
          moral_ids: moralIdsFromStory(saved),
        });
      }
      setEditing(false);
      setIndex(0);
    } catch (err) {
      setError(err.message || 'Failed to save story.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="story-view">
        <p className="story-view-muted">Loading story…</p>
      </div>
    );
  }

  if ((error && !story) || !story) {
    return (
      <div className="story-view">
        <p className="story-view-error">{error || 'Story not found.'}</p>
      </div>
    );
  }

  const current = images[index] || null;
  const title = editing ? draft.title : story.title;
  const subheading = editing ? draft.subheading : story.subheading;
  const status = editing ? draft.status : story.status;

  return (
    <div className={`story-view${editing ? ' is-editing' : ''}`}>
      <div className="story-view-panel story-view-panel--content">
        <div className="story-view-content-inner">
          <div className="story-view-toolbar">
            {!editing ? (
              <button type="button" className="story-view-edit" onClick={startEdit}>
                <FiEdit2 aria-hidden /> Edit
              </button>
            ) : (
              <div className="story-view-edit-actions">
                <button
                  type="button"
                  className="story-view-btn"
                  onClick={cancelEdit}
                  disabled={saving || uploading}
                >
                  <FiX aria-hidden /> Cancel
                </button>
                <button
                  type="button"
                  className="story-view-btn story-view-btn--primary"
                  onClick={handleSave}
                  disabled={saving || uploading}
                >
                  <FiCheck aria-hidden /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {error ? <p className="story-view-error">{error}</p> : null}
          {uploading ? <p className="story-view-muted">Uploading image…</p> : null}

          {editing ? (
            <label className="story-view-field">
              <span>Status</span>
              <select
                value={draft.status}
                onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
            </label>
          ) : (
            <p className={`story-view-status story-view-status--${status}`}>{status}</p>
          )}

          {editing ? (
            <>
              <label className="story-view-field">
                <span>Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label className="story-view-field">
                <span>Subheading</span>
                <input
                  value={draft.subheading}
                  onChange={(e) => setDraft((p) => ({ ...p, subheading: e.target.value }))}
                />
              </label>
            </>
          ) : (
            <>
              <h1>{title}</h1>
              {subheading ? <p className="story-view-sub">{subheading}</p> : null}
            </>
          )}

          <section className="story-view-morals">
            <h2>Morals</h2>
            {editing ? (
              <>
                {linkedMorals.length > 0 ? (
                  <table className="story-view-moral-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedMorals.map((m) => (
                        <tr key={m.id} className="story-view-moral-row">
                          <td className="story-view-moral-row-id">{m.moral_code || m.id}</td>
                          <td className="story-view-moral-row-name">{m.moral_name}</td>
                          <td className="story-view-moral-row-actions">
                            <button
                              type="button"
                              className="story-view-moral-delete"
                              aria-label={`Remove ${m.moral_name} from story`}
                              disabled={deletingMoralId === Number(m.id) || saving}
                              onClick={() => removeMoralFromStory(m.id)}
                            >
                              <FiX aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="story-view-muted">No morals yet. Add one below.</p>
                )}
                <div className="story-view-add-moral">
                  <input
                    value={newMoral}
                    onChange={(e) => setNewMoral(e.target.value)}
                    placeholder="New moral name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMoral();
                      }
                    }}
                  />
                  <button type="button" className="story-view-btn" onClick={handleAddMoral}>
                    <FiPlus aria-hidden /> Add
                  </button>
                </div>
              </>
            ) : linkedMorals.length > 0 ? (
              <div className="story-view-moral-grid">
                {linkedMorals.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="story-view-moral-card"
                    onClick={() => navigate(`/library/${storyId}/morals/${m.id}`)}
                  >
                    {m.moral_name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="story-view-muted">No morals linked.</p>
            )}
          </section>
        </div>
      </div>

      <div className="story-view-panel story-view-panel--media" onPaste={handlePasteImages}>
        <div className="story-view-media-inner">
          {current ? (
            <div className="story-view-frame" aria-label="Story images">
              <img key={current} src={current} alt={`${title || 'Story'} — image ${index + 1}`} />
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="story-view-hit story-view-hit--prev"
                    aria-label="Previous image"
                    onClick={goPrev}
                  >
                    <FiChevronLeft aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="story-view-hit story-view-hit--next"
                    aria-label="Next image"
                    onClick={goNext}
                  >
                    <FiChevronRight aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="story-view-empty-media">
              {editing ? 'No images yet — upload or paste below.' : 'No images for this story.'}
            </div>
          )}

          {images.length > 0 ? (
            <div className="story-view-dots" role="tablist" aria-label="Image position">
              <span className="story-view-counter">
                {index + 1} / {images.length}
              </span>
              <div className="story-view-dot-row">
                {images.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    className={`story-view-dot${i === index ? ' is-active' : ''}`}
                    aria-label={`Go to image ${i + 1}`}
                    aria-current={i === index ? 'true' : undefined}
                    onClick={() => setIndex(i)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {editing ? (
            <div className="story-view-image-tools">
              <label className="story-view-btn">
                <FiPlus aria-hidden /> Add images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={uploading}
                  onChange={handleAddImages}
                />
              </label>
              {current ? (
                <>
                  <label className="story-view-btn">
                    <FiUpload aria-hidden /> Replace
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={uploading}
                      onChange={handleReplaceCurrent}
                    />
                  </label>
                  <button
                    type="button"
                    className="story-view-btn story-view-btn--danger"
                    onClick={removeCurrentImage}
                    disabled={uploading}
                  >
                    <FiTrash2 aria-hidden /> Delete
                  </button>
                </>
              ) : null}
              <p className="story-view-hint story-view-hint--tight">
                Paste images here while editing. First image is the cover.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default LibraryStoryView;
