/**
 * Reads a column whether PostgREST returns PascalCase or lowercase keys.
 */
export function col(row, ...keys) {
  if (!row) return null;
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

export function normalizeKeys(row, keyMap) {
  if (!row) return null;
  const out = {};
  for (const [target, sources] of Object.entries(keyMap)) {
    const keys = Array.isArray(sources) ? sources : [sources];
    out[target] = col(row, ...keys);
  }
  return out;
}
