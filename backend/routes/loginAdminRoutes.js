const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

async function hashPassword(password) {
  if (!password) return null;
  if (BCRYPT_HASH_REGEX.test(password)) return password;
  return bcrypt.hash(password, SALT_ROUNDS);
}

function normalizePlayerName(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

router.use('/admin', authenticate, authorizeRoles('admin', 'coach'));

router.post('/admin/login-users', async (req, res) => {
  const { Player_Name, email, password, Role } = req.body;

  const playerName = normalizePlayerName(Player_Name);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!playerName) {
    return res.status(400).json({ message: 'Player name is required.' });
  }

  if (password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO "Login" ("Player_Name", email, password, "Role", created_at)
       VALUES ($1, $2, $3, $4, datetime('now'))
       RETURNING id, "Player_Name", email, "Role"`,
      [playerName, normalizedEmail, passwordHash, Role || 'student']
    );

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('Create login user error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to create user.' });
  }
});

router.put('/admin/login-users/:email', async (req, res) => {
  const targetEmail = normalizeEmail(req.params.email);
  const { Player_Name, email, password, Role } = req.body;

  const playerName = Player_Name != null ? normalizePlayerName(Player_Name) : null;
  if (Player_Name != null && !playerName) {
    return res.status(400).json({ message: 'Player name cannot be empty.' });
  }

  try {
    const passwordHash = password ? await hashPassword(password) : null;

    const { rows } = await db.query(
      `UPDATE "Login"
       SET "Player_Name" = COALESCE($2, "Player_Name"),
           email = COALESCE($3, email),
           password = COALESCE($4, password),
           "Role" = COALESCE($5, "Role")
       WHERE LOWER(email) = LOWER($1)
       RETURNING id, "Player_Name", email, "Role"`,
      [
        targetEmail,
        playerName || null,
        email ? normalizeEmail(email) : null,
        passwordHash,
        Role || null,
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update login user error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to update user.' });
  }
});

router.delete('/admin/login-users/:email', async (req, res) => {
  const targetEmail = normalizeEmail(req.params.email);
  try {
    const loginRes = await db.query(
      `DELETE FROM "Login" WHERE LOWER(email) = LOWER($1) RETURNING id, email`,
      [targetEmail]
    );
    if (!loginRes.rows[0]) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('Delete login user error:', err.message);
    return res.status(500).json({ message: 'Failed to delete user.' });
  }
});

module.exports = router;
