const express = require('express');
const db = require('../api/config/database');
const { isPostgres } = require('../api/config/database');
const { authenticate, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

const SYSTEM_TABLES = new Set(['sqlite_sequence', 'sqlite_stat1', 'sqlite_stat4']);

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function listUserTables() {
  if (isPostgres) {
    const { rows } = await db.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return rows.map((r) => r.name);
  }

  const { rows } = await db.query(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
     ORDER BY name COLLATE NOCASE`
  );
  return rows.map((r) => r.name).filter((n) => n && !SYSTEM_TABLES.has(n));
}

async function assertKnownTable(table) {
  const tables = await listUserTables();
  if (!tables.includes(table)) {
    const err = new Error('Unknown table.');
    err.status = 404;
    throw err;
  }
  return table;
}

async function getColumns(table) {
  const quoted = quoteIdent(table);
  if (isPostgres) {
    const { rows } = await db.query(
      `SELECT column_name AS name,
              data_type AS type,
              CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
              column_default AS dflt_value,
              CASE WHEN EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.table_schema = 'public'
                  AND tc.table_name = $1
                  AND tc.constraint_type = 'PRIMARY KEY'
                  AND kcu.column_name = c.column_name
              ) THEN 1 ELSE 0 END AS pk
       FROM information_schema.columns c
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    return rows.map((c) => ({
      name: c.name,
      type: c.type || 'TEXT',
      pk: Boolean(Number(c.pk)),
      notnull: Boolean(Number(c.notnull)),
      dflt_value: c.dflt_value,
    }));
  }

  const colsRes = await db.query(`PRAGMA table_info(${quoted})`);
  return colsRes.rows.map((c) => ({
    name: c.name,
    type: c.type || 'TEXT',
    pk: Boolean(c.pk),
    notnull: Boolean(c.notnull),
    dflt_value: c.dflt_value,
  }));
}

/** GET /api/tables — list all tables (admin) */
router.get('/tables', authenticate, authorizeRoles('admin'), async (_req, res) => {
  try {
    const names = await listUserTables();
    const tables = [];
    for (const name of names) {
      const countRes = await db.query(`SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`);
      tables.push({
        name,
        rowCount: Number(countRes.rows[0]?.count) || 0,
      });
    }
    return res.json({ tables });
  } catch (err) {
    console.error('[tableBrowser] list:', err.message);
    return res.status(500).json({ message: 'Failed to list tables.' });
  }
});

/** GET /api/tables/:table — first N rows + column info (admin) */
router.get('/tables/:table', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const table = decodeURIComponent(req.params.table);
    await assertKnownTable(table);

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const quoted = quoteIdent(table);

    const columns = await getColumns(table);
    const countRes = await db.query(`SELECT COUNT(*) AS count FROM ${quoted}`);
    const { rows } = await db.query(`SELECT * FROM ${quoted} LIMIT ${limit}`);

    return res.json({
      table,
      columns,
      rowCount: Number(countRes.rows[0]?.count) || 0,
      limit,
      rows,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status !== 500) return res.status(status).json({ message: err.message });
    console.error('[tableBrowser] preview:', err.message);
    return res.status(500).json({ message: 'Failed to load table rows.' });
  }
});

module.exports = router;
