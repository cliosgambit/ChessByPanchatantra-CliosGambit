const express = require('express');
const db = require('../api/config/database');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

/** Maps API table name → SQL identifier (quoted when needed). */
const TABLE_SQL = {
  Login: '"Login"',
  players: 'players',
  players_activity: 'players_activity',
  player_games: 'player_games',
  brilliant_moves: 'brilliant_moves',
  module: 'module',
  chapter: 'chapter',
  story: 'story',
  principles: 'principles',
  principle_position: 'principle_position',
  chess_puzzle: 'chess_puzzle',
  '3000_rated_puzzles': '"3000_rated_puzzles"',
  roles_control: 'roles_control',
  story_mapping: 'story_mapping',
  users: 'users',
};

const WRITE_TABLES = new Set(['module', 'chapter', 'story', 'principles', 'principle_position', 'chess_puzzle']);

function sqlTable(table) {
  return TABLE_SQL[table] || null;
}

function quoteCol(col) {
  if (!col || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) return null;
  return `"${col}"`;
}

// Reads — no JWT required (same DB as Supabase; admin UI is behind login)
router.get('/data/:table', async (req, res) => {
  const sqlFrom = sqlTable(req.params.table);
  if (!sqlFrom) {
    return res.status(400).json({ message: 'Unknown table.' });
  }

  try {
    const orderCol = quoteCol(req.query.orderBy);
    const ascending = req.query.ascending !== 'false';
    const orderClause = orderCol ? ` ORDER BY ${orderCol} ${ascending ? 'ASC' : 'DESC'}` : '';
    const { rows } = await db.query(`SELECT * FROM ${sqlFrom}${orderClause}`);
    return res.json(rows);
  } catch (err) {
    console.error(`[dataRoutes] GET ${req.params.table}:`, err.message);
    return res.status(500).json({ message: 'Failed to fetch data.' });
  }
});

router.get('/data/:table/count', async (req, res) => {
  const table = req.params.table;
  const sqlFrom = sqlTable(table);
  if (!sqlFrom) {
    return res.status(400).json({ message: 'Unknown table.' });
  }

  try {
    if (table === 'Login' && req.query.role) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS count FROM ${sqlFrom} WHERE LOWER("Role") = LOWER($1)`,
        [req.query.role]
      );
      return res.json({ count: rows[0]?.count ?? 0 });
    }

    const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM ${sqlFrom}`);
    return res.json({ count: rows[0]?.count ?? 0 });
  } catch (err) {
    console.error(`[dataRoutes] COUNT ${table}:`, err.message);
    return res.status(500).json({ message: 'Failed to count rows.' });
  }
});

router.post('/data/:table', authenticate, async (req, res) => {
  const table = req.params.table;
  if (!WRITE_TABLES.has(table)) {
    return res.status(403).json({ message: 'Writes not allowed for this table.' });
  }

  const sqlFrom = sqlTable(table);
  const payload = req.body;
  const columns = Object.keys(payload);
  if (columns.length === 0) {
    return res.status(400).json({ message: 'Empty payload.' });
  }

  try {
    const cols = columns.map((c) => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((c) => payload[c]);
    const { rows } = await db.query(
      `INSERT INTO ${sqlFrom} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`[dataRoutes] POST ${table}:`, err.message);
    return res.status(500).json({ message: err.message || 'Insert failed.' });
  }
});

router.put('/data/:table/:column/:value', authenticate, async (req, res) => {
  const table = req.params.table;
  if (!WRITE_TABLES.has(table)) {
    return res.status(403).json({ message: 'Writes not allowed for this table.' });
  }

  const sqlFrom = sqlTable(table);
  const matchCol = quoteCol(req.params.column);
  if (!matchCol) {
    return res.status(400).json({ message: 'Invalid column.' });
  }

  const payload = req.body;
  const columns = Object.keys(payload);
  if (columns.length === 0) {
    return res.status(400).json({ message: 'Empty payload.' });
  }

  try {
    const sets = columns.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const values = [...columns.map((c) => payload[c]), req.params.value];
    const { rows } = await db.query(
      `UPDATE ${sqlFrom} SET ${sets} WHERE ${matchCol} = $${columns.length + 1} RETURNING *`,
      values
    );
    if (!rows[0]) {
      return res.status(404).json({ message: 'Row not found.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(`[dataRoutes] PUT ${table}:`, err.message);
    return res.status(500).json({ message: 'Update failed.' });
  }
});

router.delete('/data/:table/:column/:value', authenticate, async (req, res) => {
  const table = req.params.table;
  if (!WRITE_TABLES.has(table)) {
    return res.status(403).json({ message: 'Writes not allowed for this table.' });
  }

  const sqlFrom = sqlTable(table);
  const matchCol = quoteCol(req.params.column);
  if (!matchCol) {
    return res.status(400).json({ message: 'Invalid column.' });
  }

  try {
    const { rowCount } = await db.query(
      `DELETE FROM ${sqlFrom} WHERE ${matchCol} = $1`,
      [req.params.value]
    );
    if (!rowCount) {
      return res.status(404).json({ message: 'Row not found.' });
    }
    return res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(`[dataRoutes] DELETE ${table}:`, err.message);
    return res.status(500).json({ message: 'Delete failed.' });
  }
});

module.exports = router;
