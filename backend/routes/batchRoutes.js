const express = require('express');
const db = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use('/batches', authenticate, authorizeRoles('admin', 'coach'));

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  const s = String(value || 'active').trim().toLowerCase();
  if (['active', 'archived'].includes(s)) return s;
  return 'active';
}

function mapBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || null,
    status: row.status || 'active',
    student_count: Number(row.student_count) || 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mapStudentBrief(row) {
  if (!row) return null;
  return {
    id: row.id,
    player_name: row.player_name,
    chess_com_id: row.chess_com_id || null,
    email: row.email || null,
    status: row.status || 'active',
    joining_date: row.joining_date || null,
    added_at: row.added_at || null,
  };
}

/** GET /api/batches */
router.get('/batches', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let sql = `
      SELECT b.*,
             (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.id) AS student_count
      FROM batches b
      WHERE 1=1`;
    if (q) {
      const like = `%${q}%`;
      params.push(like, like);
      sql += ` AND (b.name LIKE $1 OR IFNULL(b.description,'') LIKE $2)`;
    }
    sql += ` ORDER BY b.created_at DESC, b.id DESC`;
    const { rows } = await db.query(sql, params);
    return res.json({ batches: rows.map(mapBatch), count: rows.length });
  } catch (err) {
    console.error('[batches] list:', err.message);
    return res.status(500).json({ message: 'Failed to load batches.' });
  }
});

/** GET /api/batches/:id */
router.get('/batches/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM batch_students bs WHERE bs.batch_id = b.id) AS student_count
       FROM batches b
       WHERE b.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Batch not found.' });

    const students = await db.query(
      `SELECT s.id, s.player_name, s.chess_com_id, s.status, s.joining_date,
              l.email, bs.added_at
       FROM batch_students bs
       INNER JOIN Students s ON s.id = bs.student_id
       INNER JOIN "Login" l ON l.id = s.login_id
       WHERE bs.batch_id = $1
       ORDER BY s.player_name ASC, s.id ASC`,
      [id]
    );

    return res.json({
      batch: mapBatch(rows[0]),
      students: students.rows.map(mapStudentBrief),
    });
  } catch (err) {
    console.error('[batches] get:', err.message);
    return res.status(500).json({ message: 'Failed to load batch.' });
  }
});

/** POST /api/batches — body: { name, description?, status? } */
router.post('/batches', async (req, res) => {
  const name = normalizeName(req.body?.name);
  const description = String(req.body?.description || '').trim() || null;
  const status = normalizeStatus(req.body?.status);

  if (!name) {
    return res.status(400).json({ message: 'Batch name is required.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO batches (name, description, status, created_at, updated_at)
       VALUES ($1, $2, $3, datetime('now'), datetime('now'))
       RETURNING *`,
      [name, description, status]
    );
    return res.status(201).json({
      batch: mapBatch({ ...rows[0], student_count: 0 }),
    });
  } catch (err) {
    console.error('[batches] create:', err.message);
    if (err.code === '23505' || /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ message: 'A batch with this name already exists.' });
    }
    return res.status(500).json({ message: err.message || 'Failed to create batch.' });
  }
});

/** PUT /api/batches/:id */
router.put('/batches/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const current = await db.query(`SELECT * FROM batches WHERE id = $1`, [id]);
    if (!current.rows[0]) {
      return res.status(404).json({ message: 'Batch not found.' });
    }
    const row = current.rows[0];

    const name = normalizeName(req.body?.name ?? row.name);
    const description =
      req.body?.description !== undefined
        ? String(req.body.description || '').trim() || null
        : row.description;
    const status = normalizeStatus(req.body?.status ?? row.status);

    if (!name) {
      return res.status(400).json({ message: 'Batch name is required.' });
    }

    const updated = await db.query(
      `UPDATE batches
       SET name = $1,
           description = $2,
           status = $3,
           updated_at = datetime('now')
       WHERE id = $4
       RETURNING *`,
      [name, description, status, id]
    );

    const countRes = await db.query(
      `SELECT COUNT(*) AS student_count FROM batch_students WHERE batch_id = $1`,
      [id]
    );

    return res.json({
      batch: mapBatch({
        ...updated.rows[0],
        student_count: countRes.rows[0]?.student_count || 0,
      }),
    });
  } catch (err) {
    console.error('[batches] update:', err.message);
    if (err.code === '23505' || /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ message: 'A batch with this name already exists.' });
    }
    return res.status(500).json({ message: err.message || 'Failed to update batch.' });
  }
});

/** DELETE /api/batches/:id */
router.delete('/batches/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await db.query(`DELETE FROM batches WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ message: 'Batch not found.' });
    return res.json({ message: 'Batch deleted.' });
  } catch (err) {
    console.error('[batches] delete:', err.message);
    return res.status(500).json({ message: 'Failed to delete batch.' });
  }
});

