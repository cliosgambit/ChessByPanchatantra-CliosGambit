const bcrypt = require('bcrypt');
const db = require('../api/config/database');
const { signToken } = require('../utils/jwt');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapLoginUser(row) {
  const roleRaw = (row.Role || 'student').toLowerCase();
  return {
    id: row.id != null ? String(row.id) : row.email,
    full_name: row.Player_Name || row.email,
    email: row.email,
    role: roleRaw === 'paused' ? 'student' : roleRaw,
  };
}

function isLoginActive(row) {
  return row && row.password && (row.Role || '').toLowerCase() !== 'paused';
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
      `SELECT id, "Player_Name", email, password, "Role"
       FROM "Login"
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];

    if (!isLoginActive(user)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const safeUser = mapLoginUser(user);
    const token = signToken(safeUser, Boolean(rememberMe));

    return res.json({
      token,
      user: safeUser,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ message: 'Unable to sign in. Please try again.' });
  }
};

exports.logout = async (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
};

async function fetchLoginIdentity({ email, id }) {
  if (email) {
    const { rows } = await db.query(
      `SELECT id, "Player_Name", email, "Role", password
       FROM "Login"
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  }

  if (id != null && id !== '') {
    const { rows } = await db.query(
      `SELECT id, "Player_Name", email, "Role", password
       FROM "Login"
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  return null;
}

exports.me = async (req, res) => {
  try {
    const loginUser = await fetchLoginIdentity({
      email: req.user?.email,
      id: req.user?.id,
    });

    if (isLoginActive(loginUser)) {
      return res.json({ user: mapLoginUser(loginUser) });
    }

    return res.status(401).json({ message: 'User account is inactive or not found.' });
  } catch (err) {
    console.error('Auth me error:', err.message);
    return res.status(500).json({ message: 'Unable to load user profile.' });
  }
};
