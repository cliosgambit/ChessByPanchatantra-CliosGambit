const fs = require('fs');
const path = require('path');
const db = require('../api/config/database');

async function ensureChessPuzzlePollTable() {
  const sqlPath = path.join(__dirname, '../database/chess_puzzle_poll_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  console.log('✅ chess_puzzle_poll_response table ready');
}

module.exports = { ensureChessPuzzlePollTable };
