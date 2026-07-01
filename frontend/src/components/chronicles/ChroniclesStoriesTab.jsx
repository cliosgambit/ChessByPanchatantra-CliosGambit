import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDisclosure, useToast } from '@chakra-ui/react';
import { FiEdit2, FiExternalLink, FiPlus, FiSearch } from 'react-icons/fi';
import LoadingPanel from '../common/LoadingPanel';
import ErrorPanel from '../common/ErrorPanel';
import EmptyState from '../common/EmptyState';
import EditStoryModal from '../stories/EditStoryModal';
import ChroniclesAddStoryModal from './ChroniclesAddStoryModal';
import {
  createStory,
  fetchAllStories,
  updateStory,
} from '../../services/curriculumService';

function normalizeStatus(status) {
  const value = String(status || 'published').toLowerCase();
  if (value === 'draft') return 'draft';
  if (value === 'active' || value === 'published') return 'published';
  return value;
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'published') return 'Published';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function StoryTitleCell({ story }) {
  const imageUrl = story.thumbnail_url?.trim();

  return (
    <td className={`chronicles-table-title${imageUrl ? ' chronicles-table-title--preview' : ''}`}>
      <span className="chronicles-table-title-text">{story.title || '—'}</span>
      {imageUrl ? (
        <div className="chronicles-image-preview" role="presentation">
          <img src={imageUrl} alt={story.title || 'Story thumbnail'} loading="lazy" />
        </div>
      ) : null}
    </td>
  );
}

function ChroniclesStoriesTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingStory, setEditingStory] = useState(null);

  const addModal = useDisclosure();
  const editModal = useDisclosure();

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllStories();
      setStories(rows);
    } catch (err) {
      setError(err.message || 'Failed to load stories.');
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const filteredStories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stories;
    return stories.filter((story) => {
      const haystack = [
        story.story_id,
        story.title,
        story.description,
        story.module_id,
        story.moduleLabel,
        story.chapter_id,
        story.chapterLabel,
        story.status,
        story.tags,
        story.story_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, stories]);

  const handleCreateStory = async (payload) => {
    setSaving(true);
    try {
      const storyId = `story-${Date.now()}`;
      await createStory({
        story_id: storyId,
        title: payload.title,
        description: payload.description,
        chapter_id: payload.chapter_id,
        module_id: payload.module_id,
        status: payload.status || 'active',
        story_type: payload.story_type,
        thumbnail_url: payload.thumbnail_url,
        themeKey: payload.themeKey,
        story_number: payload.story_number,
      });
      toast({
        title: 'Story created',
        description: `"${payload.title}" was added.`,
        status: 'success',
        duration: 2500,
      });
      addModal.onClose();
      await loadStories();
    } catch (err) {
      toast({ title: err.message || 'Failed to create story', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleEditStory = (story) => {
    setEditingStory(story);
    editModal.onOpen();
  };

  const handleUpdateStory = async (payload) => {
    setSaving(true);
    try {
      await updateStory(payload.story_id, {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        tags: payload.tags,
        story_type: payload.story_type,
        thumbnail_url: payload.thumbnail_url,
        themeKey: payload.themeKey,
      });
      toast({
        title: 'Story updated',
        status: 'success',
        duration: 2500,
      });
      editModal.onClose();
      setEditingStory(null);
      await loadStories();
    } catch (err) {
      toast({ title: err.message || 'Failed to update story', status: 'error', duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingPanel message="Loading stories…" />;
  }

  if (error) {
    return <ErrorPanel title="Stories unavailable" message={error} onRetry={loadStories} />;
  }

  return (
    <>
      <div className="chronicles-toolbar">
        <label className="chronicles-search">
          <FiSearch aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stories…"
            aria-label="Search stories"
          />
        </label>
        <div className="chronicles-toolbar-actions">
          <span className="chronicles-count">
            {filteredStories.length} of {stories.length} stories
          </span>
          <button type="button" className="chronicles-primary-btn" onClick={addModal.onOpen}>
            <FiPlus aria-hidden />
            Add Story
          </button>
        </div>
      </div>

      {filteredStories.length === 0 ? (
        <EmptyState
          title={search ? 'No stories match your search' : 'No stories yet'}
          subtitle={
            search
              ? 'Try a different title, ID, module, or chapter.'
              : 'Use Add Story to create your first story.'
          }
        />
      ) : (
        <div className="chronicles-table-wrap">
          <table className="chronicles-table">
            <thead>
              <tr>
                <th scope="col">Story ID</th>
                <th scope="col">Title</th>
                <th scope="col">Description</th>
                <th scope="col">Module</th>
                <th scope="col">Chapter</th>
                <th scope="col">Status</th>
                <th scope="col" className="chronicles-table-actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.map((story) => {
                const normalizedStatus = normalizeStatus(story.status);
                return (
                  <tr key={story.story_id} className="chronicles-table-row">
                    <td className="chronicles-table-id">{story.story_id}</td>
                    <StoryTitleCell story={story} />
                    <td className="chronicles-table-desc">{story.description || '—'}</td>
                    <td>{story.moduleLabel}</td>
                    <td>{story.chapterLabel}</td>
                    <td>
                      <span
                        className={`dashboard-status-pill dashboard-status-pill--${
                          normalizedStatus === 'draft' ? 'progress' : 'completed'
                        }`}
                      >
                        {statusLabel(story.status)}
                      </span>
                    </td>
                    <td className="chronicles-table-actions-col">
                      <div className="chronicles-row-actions">
                        <button
                          type="button"
                          className="chronicles-table-link-btn"
                          onClick={() => handleEditStory(story)}
                        >
                          <FiEdit2 aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="chronicles-table-link-btn"
                          onClick={() => navigate(`/api/story/${story.story_id}`)}
                        >
                          <FiExternalLink aria-hidden />
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ChroniclesAddStoryModal
        isOpen={addModal.isOpen}
        onClose={addModal.onClose}
        onCreate={handleCreateStory}
        saving={saving}
      />

      <EditStoryModal
        isOpen={editModal.isOpen}
        onClose={() => {
          editModal.onClose();
          setEditingStory(null);
        }}
        onSave={handleUpdateStory}
        story={editingStory}
        saving={saving}
      />
    </>
  );
}

export default ChroniclesStoriesTab;
