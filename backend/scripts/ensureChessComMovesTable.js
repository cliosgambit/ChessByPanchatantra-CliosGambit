const db = require('../api/config/database');

async function ensureChessComMovesTable() {
  await db.query('SELECT 1 FROM chess_com_moves LIMIT 1');
  console.log('✅ chess_com_moves table ready');
}

module.exports = { ensureChessComMovesTable };
