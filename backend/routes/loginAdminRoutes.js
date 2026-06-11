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

router.use(authenticate, authorizeRoles('admin'));

router.post('/admin/login-users', async (req, res) => {
  const { Chess_com_ID, Player_Name, email, password, Role } = req.body;

  if (!Chess_com_ID || !email || !password) {
    return res.status(400).json({ message: 'Chess_com_ID, email, and password are required.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO "Login" ("Chess_com_ID", "Player_Name", email, password, "Role")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "Chess_com_ID", "Player_Name", email, "Role"`,
      [Chess_com_ID.trim(), Player_Name || Chess_com_ID.trim(), email.trim().toLowerCase(), passwordHash, Role || 'student']
    );

    await syncUsersTableRow(rows[0], passwordHash);
    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('Create login user error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A user with this Chess.com ID or email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to create user.' });
  }
});

router.put('/admin/login-users/:chessComId', async (req, res) => {
  const { chessComId } = req.params;
  const { Player_Name, email, password, Role } = req.body;

  try {
    const passwordHash = password ? await hashPassword(password) : null;

    const { rows } = await db.query(
      `UPDATE "Login"
       SET "Player_Name" = COALESCE($2, "Player_Name"),
           email = COALESCE($3, email),
           password = COALESCE($4, password),
           "Role" = COALESCE($5, "Role")
       WHERE "Chess_com_ID" = $1
       RETURNING "Chess_com_ID", "Player_Name", email, "Role", password`,
      [chessComId, Player_Name || null, email ? email.trim().toLowerCase() : null, passwordHash, Role || null]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await syncUsersTableRow(rows[0], rows[0].password);
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update login user error:', err.message);
    return res.status(500).json({ message: 'Failed to update user.' });
  }
});

router.delete('/admin/login-users/:chessComId', async (req, res) => {
  const { chessComId } = req.params;
  try {
    const loginRes = await db.query(`DELETE FROM "Login" WHERE "Chess_com_ID" = $1 RETURNING email`, [chessComId]);
    if (!loginRes.rows[0]) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (loginRes.rows[0].email) {
      await db.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [loginRes.rows[0].email]);
    }
    return res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('Delete login user error:', err.message);
    return res.status(500).json({ message: 'Failed to delete user.' });
  }
});

async function syncUsersTableRow(row, passwordHash) {
  if (!row?.email) return;
  const role = (row.Role || 'student').toLowerCase();
  const isPaused = role === 'paused';
  await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active`,
    [row.Chess_com_ID || row.Player_Name, row.email, passwordHash, isPaused ? 'student' : role, !isPaused]
  );
}

module.exports = router;
