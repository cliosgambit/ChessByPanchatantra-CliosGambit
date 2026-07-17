const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

router.use('/students', authenticate, authorizeRoles('admin'));

async function hashPassword(password) {
  if (!password) return null;
  if (BCRYPT_HASH_REGEX.test(String(password))) return String(password);
  return bcrypt.hash(String(password), SALT_ROUNDS);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeChessComId(value) {
  const s = String(value || '').trim();
  return s || null;
}

function normalizeStatus(value) {
  const s = String(value || 'active').trim().toLowerCase();
  if (['active', 'paused', 'left'].includes(s)) return s;
  return 'active';
}

function mapStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    login_id: row.login_id,
    chess_com_id: row.chess_com_id || null,
    player_name: row.player_name,
    joining_date: row.joining_date,
    status: row.status || 'active',
    phone: row.phone || null,
    notes: row.notes || null,
    email: row.email || null,
    role: row.Role || row.role || 'student',
    batches: Array.isArray(row.batches) ? row.batches : [],
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadBatchesForStudents(studentIds) {
  const ids = [...new Set((studentIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length) return new Map();

  const { rows } = await db.query(
    `SELECT bs.student_id, b.id, b.name, b.status
     FROM batch_students bs
     INNER JOIN batches b ON b.id = bs.batch_id
     WHERE bs.student_id = ANY($1)
     ORDER BY b.name ASC`,
    [ids]
  );

  const map = new Map();
  for (const row of rows) {
    const sid = Number(row.student_id);
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push({
      id: row.id,
      name: row.name,
      status: row.status || 'active',
    });
  }
  return map;
}

async function ensurePlayerRow(chessComId, playerName) {
  if (!chessComId) return;
  await db.query(
    `INSERT INTO players ("Chess_com_ID", "Player_Name")
     VALUES ($1, $2)
     ON CONFLICT ("Chess_com_ID") DO UPDATE SET
       "Player_Name" = COALESCE(excluded."Player_Name", players."Player_Name")`,
    [chessComId, playerName || chessComId]
  );
}

/** GET /api/students */
router.get('/students', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let sql = `
      SELECT s.*, l.email, l."Role"
      FROM Students s
      INNER JOIN "Login" l ON l.id = s.login_id
      WHERE 1=1`;
    if (q) {
      const like = `%${q}%`;
      params.push(like, like, like, like);
      sql += ` AND (
        s.player_name LIKE $1
        OR IFNULL(s.chess_com_id,'') LIKE $2
        OR IFNULL(l.email,'') LIKE $3
        OR CAST(s.id AS TEXT) LIKE $4
      )`;
    }
    sql += ` ORDER BY s.joining_date DESC, s.id DESC`;
    const { rows } = await db.query(sql, params);
    const batchMap = await loadBatchesForStudents(rows.map((r) => r.id));
    const students = rows.map((row) =>
      mapStudent({ ...row, batches: batchMap.get(Number(row.id)) || [] })
    );
    return res.json({ students, count: students.length });
  } catch (err) {
    console.error('[students] list:', err.message);
    return res.status(500).json({ message: 'Failed to load students.' });
  }
});

/** POST /api/students/sync-all — sync Chess.com for every student with a chess_com_id */
router.post('/students/sync-all', async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT LOWER(chess_com_id) AS chess_com_id
       FROM Students
       WHERE chess_com_id IS NOT NULL AND TRIM(chess_com_id) != ''`
    );
    const ids = rows.map((r) => r.chess_com_id).filter(Boolean);
    if (!ids.length) {
      return res.json({
        ok: true,
        message: 'No students with Chess.com IDs to sync.',
        count: 0,
      });
    }

    const syncService = require('../api/services/chessComSyncService');
    const result = await syncService.runBulkSync({
      chessComIds: ids,
      forceFull: false,
    });

    return res.json({
      ok: true,
      count: ids.length,
      chessComIds: ids,
      archivesFetched: result.archivesFetched,
      archivesSkipped: result.archivesSkipped,
      gamesUpserted: result.gamesUpserted,
      batchId: result.batchId,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('[students] sync-all:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to sync students.' });
  }
});

/** GET /api/students/:id */
router.get('/students/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, l.email, l."Role"
       FROM Students s
       INNER JOIN "Login" l ON l.id = s.login_id
       WHERE s.id = $1`,
      [Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Student not found.' });
    const batchMap = await loadBatchesForStudents([rows[0].id]);
    return res.json({
      student: mapStudent({
        ...rows[0],
        batches: batchMap.get(Number(rows[0].id)) || [],
      }),
    });
  } catch (err) {
    console.error('[students] get:', err.message);
    return res.status(500).json({ message: 'Failed to load student.' });
  }
});

/**
 * POST /api/students
 * Body: player_name, email, password, chess_com_id?, joining_date?, phone?, notes?, status?
 */
