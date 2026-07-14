const db = require('../api/config/database');

async function ensureChessComBrillianceTables() {
  await db.query('SELECT 1 FROM chess_com_brilliance_runs LIMIT 1');
  console.log('✅ chess_com_brilliance tables ready');
}

/** Optional: sync brilliance compute DB → app SQLite (no cloud). */
async function migrateExistingBrillianceToSupabase() {
  const { migrateAllSqliteBrillianceToSupabase } = require('../api/services/brillianceSupabaseService');
  const result = await migrateAllSqliteBrillianceToSupabase();
  if (result.total > 0) {
    console.log(
      `✅ Brilliance compute → app DB: ${result.synced}/${result.total} games synced` +
        (result.failed ? ` (${result.failed} failed)` : '')
    );
  }
  return result;
}

module.exports = { ensureChessComBrillianceTables, migrateExistingBrillianceToSupabase };
