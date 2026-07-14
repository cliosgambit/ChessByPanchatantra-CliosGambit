import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiArrowLeft } from 'react-icons/fi';
import {
  deleteLibraryStory,
  fetchLibraryStories,
} from '../services/libraryService';
import './Library.css';

function Library() {
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

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

  const handleDelete = async (story) => {
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

  return (
    <div className="library-page">
      <header className="library-header">
        <div>
          <button type="button" className="library-back" onClick={() => navigate('/dashboard')}>
            <FiArrowLeft aria-hidden /> Dashboard
          </button>
          <h1>Library</h1>
          <p className="library-muted">Create and manage stories for CLIO.</p>
        </div>
        <Link to="/library/new" className="library-btn library-btn--primary">
          <FiPlus aria-hidden /> Add Story
        </Link>
      </header>

      {loading && <p className="library-muted">Loading stories…</p>}
      {error && <p className="library-error">{error}</p>}

      {!loading && !error && stories.length === 0 && (
        <div className="library-empty">
          <h2>No stories yet</h2>
          <p>Add your first story to get started.</p>
          <Link to="/library/new" className="library-btn library-btn--primary">
            <FiPlus aria-hidden /> Add Story
          </Link>
        </div>
      )}

      {!loading && stories.length > 0 && (
        <div className="library-grid">
          {stories.map((story) => (
            <article
              key={story.id}
              className="library-card library-card--clickable"
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/library/${story.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/library/${story.id}`);
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
                  <span className="library-muted">
                    {story.moral_count || 0} morals · {story.image_count || 0} images
                  </span>
                </div>
                <h2>{story.title}</h2>
                {story.subheading ? <p className="library-card-sub">{story.subheading}</p> : null}
                <div className="library-card-actions">
                  <button
                    type="button"
                    className="library-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/library/${story.id}`, { state: { edit: true } });
                    }}
                  >
                    <FiEdit2 aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    className="library-btn library-btn--danger"
                    disabled={deletingId === story.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(story);
                    }}
                  >
                    <FiTrash2 aria-hidden /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Library;
