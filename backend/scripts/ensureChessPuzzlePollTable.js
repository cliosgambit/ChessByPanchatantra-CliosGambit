const db = require('../api/config/database');

async function ensureChessPuzzlePollTable() {
  await db.query('SELECT 1 FROM chess_puzzle_poll_response LIMIT 1');
  console.log('✅ chess_puzzle_poll_response table ready');
}

module.exports = { ensureChessPuzzlePollTable };
