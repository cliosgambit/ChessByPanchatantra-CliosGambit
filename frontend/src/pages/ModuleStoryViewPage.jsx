import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import PageBreadcrumb from '../components/common/PageBreadcrumb';
import { fetchChapterStory } from '../services/modulesService';
import './LibraryStoryView.css';

function imageUrlsFromStory(story) {
  const list = Array.isArray(story?.images) ? story.images : [];
  return list
    .map((img) => (typeof img === 'string' ? img : img?.image_url || img?.url))
    .map((url) => String(url || '').trim())
    .filter(Boolean);
}

function ModuleStoryViewPage() {
  const { moduleId, chapterId, storyId } = useParams();
  const navigate = useNavigate();

  const [story, setStory] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [module, setModule] = useState(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const chapterPath = `/modules/${moduleId}/chapters/${chapterId}`;
  const storyPath = `${chapterPath}/stories/${storyId}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchChapterStory(moduleId, chapterId, storyId);
        if (cancelled) return;
        setStory(data.story || null);
        setChapter(data.chapter || null);
        setModule(data.module || null);
        setIndex(0);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load story.');
          setStory(null);
          setChapter(null);
          setModule(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, chapterId, storyId]);

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

  const breadcrumbItems = [
    { label: 'Modules', to: '/modules' },
    { label: 'Modules', to: '/modules' },
    { label: module?.name || 'Module', to: `/modules/${moduleId}` },
    { label: chapter?.name || 'Chapter', to: chapterPath },
  ];

  if (error || !story) {
    return (
      <div className="story-view">
        <div className="story-view-panel story-view-panel--content">
          <div className="story-view-content-inner">
            <PageBreadcrumb items={[...breadcrumbItems, { label: 'Story' }]} />
            <p className="story-view-error">{error || 'Story not found.'}</p>
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
            <PageBreadcrumb
              items={[...breadcrumbItems, { label: story.title || 'Story' }]}
            />
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
                        navigate(`${storyPath}/morals/${m.id}`)
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
