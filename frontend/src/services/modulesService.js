import { getStoredToken } from './authService';
import { apiFetch } from '../utils/apiFetch';

function authHeaders(json = true) {
  const token = getStoredToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchModules() {
  return apiFetch('/api/modules', {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function fetchModule(id) {
  return apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createModule(payload) {
  return apiFetch('/api/modules', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateModule(id, payload) {
  return apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteModule(id) {
  return apiFetch(`/api/modules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function addStoryToModule(moduleId, storyId, visibleToStudents = true) {
  return apiFetch(`/api/modules/${encodeURIComponent(moduleId)}/stories`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      story_id: storyId,
      visible_to_students: visibleToStudents,
    }),
  });
}

export async function updateModuleStoryVisibility(moduleId, storyId, visibleToStudents) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/stories/${encodeURIComponent(storyId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ visible_to_students: visibleToStudents }),
    }
  );
}

export async function removeStoryFromModule(moduleId, storyId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/stories/${encodeURIComponent(storyId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
}

export async function fetchModuleStory(moduleId, storyId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/stories/${encodeURIComponent(storyId)}`,
    {
      headers: authHeaders(),
      cache: 'no-store',
    }
  );
}

export async function fetchModuleMoralPuzzles(moduleId, storyId, moralId) {
  return apiFetch(
    `/api/modules/${encodeURIComponent(moduleId)}/stories/${encodeURIComponent(storyId)}/morals/${encodeURIComponent(moralId)}/puzzles`,
    {
      headers: authHeaders(),
      cache: 'no-store',
    }
  );
}
