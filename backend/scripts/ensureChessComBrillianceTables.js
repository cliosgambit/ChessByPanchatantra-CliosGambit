const db = require('../api/config/database');

/** Columns the test-page compute DB has that the app DB must also store. */
const STAGE_COLUMN_MIGRATIONS = {
  chess_com_brilliance_runs: [
    ['stage1_valid_count', 'INTEGER NOT NULL DEFAULT 0'],
  ],
  chess_com_brilliance_stage0: [
    ['was_piece_hanging', 'INTEGER NOT NULL DEFAULT 0'],
    ['control_delta', 'INTEGER'],
    ['activity_delta', 'REAL'],
    ['is_check', 'INTEGER NOT NULL DEFAULT 0'],
    ['moving_piece_type', 'TEXT'],
    ['dest_attackers', 'INTEGER'],
    ['dest_defenders', 'INTEGER'],
  ],
  chess_com_brilliance_stage1: [
    ['disqualifiers_json', 'TEXT'],
    ['is_pseudo', 'INTEGER NOT NULL DEFAULT 0'],
    ['sacrifice_uncertainty', 'REAL'],
    ['recapture_options', 'INTEGER'],
    ['forced_reason', 'TEXT'],
    ['n_legal', 'INTEGER'],
  ],
  chess_com_brilliance_stage2: [
    ['sac_type', 'TEXT'],
    ['best_move', 'TEXT'],
    ['best_score_cp', 'INTEGER'],
    ['our_score_cp', 'INTEGER'],
    ['is_forced_engine', 'INTEGER NOT NULL DEFAULT 0'],
    ['n_reasonable_moves', 'INTEGER'],
    ['response_width', 'INTEGER'],
    ['classification_if_fail', 'TEXT'],
    ['engine_depth', 'INTEGER NOT NULL DEFAULT 12'],
  ],
  chess_com_brilliance_stage3: [
    ['sac_type', 'TEXT'],
    ['depth_slope', 'REAL'],
    ['depth_gain', 'REAL'],
    ['depth_variance', 'REAL'],
    ['early_eval_avg', 'REAL'],
    ['late_eval_avg', 'REAL'],
    ['is_rising_curve', 'INTEGER NOT NULL DEFAULT 0'],
    ['is_non_obvious', 'INTEGER NOT NULL DEFAULT 0'],
    ['good_defenses', 'INTEGER'],
    ['defense_difficulty', 'REAL'],
    ['counterfactual_delta', 'REAL'],
    ['classification_if_unsound', 'TEXT'],
    ['engine_depth', 'INTEGER NOT NULL DEFAULT 25'],
    ['depth_evals_json', 'TEXT'],
    ['eval_perspective', "TEXT NOT NULL DEFAULT 'white'"],
  ],
  chess_com_brilliance_stage4: [
    ['info_surprise_bits', 'REAL'],
    ['brilliant_for_rating', 'INTEGER NOT NULL DEFAULT 0'],
    ['obj_quality', 'REAL'],
    ['practical_value', 'REAL'],
    ['is_tal_zone', 'INTEGER NOT NULL DEFAULT 0'],
  ],
};

async function ensureChessComBrillianceTables() {
  await db.query('SELECT 1 FROM chess_com_brilliance_runs LIMIT 1');

  for (const [table, cols] of Object.entries(STAGE_COLUMN_MIGRATIONS)) {
    for (const [name, ddl] of cols) {
      try {
        await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
      } catch (err) {
        // Older SQLite without IF NOT EXISTS — try plain ADD and ignore duplicate
        try {
          await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
        } catch (inner) {
          if (!/duplicate column/i.test(inner.message || '')) {
            console.warn(`[brilliance schema] ${table}.${name}:`, inner.message);
          }
        }
      }
    }
  }

  console.log('✅ chess_com_brilliance tables ready (test-page column parity)');
}

/** Optional: sync brilliance compute DB → app SQLite (no cloud). */
async function migrateExistingBrillianceToSupabase() {
  const { migrateAllSqliteBrillianceToSupabase } = require('../api/services/brillianceSupabaseService');
  const result = await migrateAllSqliteBrillianceToSupabase();
  if (result.total > 0) {
    console.log(
      `✅ Brilliance compute → app DB: ${result.synced}/${result.total} games synced` +
        (result.skipped ? ` (${result.skipped} skipped, no Chess.com game)` : '') +
        (result.failed ? ` (${result.failed} failed)` : '')
    );
  }
  return result;
}

module.exports = { ensureChessComBrillianceTables, migrateExistingBrillianceToSupabase };
