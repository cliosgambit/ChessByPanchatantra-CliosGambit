const db = require('../api/config/database');

const TABLE = 'chess_com_pioneer_wins';

async function tableExists() {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const { rows } = await db.getPool().query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [TABLE]
      );
      return rows.length > 0;
    }
    const { rows } = await db.query(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = $1 LIMIT 1`,
      [TABLE]
    );
    return Boolean(rows[0]);
  } catch {
    try {
      await db.query(`SELECT 1 FROM ${TABLE} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }
}

async function addColumnIfMissing(name, ddl) {
  try {
    if (db.isPostgres && typeof db.getPool === 'function' && db.getPool()) {
      const pool = db.getPool();
      const check = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [TABLE, name]
      );
      if (check.rows.length) return;
      await pool.query(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
      return;
    }
    await db.query(`ALTER TABLE ${TABLE} ADD COLUMN ${name} ${ddl}`);
  } catch (err) {
    if (!/duplicate column|already exists/i.test(err.message || '')) {
      console.warn(`[pioneer_wins] column ${name}:`, err.message);
    }
  }
}

async function ensureChessComPioneerWinsTable() {
  const ts = db.isPostgres ? 'TIMESTAMPTZ NOT NULL DEFAULT NOW()' : "TEXT NOT NULL DEFAULT (datetime('now'))";
  const intType = db.isPostgres ? 'INT' : 'INTEGER';
  const realType = db.isPostgres ? 'DOUBLE PRECISION' : 'REAL';

  await db.query(`
    CREATE TABLE IF NOT EXISTS chess_com_pioneer_wins (
      chess_com_uuid              TEXT PRIMARY KEY
        REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
      chess_com_id                TEXT NOT NULL,
      winner_color                TEXT,
      piece_lost                  TEXT,
      loss_move_number            ${intType},
      loss_ply                    ${intType},
      loss_uci                    TEXT,
      loss_san                    TEXT,
      material_delta_cp           ${intType},
      net_balance_after_loss_cp   ${intType},
      max_move_number             ${intType} NOT NULL DEFAULT 10,
      best_move_san               TEXT,
      best_move_uci               TEXT,
      best_move_elo               ${intType},
      played_move_elo             ${intType},
      elo_diff                    ${intType},
      cpl                         ${intType},
      ep_before                   ${realType},
      ep_after                    ${realType},
      ep_delta                    ${realType},
      win_pct_before              ${realType},
      win_pct_after               ${realType},
      win_pct_delta               ${realType},
      detected_at                 ${ts},
      updated_at                  ${ts}
    )
  `);

  const migrations = [
    ['best_move_san', 'TEXT'],
    ['best_move_uci', 'TEXT'],
    ['best_move_elo', intType],
    ['played_move_elo', intType],
    ['elo_diff', intType],
    ['cpl', intType],
    ['ep_before', realType],
    ['ep_after', realType],
    ['ep_delta', realType],
    ['win_pct_before', realType],
    ['win_pct_after', realType],
    ['win_pct_delta', realType],
  ];
  for (const [name, ddl] of migrations) {
    await addColumnIfMissing(name, ddl);
  }

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_chess_com_pioneer_wins_player
      ON chess_com_pioneer_wins (chess_com_id, detected_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_chess_com_pioneer_wins_piece
      ON chess_com_pioneer_wins (piece_lost, loss_move_number)
  `);

  const exists = await tableExists();
  if (!exists) {
    throw new Error('chess_com_pioneer_wins table was not created');
  }

  console.log('✅ chess_com_pioneer_wins table ready');
}

module.exports = { ensureChessComPioneerWinsTable };
