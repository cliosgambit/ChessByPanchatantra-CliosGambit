const db = require('../api/config/database');

async function ensureChessComSyncRawTable() {
  await db.query('SELECT 1 FROM chess_com_sync_raw LIMIT 1');
  console.log('✅ chess_com_sync_raw table ready');
}

module.exports = { ensureChessComSyncRawTable };
