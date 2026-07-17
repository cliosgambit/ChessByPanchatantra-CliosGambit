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

const storiesCache = createListCache(() =>
  apiFetch('/api/library/stories', {
    headers: authHeaders(),
    cache: 'no-store',
  })
);

export async function fetchLibraryStories(options) {
  return storiesCache.get(options);
}

export async function fetchLibraryStory(id) {
  return apiFetch(`/api/library/stories/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createLibraryStory(payload) {
  const data = await apiFetch('/api/library/stories', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  storiesCache.invalidate();
  return data;
}

export async function updateLibraryStory(id, payload) {
  const data = await apiFetch(`/api/library/stories/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  storiesCache.invalidate();
  return data;
}

export async function deleteLibraryStory(id) {
  const data = await apiFetch(`/api/library/stories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  storiesCache.invalidate();
  return data;
}

export async function fetchLibraryMorals() {
  return apiFetch('/api/library/morals', {
    headers: authHeaders(),
    cache: 'no-store',
  });
}

export async function createLibraryMoral(moral_name) {
  return apiFetch('/api/library/morals', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ moral_name }),
  });
}

export async function deleteLibraryMoral(id) {
  return apiFetch(`/api/library/morals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

/** Upload one or more image files; returns public paths under /story_images/. */
export async function uploadLibraryImages(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) throw new Error('No files selected.');

  const body = new FormData();
  for (const file of list) {
    body.append('images', file, file.name || `image-${Date.now()}.png`);
  }

  const data = await apiFetch('/api/library/upload', {
    method: 'POST',
    headers: authHeaders(false),
    body,
  });

  const urls = Array.isArray(data?.urls)
    ? data.urls
    : data?.url
    ? [data.url]
    : [];
  if (!urls.length) {
    throw new Error('Upload succeeded but no image URLs were returned.');
  }
  return { ...data, urls, url: urls[0] };
}

/** Story + moral + assigned puzzles */
export async function fetchMoralPuzzles(storyId, moralId) {
  return apiFetch(
    `/api/library/stories/${encodeURIComponent(storyId)}/morals/${encodeURIComponent(moralId)}/puzzles`,
    { headers: authHeaders(), cache: 'no-store' }
  );
}

export async function assignMoralPuzzle(storyId, moralId, { source, puzzle_id }) {
  return apiFetch(
    `/api/library/stories/${encodeURIComponent(storyId)}/morals/${encodeURIComponent(moralId)}/puzzles`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ source, puzzle_id }),
    }
  );
}

export async function unassignMoralPuzzle(storyId, moralId, assignmentId) {
  return apiFetch(
    `/api/library/stories/${encodeURIComponent(storyId)}/morals/${encodeURIComponent(moralId)}/puzzles/${encodeURIComponent(assignmentId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
}
