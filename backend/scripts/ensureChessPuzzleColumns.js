const { addColumnIfNotExists } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

async function ensureChessPuzzleColumns() {
  // Unused legacy table — not migrated to Supabase
  if (skipEnsureIfPostgres('chess_puzzle columns ready')) return;
  addColumnIfNotExists('chess_puzzle', 'difficulty', 'difficulty TEXT');
  addColumnIfNotExists('chess_puzzle', 'notes', 'notes TEXT');
  addColumnIfNotExists('chess_puzzle', 'title', 'title TEXT');
  console.log('✅ chess_puzzle columns ready');
}

module.exports = { ensureChessPuzzleColumns };
