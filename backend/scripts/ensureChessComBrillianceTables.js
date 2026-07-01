const fs = require('fs');
const path = require('path');
const db = require('../api/config/database');
const { migrateAllSqliteBrillianceToSupabase } = require('../api/services/brillianceSupabaseService');

async function ensureChessComBrillianceTables() {
  const sqlPath = path.join(__dirname, '../database/chess_com_brilliance_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  console.log('✅ chess_com_brilliance tables ready');
}

async function migrateExistingBrillianceToSupabase() {
  const result = await migrateAllSqliteBrillianceToSupabase();
  if (result.total > 0) {
    console.log(
      `✅ Brilliance SQLite → Supabase: ${result.synced}/${result.total} games synced` +
        (result.failed ? ` (${result.failed} failed)` : '')
    );
  }
  return result;
}

module.exports = { ensureChessComBrillianceTables, migrateExistingBrillianceToSupabase };