/**
 * POST /api/batches/:id/students
 * Body: { student_ids: number[] }
 * Adds students to the batch (idempotent; already-members are ignored).
 */
router.post('/batches/:id/students', async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    const batch = await db.query(`SELECT id FROM batches WHERE id = $1`, [batchId]);
    if (!batch.rows[0]) {
      return res.status(404).json({ message: 'Batch not found.' });
    }

    const rawIds = Array.isArray(req.body?.student_ids) ? req.body.student_ids : [];
    const studentIds = [
      ...new Set(
        rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
      ),
    ];

    if (!studentIds.length) {
      return res.status(400).json({ message: 'Provide at least one student_id.' });
    }

    const existing = await db.query(
      `SELECT id FROM Students WHERE id = ANY($1)`,
      [studentIds]
    );
    const foundIds = new Set(existing.rows.map((r) => Number(r.id)));
    const missing = studentIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      return res.status(404).json({
        message: `Student(s) not found: ${missing.join(', ')}`,
      });
    }

    let added = 0;
    for (const studentId of studentIds) {
      const result = await db.query(
        `INSERT INTO batch_students (batch_id, student_id, added_at)
         VALUES ($1, $2, datetime('now'))
         ON CONFLICT (batch_id, student_id) DO NOTHING`,
        [batchId, studentId]
      );
      added += Number(result.rowCount) || 0;
    }

    const students = await db.query(
      `SELECT s.id, s.player_name, s.chess_com_id, s.status, s.joining_date,
              l.email, bs.added_at
       FROM batch_students bs
       INNER JOIN Students s ON s.id = bs.student_id
       INNER JOIN "Login" l ON l.id = s.login_id
       WHERE bs.batch_id = $1
       ORDER BY s.player_name ASC, s.id ASC`,
      [batchId]
    );

    return res.json({
      added,
      students: students.rows.map(mapStudentBrief),
      message: added
        ? `Added ${added} student${added === 1 ? '' : 's'} to batch.`
        : 'All selected students were already in this batch.',
    });
  } catch (err) {
    console.error('[batches] add students:', err.message);
    return res.status(500).json({ message: err.message || 'Failed to add students.' });
  }
});

/** DELETE /api/batches/:id/students/:studentId */
router.delete('/batches/:id/students/:studentId', async (req, res) => {
  try {
    const batchId = Number(req.params.id);
    const studentId = Number(req.params.studentId);

    const { rowCount } = await db.query(
      `DELETE FROM batch_students WHERE batch_id = $1 AND student_id = $2`,
      [batchId, studentId]
    );
    if (!rowCount) {
      return res.status(404).json({ message: 'Student is not in this batch.' });
    }
    return res.json({ message: 'Student removed from batch.' });
  } catch (err) {
    console.error('[batches] remove student:', err.message);
    return res.status(500).json({ message: 'Failed to remove student from batch.' });
  }
});

module.exports = router;
