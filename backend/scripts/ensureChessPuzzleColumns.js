const { addColumnIfNotExists } = require('../api/config/database');

async function ensureChessPuzzleColumns() {
  addColumnIfNotExists('chess_puzzle', 'difficulty', 'difficulty TEXT');
  addColumnIfNotExists('chess_puzzle', 'notes', 'notes TEXT');
  addColumnIfNotExists('chess_puzzle', 'title', 'title TEXT');
  console.log('✅ chess_puzzle columns ready');
}

module.exports = { ensureChessPuzzleColumns };
