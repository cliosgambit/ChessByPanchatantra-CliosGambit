const db = require('../api/config/database');
const { isPostgres, addColumnIfNotExists } = db;

async function ensureBrilliantMovePuzzlesTable() {
  await db.query('SELECT 1 FROM brilliant_move_puzzles LIMIT 1');
  try {
    if (isPostgres) {
      await db.query(
        `ALTER TABLE brilliant_move_puzzles
         ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE`
      );
    } else {
      addColumnIfNotExists(
        'brilliant_move_puzzles',
        'is_used',
        'is_used INTEGER NOT NULL DEFAULT 0'
      );
    }
  } catch (err) {
    console.warn('[brilliant_move_puzzles] is_used column ensure skipped:', err.message);
  }
  console.log('✅ brilliant_move_puzzles table ready');
}

module.exports = { ensureBrilliantMovePuzzlesTable };
