const { verifyToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded.user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

/** True only for admin. */
function isAdmin(role) {
  return normalizeRole(role) === 'admin';
}

/** Admin + coach content management (not workers/settings). */
function canManageContent(role) {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'coach';
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const role = normalizeRole(req.user.role);
    const allowed = roles.map((r) => String(r).toLowerCase());
    if (allowed.includes(role)) {
      return next();
    }

    return res.status(403).json({ message: 'You do not have permission to access this resource.' });
  };
}

module.exports = {
  authenticate,
  authorizeRoles,
  isAdmin,
  canManageContent,
  normalizeRole,
};
