/** Shared guard: schema already lives on Supabase — skip SQLite ensure* DDL. */
const { isPostgres } = require('../api/config/database');

function skipEnsureIfPostgres(label) {
  if (!isPostgres) return false;
  console.log(`✅ ${label} (Supabase — skipped local ensure)`);
  return true;
}

module.exports = { skipEnsureIfPostgres, isPostgres };
