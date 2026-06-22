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

function normalizeChessComId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePlayerName(value) {
  return String(value || '').trim();
}

router.use('/admin', authenticate, authorizeRoles('admin'));

router.post('/admin/login-users', async (req, res) => {
  const { Chess_com_ID, Player_Name, email, password, Role } = req.body;

  const chessComId = normalizeChessComId(Chess_com_ID);
  const playerName = normalizePlayerName(Player_Name);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!chessComId || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'Chess.com ID, email, and password are required.' });
  }

  if (!playerName) {
    return res.status(400).json({ message: 'Player name is required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO "Login" ("Chess_com_ID", "Player_Name", email, password, "Role", created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING "Chess_com_ID", "Player_Name", email, "Role"`,
      [chessComId, playerName, normalizedEmail, passwordHash, Role || 'student']
    );

    await syncPlayersTableRow(rows[0]);

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('Create login user error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A player with this Chess.com ID or email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to create player.' });
  }
});

router.put('/admin/login-users/:chessComId', async (req, res) => {
  const chessComId = normalizeChessComId(req.params.chessComId);
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
       WHERE LOWER("Chess_com_ID") = LOWER($1)
       RETURNING "Chess_com_ID", "Player_Name", email, "Role", password`,
      [
        chessComId,
        playerName || null,
        email ? String(email).trim().toLowerCase() : null,
        passwordHash,
        Role || null,
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'Player not found.' });
    }

    await syncPlayersTableRow(rows[0]);
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update login user error:', err.message);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A player with this email already exists.' });
    }
    return res.status(500).json({ message: 'Failed to update player.' });
  }
});

router.delete('/admin/login-users/:chessComId', async (req, res) => {
  const chessComId = normalizeChessComId(req.params.chessComId);
  try {
    const loginRes = await db.query(
      `DELETE FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1) RETURNING "Chess_com_ID"`,
      [chessComId]
    );
    if (!loginRes.rows[0]) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    await db.query('DELETE FROM players WHERE LOWER("Chess_com_ID") = LOWER($1)', [
      loginRes.rows[0].Chess_com_ID,
    ]);
    return res.json({ message: 'Player deleted.' });
  } catch (err) {
    console.error('Delete login user error:', err.message);
    return res.status(500).json({ message: 'Failed to delete player.' });
  }
});

async function syncPlayersTableRow(row) {
  const chessComId = normalizeChessComId(row?.Chess_com_ID);
  const playerName = normalizePlayerName(row?.Player_Name);
  if (!chessComId || !playerName) return;

  await db.query(
    `INSERT INTO players ("Chess_com_ID", "Player_Name")
     VALUES ($1, $2)
     ON CONFLICT ("Chess_com_ID") DO UPDATE SET
       "Player_Name" = EXCLUDED."Player_Name"`,
    [chessComId, playerName]
  );
}

module.exports = router;
