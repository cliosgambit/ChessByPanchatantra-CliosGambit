const db = require('../api/config/database');
const { isPostgres } = require('../api/config/database');

/** Schema is applied from database/schema.sqlite.sql on DB init (or Supabase migration). */
async function ensureChessComSchema() {
  await db.query('SELECT 1 FROM chess_com_profiles LIMIT 1');
  console.log(
    isPostgres
      ? '✅ chess.com schema ready (Supabase)'
      : '✅ chess.com schema ready (local SQLite)'
  );
}

module.exports = { ensureChessComSchema };
