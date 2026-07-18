const db = require('../api/config/database');

async function ensureUciColumn() {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const pool = db.getPool();
      const check = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'chess_com_moves' AND column_name = 'uci'
         LIMIT 1`
      );
      if (!check.rows.length) {
        await pool.query('ALTER TABLE chess_com_moves ADD COLUMN IF NOT EXISTS uci TEXT');
        console.log('[chess_com_moves] added uci column');
      }
    } else {
      await db.query('ALTER TABLE chess_com_moves ADD COLUMN IF NOT EXISTS uci TEXT');
    }
  } catch (err) {
    try {
      await db.query('ALTER TABLE chess_com_moves ADD COLUMN uci TEXT');
      console.log('[chess_com_moves] added uci column');
    } catch (inner) {
      if (!/duplicate column/i.test(inner.message || '')) {
        console.warn('[chess_com_moves] uci column:', inner.message);
      }
    }
  }
}

async function backfillUci() {
  try {
    const { rowCount } = await db.query(
      `UPDATE chess_com_moves
       SET uci = from_square || to_square || COALESCE(promotion, '')
       WHERE uci IS NULL
         AND from_square IS NOT NULL
         AND to_square IS NOT NULL`
    );
    if (rowCount) {
      console.log(`[chess_com_moves] backfilled uci on ${rowCount} row(s)`);
    }
  } catch (err) {
    console.warn('[chess_com_moves] uci backfill:', err.message);
  }
}

async function ensureChessComMovesTable() {
  await db.query('SELECT 1 FROM chess_com_moves LIMIT 1');
  await ensureUciColumn();
  await backfillUci();
  console.log('✅ chess_com_moves table ready');
}

module.exports = { ensureChessComMovesTable };
