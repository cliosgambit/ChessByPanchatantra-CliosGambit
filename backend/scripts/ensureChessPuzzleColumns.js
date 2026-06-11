const db = require('../api/config/database');

async function ensureChessPuzzleColumns() {
  await db.query('ALTER TABLE chess_puzzle ADD COLUMN IF NOT EXISTS difficulty TEXT');
  await db.query('ALTER TABLE chess_puzzle ADD COLUMN IF NOT EXISTS notes TEXT');
  await db.query('ALTER TABLE chess_puzzle ADD COLUMN IF NOT EXISTS title TEXT');
  console.log('✅ chess_puzzle columns ready');
}

module.exports = { ensureChessPuzzleColumns };
