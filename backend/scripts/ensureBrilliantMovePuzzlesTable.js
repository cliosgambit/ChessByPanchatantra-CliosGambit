const db = require('../api/config/database');

async function ensureBrilliantMovePuzzlesTable() {
  await db.query('SELECT 1 FROM brilliant_move_puzzles LIMIT 1');
  console.log('✅ brilliant_move_puzzles table ready');
}

module.exports = { ensureBrilliantMovePuzzlesTable };
