const db = require('../api/config/database');

/** Columns on chess_com_brilliance_runs that older DBs may lack. */
const RUN_COLUMN_MIGRATIONS = [
  ['stage1_valid_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['pipeline_status', "TEXT NOT NULL DEFAULT 'pending'"],
  ['current_stage', 'INTEGER'],
  ['has_brilliant_moves', 'INTEGER NOT NULL DEFAULT 0'],
  ['brilliant_move_count', 'INTEGER NOT NULL DEFAULT 0'],
];

const BRILLIANT_MOVES_DDL = `
CREATE TABLE IF NOT EXISTS brilliant_moves (
  id                      ${db.isPostgres ? 'BIGSERIAL' : 'INTEGER'} PRIMARY KEY${db.isPostgres ? '' : ' AUTOINCREMENT'},
  chess_com_uuid          TEXT NOT NULL REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INTEGER NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  player_rating           INTEGER,
  surprise_score          REAL,
  pb_score                REAL,
  pb_category             TEXT,
  archetype               TEXT,
  brilliance_score        REAL,
  brilliance_score_raw    REAL,
  novelty_score           REAL,
  classification          TEXT,
  is_brilliant            ${db.isPostgres ? 'BOOLEAN NOT NULL DEFAULT FALSE' : 'INTEGER NOT NULL DEFAULT 0'},
  created_at              ${db.isPostgres ? 'TIMESTAMPTZ NOT NULL DEFAULT NOW()' : "TEXT NOT NULL DEFAULT (datetime('now'))"},
  UNIQUE (chess_com_uuid, ply_index)
)`;

const DROP_STAGE_TABLES = [
  'chess_com_brilliance_stage0',
  'chess_com_brilliance_stage1',
  'chess_com_brilliance_stage2',
  'chess_com_brilliance_stage3',
];

const DROP_BRILLIANT_MOVE_COLUMNS = [
  'features_json',
  'sqlite_stage4_id',
  'info_surprise_bits',
  'brilliant_for_rating',
  'obj_quality',
  'practical_value',
  'is_tal_zone',
];

async function tableExists(table) {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const { rows } = await db.getPool().query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table]
      );
      return rows.length > 0;
    }
    const { rows } = await db.query(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = $1 LIMIT 1`,
      [table]
    );
    return Boolean(rows[0]);
  } catch {
    try {
      await db.query(`SELECT 1 FROM ${table} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }
}

async function addColumnIfMissing(table, name, ddl) {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const pool = db.getPool();
      const check = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, name]
      );
      if (check.rows.length) return;
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
      console.log(`[brilliance schema] added ${table}.${name}`);
      return;
    }
    await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
  } catch (err) {
    try {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
      console.log(`[brilliance schema] added ${table}.${name}`);
    } catch (inner) {
      if (!/duplicate column/i.test(inner.message || '')) {
        console.warn(`[brilliance schema] ${table}.${name}:`, inner.message);
      }
    }
  }
}

async function dropColumnIfExists(table, name) {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const pool = db.getPool();
      const check = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, name]
      );
      if (!check.rows.length) return;
      await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${name}`);
      console.log(`[brilliance schema] dropped ${table}.${name}`);
      return;
    }
    await db.query(`ALTER TABLE ${table} DROP COLUMN ${name}`);
    console.log(`[brilliance schema] dropped ${table}.${name}`);
  } catch (err) {
    if (!/no such column|does not exist/i.test(err.message || '')) {
      console.warn(`[brilliance schema] drop ${table}.${name}:`, err.message);
    }
  }
}

async function migrateStage4ToBrilliantMoves() {
  const hasBrilliant = await tableExists('brilliant_moves');
  const hasStage4 = await tableExists('chess_com_brilliance_stage4');

  if (!hasBrilliant && hasStage4) {
    const runner =
      db.isPostgres && typeof db.getPool === 'function' && db.getPool()
        ? db.getPool()
        : db;
    await runner.query('ALTER TABLE chess_com_brilliance_stage4 RENAME TO brilliant_moves');
    console.log('[brilliance schema] renamed chess_com_brilliance_stage4 → brilliant_moves');
  } else if (!hasBrilliant) {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      await db.getPool().query(`
