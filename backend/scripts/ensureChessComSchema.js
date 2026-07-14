const db = require('../api/config/database');

/** Schema is applied from database/schema.sqlite.sql on DB init. */
async function ensureChessComSchema() {
  await db.query('SELECT 1 FROM chess_com_profiles LIMIT 1');
  console.log('✅ chess.com schema ready (local SQLite)');
}

module.exports = { ensureChessComSchema };
