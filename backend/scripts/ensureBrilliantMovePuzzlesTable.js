const fs = require('fs');
const path = require('path');
const db = require('../api/config/database');

async function ensureBrilliantMovePuzzlesTable() {
  const sqlPath = path.join(__dirname, '../database/brilliant_move_puzzles_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  console.log('✅ brilliant_move_puzzles table ready');
}

module.exports = { ensureBrilliantMovePuzzlesTable };