CREATE TABLE IF NOT EXISTS brilliant_moves (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  player_rating           INT,
  surprise_score          REAL,
  pb_score                REAL,
  pb_category             TEXT,
  archetype               TEXT,
  brilliance_score        REAL,
  brilliance_score_raw    REAL,
  novelty_score           REAL,
  classification          TEXT,
  is_brilliant            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
)`);
    } else {
      await db.query(BRILLIANT_MOVES_DDL);
    }
    console.log('[brilliance schema] created brilliant_moves');
  } else if (hasStage4) {
    try {
      await db.query(`
        INSERT INTO brilliant_moves (
          id, chess_com_uuid, ply_index, san_move, turn, sac_type, player_rating,
          surprise_score, pb_score, pb_category, archetype,
          brilliance_score, brilliance_score_raw, novelty_score,
          classification, is_brilliant, created_at
        )
        SELECT
          id, chess_com_uuid, ply_index, san_move, turn, sac_type, player_rating,
          surprise_score, pb_score, pb_category, archetype,
          brilliance_score, brilliance_score_raw, novelty_score,
          classification, is_brilliant, created_at
        FROM chess_com_brilliance_stage4
        ON CONFLICT (chess_com_uuid, ply_index) DO NOTHING
      `);
    } catch (err) {
      console.warn('[brilliance schema] stage4→brilliant_moves copy:', err.message);
    }
    try {
      await db.query('DROP TABLE IF EXISTS chess_com_brilliance_stage4');
      console.log('[brilliance schema] dropped leftover chess_com_brilliance_stage4');
    } catch (err) {
      console.warn('[brilliance schema] drop stage4:', err.message);
    }
  }

  for (const col of DROP_BRILLIANT_MOVE_COLUMNS) {
    await dropColumnIfExists('brilliant_moves', col);
  }

  try {
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_brilliant_moves_game ON brilliant_moves (chess_com_uuid)`
    );
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      await db.getPool().query(
        `CREATE INDEX IF NOT EXISTS idx_brilliant_moves_brilliant
         ON brilliant_moves (is_brilliant, brilliance_score DESC NULLS LAST)`
      );
    } else {
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_brilliant_moves_brilliant
         ON brilliant_moves (is_brilliant, brilliance_score DESC)`
      );
    }
  } catch (err) {
    console.warn('[brilliance schema] brilliant_moves indexes:', err.message);
  }
}

async function dropLegacyStageTables() {
  for (const table of DROP_STAGE_TABLES) {
    try {
      if (!(await tableExists(table))) continue;
      await db.query(`DROP TABLE IF EXISTS ${table}`);
      console.log(`[brilliance schema] dropped ${table} (SQLite-only stages)`);
    } catch (err) {
      console.warn(`[brilliance schema] drop ${table}:`, err.message);
    }
  }
  // stage4 may remain if rename path already handled it
  if (await tableExists('chess_com_brilliance_stage4')) {
    try {
      await db.query('DROP TABLE IF EXISTS chess_com_brilliance_stage4');
      console.log('[brilliance schema] dropped chess_com_brilliance_stage4');
    } catch (err) {
      console.warn('[brilliance schema] drop stage4:', err.message);
    }
  }
}

async function backfillPipelineRollup() {
  try {
    await db.query(
      `UPDATE chess_com_brilliance_runs
       SET
         pipeline_status = CASE
           WHEN stage4_status = 'completed' THEN 'passed'
           WHEN stage0_status = 'failed'
             OR stage1_status = 'failed'
             OR stage2_status = 'failed'
             OR stage3_status = 'failed'
             OR stage4_status = 'failed' THEN 'failed'
           WHEN stage0_status = 'running'
             OR stage1_status = 'running'
             OR stage2_status = 'running'
             OR stage3_status = 'running'
             OR stage4_status = 'running' THEN 'running'
           ELSE COALESCE(NULLIF(pipeline_status, ''), 'pending')
         END,
         current_stage = CASE
           WHEN stage4_status = 'completed' THEN NULL
           WHEN stage0_status = 'running' THEN 0
           WHEN stage1_status = 'running' THEN 1
           WHEN stage2_status = 'running' THEN 2
           WHEN stage3_status = 'running' THEN 3
           WHEN stage4_status = 'running' THEN 4
           WHEN stage0_status = 'failed' THEN 0
           WHEN stage1_status = 'failed' THEN 1
           WHEN stage2_status = 'failed' THEN 2
           WHEN stage3_status = 'failed' THEN 3
           WHEN stage4_status = 'failed' THEN 4
           ELSE current_stage
         END,
         brilliant_move_count = COALESCE(stage4_brilliant_count, 0),
         has_brilliant_moves = CASE WHEN COALESCE(stage4_brilliant_count, 0) > 0 THEN 1 ELSE 0 END
       WHERE pipeline_status IS NULL
          OR pipeline_status = 'pending'
          OR stage4_status = 'completed'
          OR stage4_brilliant_count > 0`
    );
  } catch (err) {
    console.warn('[brilliance schema] pipeline rollup backfill:', err.message);
  }
}

async function ensureChessComBrillianceTables() {
  await db.query('SELECT 1 FROM chess_com_brilliance_runs LIMIT 1');

  for (const [name, ddl] of RUN_COLUMN_MIGRATIONS) {
    await addColumnIfMissing('chess_com_brilliance_runs', name, ddl);
  }

  await migrateStage4ToBrilliantMoves();
  await dropLegacyStageTables();

  try {
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_pipeline
       ON chess_com_brilliance_runs (pipeline_status, updated_at DESC)`
    );
  } catch (err) {
    console.warn('[brilliance schema] pipeline index:', err.message);
  }

  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      await db.getPool().query(
        `CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_brilliant
         ON chess_com_brilliance_runs (has_brilliant_moves, brilliant_move_count DESC)
         WHERE has_brilliant_moves = 1`
      );
    }
  } catch (err) {
    console.warn('[brilliance schema] brilliant index:', err.message);
  }

  await backfillPipelineRollup();

  console.log(
    db.isPostgres
      ? '✅ brilliance tables ready (runs + brilliant_moves; stages 0–3 SQLite-only)'
      : '✅ brilliance tables ready (runs + brilliant_moves; stages 0–3 SQLite-only)'
  );
}

/** Optional: sync brilliance compute DB → app DB (runs + brilliant_moves). */
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
