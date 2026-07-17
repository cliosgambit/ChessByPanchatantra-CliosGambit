/** Short-lived in-memory cache for list endpoints (avoids refetch on quick navigation). */
export function createListCache(fetchFn, ttlMs = 30_000) {
  let cache = { data: null, ts: 0, promise: null };

  async function get({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache.data && now - cache.ts < ttlMs) {
      return cache.data;
    }
    if (!force && cache.promise) {
      return cache.promise;
    }
    cache.promise = fetchFn()
      .then((data) => {
        cache = { data, ts: Date.now(), promise: null };
        return data;
      })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
    return cache.promise;
  }

  function invalidate() {
    cache = { data: null, ts: 0, promise: null };
  }

  return { get, invalidate };
}
