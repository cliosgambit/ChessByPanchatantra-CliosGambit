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
    const { rows } = await db.query(
      `SELECT id, full_name, email, role, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'User account is inactive or not found.' });
    }

    return res.json({ user: mapUser(user) });
  } catch (err) {
    console.error('Auth me error:', err.message);
    return res.status(500).json({ message: 'Unable to load user profile.' });
  }
};
