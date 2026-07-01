const fs = require('fs');
const path = require('path');
const db = require('../api/config/database');

async function ensureChessComSyncRawTable() {
  const sqlPath = path.join(__dirname, '../database/chess_com_sync_raw_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  console.log('✅ chess_com_sync_raw table ready');
}

module.exports = { ensureChessComSyncRawTable };
