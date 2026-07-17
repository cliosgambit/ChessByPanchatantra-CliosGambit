import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';
import { createListCache } from './listCache';

function authHeaders(json = true) {
  const token = getStoredToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const modulesCache = createListCache(() =>
  apiFetch('/api/modules', {
    headers: authHeaders(),
    cache: 'no-store',
  })
);

export async function fetchModules(options) {
  return modulesCache.get(options);
}

export async function fetchModule(id) {
  return apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createModule(payload) {
  const data = await apiFetch('/api/modules', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  modulesCache.invalidate();
  return data;
}

export async function updateModule(id, payload) {
  const data = await apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  modulesCache.invalidate();
  return data;
}

export async function deleteModule(id) {
  const data = await apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  modulesCache.invalidate();
  return data;
}

export async function createChapter(moduleId, payload) {
  const data = await apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    }
  );
  modulesCache.invalidate();
  return data;
}

export async function fetchChapter(moduleId, chapterId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}`,
    {
      headers: authHeaders(),
      cache: 'no-store',
    }
  );
}

export async function updateChapter(moduleId, chapterId, payload) {
  const data = await apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    }
  );
  modulesCache.invalidate();
  return data;
}

export async function deleteChapter(moduleId, chapterId) {
  const data = await apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  modulesCache.invalidate();
  return data;
}

export async function addStoryToChapter(moduleId, chapterId, storyId, visibleToStudents = true) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}/stories`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        story_id: storyId,
        visible_to_students: visibleToStudents,
      }),
    }
  );
}

export async function updateChapterStoryVisibility(
  moduleId,
  chapterId,
  storyId,
  visibleToStudents
) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}/stories/${encodeURIComponent(storyId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ visible_to_students: visibleToStudents }),
    }
  );
}

export async function removeStoryFromChapter(moduleId, chapterId, storyId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}/stories/${encodeURIComponent(storyId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
}

export async function fetchChapterStory(moduleId, chapterId, storyId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}/stories/${encodeURIComponent(storyId)}`,
    {
      headers: authHeaders(),
      cache: 'no-store',
    }
  );
}

export async function fetchChapterMoralPuzzles(moduleId, chapterId, storyId, moralId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/chapters/${encodeURIComponent(chapterId)}/stories/${encodeURIComponent(storyId)}/morals/${encodeURIComponent(moralId)}/puzzles`,
    {
      headers: authHeaders(),
      cache: 'no-store',
    }
  );
}
