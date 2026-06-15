const db = require('../api/config/database');

async function ensurePlayerChessComColumns() {
  await db.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS chess_com_fetch_status TEXT');
  await db.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS chess_com_fetch_error TEXT');
  await db.query('ALTER TABLE players ADD COLUMN IF NOT EXISTS chess_com_fetch_blocked_at TIMESTAMPTZ');
  console.log('✅ players chess.com fetch status columns ready');
}

module.exports = { ensurePlayerChessComColumns };
