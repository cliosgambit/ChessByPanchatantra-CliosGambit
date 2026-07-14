import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiX, FiUpload, FiClipboard } from 'react-icons/fi';
import {
  createLibraryMoral,
  createLibraryStory,
  fetchLibraryMorals,
  fetchLibraryStory,
  updateLibraryStory,
  uploadLibraryImages,
} from '../services/libraryService';
import './Library.css';

const EMPTY_FORM = {
  title: '',
  subheading: '',
  status: 'draft',
  images: [],
  moral_ids: [],
};

function filesFromClipboard(clipboardData) {
  const items = Array.from(clipboardData?.items || []);
  const files = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

function imageUrlsFromStory(story) {
  const list = Array.isArray(story?.images) ? story.images : [];
  return list
    .map((img) => {
      if (typeof img === 'string') return img.trim();
      return String(img?.image_url || img?.url || '').trim();
    })
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

function formFromStory(story) {
  return {
    title: story?.title || '',
    subheading: story?.subheading || '',
    status: story?.status === 'published' ? 'published' : 'draft',
    images: imageUrlsFromStory(story),
    moral_ids: moralIdsFromStory(story),
  };
}

function LibraryStoryForm() {
  const { storyId } = useParams();
  const isEdit = Boolean(storyId);
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [morals, setMorals] = useState([]);
  const [newMoral, setNewMoral] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      if (isEdit) {
        setForm(EMPTY_FORM);
      }

      try {
        const moralsPromise = fetchLibraryMorals();
        const storyPromise = isEdit ? fetchLibraryStory(storyId) : Promise.resolve(null);

        const [moralsData, storyData] = await Promise.all([moralsPromise, storyPromise]);
        if (cancelled) return;

        const moralsList = Array.isArray(moralsData?.morals) ? moralsData.morals : [];
        const story = storyData?.story || (isEdit ? storyData : null);

        if (isEdit) {
          if (!story || (story.id == null && !story.title)) {
            setError('Story not found.');
            setMorals(moralsList);
            return;
          }
          const nextForm = formFromStory(story);
          const byId = new Map(
            moralsList.map((m) => [Number(m.id), { ...m, id: Number(m.id) }])
          );
          for (const m of story.morals || []) {
            const id = Number(m.id);
            if (Number.isFinite(id)) {
              byId.set(id, { ...m, id });
            }
          }
          setMorals([...byId.values()].sort((a, b) => a.id - b.id));
          setForm(nextForm);
        } else {
          setMorals(moralsList.map((m) => ({ ...m, id: Number(m.id) })));
          setForm(EMPTY_FORM);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || (isEdit ? 'Failed to load story.' : 'Failed to load morals.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEdit, storyId]);

  const selectedSet = useMemo(
    () => new Set(form.moral_ids.map((id) => Number(id)).filter(Number.isFinite)),
    [form.moral_ids]
  );

  const selectedMorals = useMemo(
    () => morals.filter((m) => selectedSet.has(Number(m.id))),
    [morals, selectedSet]
  );

  const orderedMorals = useMemo(() => {
    const selected = [];
    const rest = [];
    for (const m of morals) {
      if (selectedSet.has(Number(m.id))) selected.push(m);
      else rest.push(m);
    }
    return [...selected, ...rest];
  }, [morals, selectedSet]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleMoral = (id) => {
    const moralId = Number(id);
    if (!Number.isFinite(moralId)) return;
    setForm((prev) => {
      const next = new Set(
        prev.moral_ids.map(Number).filter(Number.isFinite)
      );
      if (next.has(moralId)) next.delete(moralId);
      else next.add(moralId);
      return { ...prev, moral_ids: [...next] };
    });
  };

  const handleAddMoral = async () => {
    const name = newMoral.trim();
    if (!name) return;
    setError('');
    try {
      const data = await createLibraryMoral(name);
      const created = data.moral;
      if (!created) throw new Error('Moral was not created.');
      const id = Number(created.id);
      if (!Number.isFinite(id)) throw new Error('Moral was created without an id.');
      setMorals((prev) => {
        if (prev.some((m) => Number(m.id) === id)) return prev;
        return [...prev, { ...created, id }];
      });
      setForm((prev) => ({
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

  const uploadGalleryFiles = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setError('');
    setUploading(true);
    try {
      const data = await uploadLibraryImages(list);
      const urls = (Array.isArray(data?.urls) ? data.urls : null)
        || (data?.url ? [data.url] : []);
      const cleaned = urls.map((u) => String(u || '').trim()).filter(Boolean);
      if (!cleaned.length) {
        throw new Error('Upload succeeded but no image URLs were returned.');
      }
      setForm((prev) => {
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

  const handleGalleryUpload = async (e) => {
    // Copy FileList BEFORE clearing the input — clearing can empty the live FileList.
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    await uploadGalleryFiles(files);
  };

  const handleGalleryPaste = async (e) => {
    const files = filesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    await uploadGalleryFiles(files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.moral_ids.length) {
      setError('Each story must have at least one moral.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      subheading: form.subheading.trim() || null,
      status: form.status,
      images: form.images.map((url, index) => ({
        image_url: url,
        display_order: index,
      })),
      moral_ids: form.moral_ids.map(Number).filter(Number.isFinite),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateLibraryStory(storyId, payload);
      } else {
        await createLibraryStory(payload);
      }
      navigate('/library');
    } catch (err) {
      setError(err.message || 'Failed to save story.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="library-page">
        <p className="library-muted">Loading story…</p>
      </div>
    );
  }

  return (
    <div className="library-page library-page--form">
      <header className="library-header">
        <div>
          <button type="button" className="library-back" onClick={() => navigate('/library')}>
            <FiArrowLeft aria-hidden /> Library
          </button>
          <h1>{isEdit ? 'Edit Story' : 'Add Story'}</h1>
        </div>
      </header>

      <form className="library-form" onSubmit={handleSubmit}>
        {error ? <p className="library-error">{error}</p> : null}
        {uploading ? <p className="library-muted">Uploading image…</p> : null}

        <label className="library-field">
          <span>Title *</span>
          <input
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            required
          />
        </label>

        <label className="library-field">
          <span>Subheading</span>
          <input
            value={form.subheading}
            onChange={(e) => updateField('subheading', e.target.value)}
          />
        </label>

        <label className="library-field">
          <span>Status</span>
          <select value={form.status} onChange={(e) => updateField('status', e.target.value)}>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </label>

        <fieldset className="library-fieldset">
          <legend>Story images</legend>
          <p className="library-muted">
            The first image is used as the cover. Upload or paste multiple images, then click{' '}
            <strong>Save changes</strong> to keep them.
          </p>
          <div className="library-upload-actions">
            <label className="library-upload-btn">
              <FiUpload aria-hidden />
              Upload images
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={uploading}
                onChange={handleGalleryUpload}
              />
            </label>
            {form.images.length > 0 ? (
              <span className="library-muted">{form.images.length} image(s)</span>
            ) : null}
          </div>
          <div
            className="library-paste-zone"
            tabIndex={0}
            role="button"
            aria-label="Paste story images"
            onPaste={handleGalleryPaste}
          >
            <FiClipboard aria-hidden />
            <span>Click here, then paste (Ctrl+V / Cmd+V) one or more images</span>
          </div>
          {form.images.length > 0 ? (
            <div className="library-gallery">
              {form.images.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className={`library-gallery-item${index === 0 ? ' is-cover' : ''}`}
                >
                  <img src={url} alt={`Story ${index + 1}`} />
                  {index === 0 ? <span className="library-cover-badge">Cover</span> : null}
                  <button
                    type="button"
                    className="library-icon-btn"
                    aria-label="Remove image"
                    onClick={() =>
                      updateField(
                        'images',
                        form.images.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <FiX aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="library-muted">No images yet.</p>
          )}
        </fieldset>

        <fieldset className="library-fieldset">
          <legend>Morals * (at least one)</legend>
          <p className="library-muted">
            Check every moral for this story, then click <strong>Save changes</strong>.
            Pressing Enter in the box below adds a moral — it does not save the story.
          </p>
          {selectedMorals.length > 0 ? (
            <div className="library-selected-morals">
              {selectedMorals.map((m) => (
                <span key={m.id} className="library-moral-chip">
                  {m.moral_code || m.id}: {m.moral_name}
                  <button
                    type="button"
                    aria-label={`Remove ${m.moral_name}`}
                    onClick={() => toggleMoral(m.id)}
                  >
                    <FiX aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="library-error">No morals selected yet.</p>
          )}
          <div className="library-principle-list">
            {orderedMorals.length === 0 ? (
              <p className="library-muted">No morals yet. Create one below.</p>
            ) : (
              orderedMorals.map((m) => (
                <label key={m.id} className="library-check">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(Number(m.id))}
                    onChange={() => toggleMoral(m.id)}
                  />
                  <span>
                    <strong>{m.moral_code || m.id}</strong> — {m.moral_name}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="library-image-row">
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
            <button type="button" className="library-btn" onClick={handleAddMoral}>
              <FiPlus aria-hidden /> Add
            </button>
          </div>
        </fieldset>

        <div className="library-form-actions">
          <Link to="/library" className="library-btn">
            Cancel
          </Link>
          <button
            type="submit"
            className="library-btn library-btn--primary"
            disabled={saving || uploading}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create story'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LibraryStoryForm;
