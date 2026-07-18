export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

/** True only for the admin role. */
export function isAdmin(role) {
  return normalizeRole(role) === 'admin';
}

/** True only for the coach role. */
export function isCoach(role) {
  return normalizeRole(role) === 'coach';
}

/**
 * Content management (modules, library, students, etc.).
 * Admin and coach both manage app content; system tools stay admin-only.
 */
export function canManageContent(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'coach';
}