router.post('/students', async (req, res) => {
  const playerName = normalizeName(req.body?.player_name || req.body?.Player_Name);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const chessComId = normalizeChessComId(req.body?.chess_com_id || req.body?.Chess_com_ID);
  const joiningDate =
    String(req.body?.joining_date || '').trim() ||
    new Date().toISOString().slice(0, 10);
  const phone = String(req.body?.phone || '').trim() || null;
  const notes = String(req.body?.notes || '').trim() || null;
  const status = normalizeStatus(req.body?.status);

  if (!playerName) {
    return res.status(400).json({ message: 'Player name is required.' });
  }
  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters.' });
  }

  try {
    await db.query('BEGIN');

    const existing = await db.query(
      `SELECT id FROM "Login" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (existing.rows[0]) {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: 'A login with this email already exists.' });
    }

    if (chessComId) {
      const taken = await db.query(
        `SELECT id FROM Students WHERE LOWER(chess_com_id) = LOWER($1) LIMIT 1`,
        [chessComId]
      );
      if (taken.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: 'This Chess.com ID is already registered.' });
      }
      await ensurePlayerRow(chessComId, playerName);
    }

    const passwordHash = await hashPassword(password);
    const loginIns = await db.query(
      `INSERT INTO "Login" ("Player_Name", email, password, "Role", created_at)
       VALUES ($1, $2, $3, 'student', datetime('now'))
       RETURNING id, email, "Role"`,
      [playerName, email, passwordHash]
    );
    const loginId = loginIns.rows[0].id;

    const studentIns = await db.query(
      `INSERT INTO Students
         (login_id, chess_com_id, player_name, joining_date, status, phone, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'), datetime('now'))
       RETURNING *`,
      [loginId, chessComId, playerName, joiningDate, status, phone, notes]
    );

    await db.query('COMMIT');

    return res.status(201).json({
      student: mapStudent({
        ...studentIns.rows[0],
        email: loginIns.rows[0].email,
        Role: loginIns.rows[0].Role,
      }),
    });
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[students] create:', err.message);
    if (err.code === '23505' || /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ message: 'Email or Chess.com ID already exists.' });
    }
    return res.status(500).json({ message: err.message || 'Failed to register student.' });
  }
});

/**
 * PUT /api/students/:id
 * Update profile fields (+ optional email / chess_com_id)
 */
router.put('/students/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await db.query(
      `SELECT s.*, l.email FROM Students s
       INNER JOIN "Login" l ON l.id = s.login_id
       WHERE s.id = $1`,
      [id]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const row = current.rows[0];

    const playerName = normalizeName(req.body?.player_name ?? row.player_name);
    const chessComId =
      req.body?.chess_com_id !== undefined
        ? normalizeChessComId(req.body.chess_com_id)
        : row.chess_com_id;
    const joiningDate =
      String(req.body?.joining_date ?? row.joining_date).trim() || row.joining_date;
    const status = normalizeStatus(req.body?.status ?? row.status);
    const phone =
      req.body?.phone !== undefined
        ? String(req.body.phone || '').trim() || null
        : row.phone;
    const notes =
      req.body?.notes !== undefined
        ? String(req.body.notes || '').trim() || null
        : row.notes;
    const email =
      req.body?.email !== undefined ? normalizeEmail(req.body.email) : row.email;

    if (!playerName) {
      return res.status(400).json({ message: 'Player name is required.' });
    }
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    await db.query('BEGIN');

    if (email.toLowerCase() !== String(row.email || '').toLowerCase()) {
      const clash = await db.query(
        `SELECT id FROM "Login" WHERE LOWER(email) = LOWER($1) AND id != $2 LIMIT 1`,
        [email, row.login_id]
      );
      if (clash.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: 'Another account already uses this email.' });
      }
    }

    if (chessComId && chessComId !== row.chess_com_id) {
      const taken = await db.query(
        `SELECT id FROM Students WHERE LOWER(chess_com_id) = LOWER($1) AND id != $2 LIMIT 1`,
        [chessComId, id]
      );
      if (taken.rows[0]) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: 'This Chess.com ID is already registered.' });
      }
      await ensurePlayerRow(chessComId, playerName);
    }

    await db.query(
      `UPDATE "Login"
       SET "Player_Name" = $1, email = $2
       WHERE id = $3`,
      [playerName, email, row.login_id]
    );

    const updated = await db.query(
      `UPDATE Students
       SET chess_com_id = $1,
           player_name = $2,
           joining_date = $3,
           status = $4,
           phone = $5,
           notes = $6,
           updated_at = datetime('now')
       WHERE id = $7
       RETURNING *`,
      [chessComId, playerName, joiningDate, status, phone, notes, id]
    );

    await db.query('COMMIT');

    return res.json({
      student: mapStudent({ ...updated.rows[0], email, Role: 'student' }),
    });
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[students] update:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to update student.' });
  }
});

/** PUT /api/students/:id/password — body: { password } */
router.put('/students/:id/password', async (req, res) => {
  const password = String(req.body?.password || '');
  if (!password || password.length < 4) {
    return res.status(400).json({ message: 'Password must be at least 4 characters.' });
  }

  try {
    const { rows } = await db.query(`SELECT login_id FROM Students WHERE id = $1`, [
      Number(req.params.id),
    ]);
    if (!rows[0]) return res.status(404).json({ message: 'Student not found.' });

    const passwordHash = await hashPassword(password);
    await db.query(`UPDATE "Login" SET password = $1 WHERE id = $2`, [
      passwordHash,
      rows[0].login_id,
    ]);
    await db.query(
      `UPDATE Students SET updated_at = datetime('now') WHERE id = $1`,
      [Number(req.params.id)]
    );

    return res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('[students] password:', err.message);
    return res.status(500).json({ message: 'Failed to update password.' });
  }
});

/** DELETE /api/students/:id — removes student + login (cascade) */
router.delete('/students/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT login_id FROM Students WHERE id = $1`,
      [Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Student not found.' });

    // Deleting Login cascades to Students
    await db.query(`DELETE FROM "Login" WHERE id = $1`, [rows[0].login_id]);
    return res.json({ message: 'Student deleted.' });
  } catch (err) {
    console.error('[students] delete:', err.message);
    return res.status(500).json({ message: 'Failed to delete student.' });
  }
});

module.exports = router;
