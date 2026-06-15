const bcrypt = require('bcrypt');
const db = require('../api/config/database');
const { signToken } = require('../utils/jwt');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: (row.role || 'student').toLowerCase(),
  };
}

exports.login = async (req, res) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, password_hash, role, is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const safeUser = mapUser(user);
    const token = signToken(safeUser, Boolean(rememberMe));

    return res.json({
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    if (err.message?.includes('relation "users" does not exist')) {
      return res.status(503).json({
        message: 'Authentication is not ready. Restart the backend server and try again.',
      });
    }
    return res.status(500).json({ message: 'Unable to sign in. Please try again.' });
  }
};

exports.logout = async (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
};

exports.me = async (req, res) => {
  try {
    if (req.user?.email) {
      const { rows } = await db.query(
        `SELECT id, full_name, email, role, is_active
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [req.user.email]
      );
      const user = rows[0];
      if (user?.is_active) {
        return res.json({ user: mapUser(user) });
      }
    }

    if (req.user?.id != null && Number.isFinite(Number(req.user.id))) {
      const { rows } = await db.query(
        `SELECT id, full_name, email, role, is_active
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [req.user.id]
      );
      const user = rows[0];
      if (user?.is_active) {
        return res.json({ user: mapUser(user) });
      }
    }

    if (req.user?.id) {
      const { rows } = await db.query(
        `SELECT "Chess_com_ID", "Player_Name", email, "Role"
         FROM "Login"
         WHERE LOWER("Chess_com_ID") = LOWER($1)
         LIMIT 1`,
        [String(req.user.id)]
      );
      const loginUser = rows[0];
      if (loginUser) {
        return res.json({
          user: {
            id: loginUser.Chess_com_ID,
            full_name: loginUser.Player_Name || loginUser.Chess_com_ID,
            email: loginUser.email,
            role: (loginUser.Role || 'student').toLowerCase(),
          },
        });
      }
    }

    return res.status(401).json({ message: 'User account is inactive or not found.' });
  } catch (err) {
    console.error('Auth me error:', err.message);
    return res.status(500).json({ message: 'Unable to load user profile.' });
  }
};
