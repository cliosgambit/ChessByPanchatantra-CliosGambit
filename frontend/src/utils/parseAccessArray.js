/** Normalize mod/chap/story access from API (array, JSON string, or Postgres {a,b} text). */
export function parseAccessArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        /* fall through to Postgres-style parse */
      }
    }
    return trimmed
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }

  return [];
}
