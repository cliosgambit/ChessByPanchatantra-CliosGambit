export const BACKEND_UNAVAILABLE_MSG =
  'Backend server unavailable. From the project root run: npm run dev — or start backend only: cd backend && npm start (port 10000).';

export function isBackendUnavailable(data) {
  return data?.code === 'BACKEND_UNAVAILABLE';
}

export async function parseApiResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      throw new Error('Invalid JSON response from server.');
    }
  }

  if (!response.ok) {
    if (response.status === 503 && isBackendUnavailable(data)) {
      throw new Error(data.error || BACKEND_UNAVAILABLE_MSG);
    }
    // Legacy abort status (should be rare now).
    if (response.status === 499) {
      const cancelErr = new Error(data.error || data.message || 'Detection cancelled.');
      cancelErr.name = 'AbortError';
      cancelErr.cancelled = true;
      throw cancelErr;
    }
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  // Soft-cancel payloads use HTTP 200 with cancelled:true.
  if (data?.cancelled) {
    const cancelErr = new Error(data.error || data.message || 'Detection cancelled.');
    cancelErr.name = 'AbortError';
    cancelErr.cancelled = true;
    throw cancelErr;
  }

  return data;
}

export async function apiFetch(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error(BACKEND_UNAVAILABLE_MSG);
  }
  return parseApiResponse(response);
}
