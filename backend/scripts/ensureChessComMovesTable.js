const db = require('../api/config/database');

async function ensureChessComMovesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS chess_com_moves (
      id              BIGSERIAL PRIMARY KEY,
      chess_com_uuid  TEXT NOT NULL REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
      chess_com_id    TEXT NOT NULL,
      ply             INT NOT NULL,
      move_number     INT NOT NULL,
      color           CHAR(1) NOT NULL CHECK (color IN ('w', 'b')),
      san             TEXT NOT NULL,
      from_square     CHAR(2),
      to_square       CHAR(2) NOT NULL,
      piece           CHAR(1),
      captured        CHAR(1),
      promotion       CHAR(1),
      fen_before      TEXT,
      fen_after       TEXT NOT NULL,
      is_check        BOOLEAN DEFAULT FALSE,
      is_mate         BOOLEAN DEFAULT FALSE,
      is_capture      BOOLEAN DEFAULT FALSE,
      is_castle       BOOLEAN DEFAULT FALSE,
      is_en_passant   BOOLEAN DEFAULT FALSE,
      is_promotion    BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (chess_com_uuid, ply)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_chess_com_moves_game_ply
      ON chess_com_moves (chess_com_uuid, ply)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_chess_com_moves_player
      ON chess_com_moves (chess_com_id)
  `);

  console.log('✅ chess_com_moves table ready');
}

module.exports = { ensureChessComMovesTable };
