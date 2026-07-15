const db = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

async function ensureChessPuzzlePollTable() {
  // Unused legacy table — not migrated to Supabase
  if (skipEnsureIfPostgres('chess_puzzle_poll_response table ready')) return;
  await db.query('SELECT 1 FROM chess_puzzle_poll_response LIMIT 1');
  console.log('✅ chess_puzzle_poll_response table ready');
}

module.exports = { ensureChessPuzzlePollTable };
