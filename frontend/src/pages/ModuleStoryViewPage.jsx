import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiChevronLeft, FiChevronRight, FiEdit2 } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { fetchModuleStory } from '../services/modulesService';
import './LibraryStoryView.css';

function imageUrlsFromStory(story) {
  const list = Array.isArray(story?.images) ? story.images : [];
  return list
    .map((img) => (typeof img === 'string' ? img : img?.image_url || img?.url))
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function ModuleStoryViewPage() {
  const { moduleId, storyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [story, setStory] = useState(null);
  const [module, setModule] = useState(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchModuleStory(moduleId, storyId);
        if (cancelled) return;
        setStory(data.story || null);
        setModule(data.module || null);
        setIndex(0);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load story.');
          setStory(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, storyId]);

  const images = useMemo(() => imageUrlsFromStory(story), [story]);
  const morals = Array.isArray(story?.morals) ? story.morals : [];

  const goPrev = useCallback(() => {
    if (!images.length) return;
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    if (!images.length) return;
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  useEffect(() => {
    if (!images.length) {
      setIndex(0);
      return;
    }
    if (index >= images.length) setIndex(images.length - 1);
  }, [images.length, index]);

  if (loading) {
    return (
      <div className="story-view">
        <p className="story-view-muted" style={{ padding: '2rem' }}>
          Loading story…
        </p>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="story-view">
        <div className="story-view-panel story-view-panel--content">
          <div className="story-view-content-inner">
            <p className="story-view-error">{error || 'Story not found.'}</p>
            <button
              type="button"
              className="story-view-back"
              onClick={() => navigate(`/modules/${moduleId}`)}
            >
              <FiArrowLeft aria-hidden /> Back to module
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = images[index] || null;

  return (
    <div className="story-view">
      <div className="story-view-panel story-view-panel--content">
        <div className="story-view-content-inner">
          <div className="story-view-toolbar">
            <button
              type="button"
              className="story-view-back"
              onClick={() => navigate(`/modules/${moduleId}`)}
            >
              <FiArrowLeft aria-hidden /> {module?.name || 'Module'}
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="story-view-edit"
                onClick={() =>
                  navigate(`/library/${story.id}`, {
                    state: {
                      edit: true,
                      from: `/modules/${moduleId}/stories/${storyId}`,
                      fromLabel: 'Back to Story',
                    },
                  })
                }
              >
                <FiEdit2 aria-hidden /> Edit
              </button>
            ) : null}
          </div>

          <h1>{story.title}</h1>
          {story.subheading ? <p className="story-view-sub">{story.subheading}</p> : null}

          <section className="story-view-morals">
            <h2>Morals</h2>
            {morals.length > 0 ? (
              <ul>
                {morals.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="story-view-moral-link"
                      onClick={() =>
                        navigate(
                          `/modules/${moduleId}/stories/${storyId}/morals/${m.id}`
                        )
                      }
                    >
                      <span className="story-view-moral-code">{m.moral_code || m.id}</span>
                      <span>{m.moral_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="story-view-muted">No morals linked.</p>
            )}
          </section>
        </div>
      </div>

      <div className="story-view-panel story-view-panel--media">
        <div className="story-view-media-inner">
          {current ? (
            <div className="story-view-frame" aria-label="Story images">
              <img
                key={current}
                src={current}
                alt={`${story.title || 'Story'} — image ${index + 1}`}
              />
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
            <div className="story-view-empty-media">No images for this story.</div>
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
        </div>
      </div>
    </div>
  );
}

export default ModuleStoryViewPage;
