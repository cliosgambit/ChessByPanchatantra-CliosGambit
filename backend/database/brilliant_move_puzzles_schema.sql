CREATE TABLE IF NOT EXISTS brilliant_move_puzzles (
  id                      SERIAL PRIMARY KEY,
  stage4_move_id          INT NOT NULL UNIQUE,

  puzzle_fen              TEXT NOT NULL,
  solution_san            TEXT NOT NULL,
  solution_uci            TEXT,

  previous_move_san       TEXT,
  previous_move_uci       TEXT,
  previous_move_from      TEXT,
  previous_move_to        TEXT,

  chess_com_uuid          TEXT,
  chess_com_id            TEXT,
  game_url                TEXT,
  white_username          TEXT,
  black_username          TEXT,
  players_label           TEXT,
  played_at               TIMESTAMPTZ,
  time_control            TEXT,
  turn                    TEXT,
  classification          TEXT,
  sac_type                TEXT,
  brilliance_score        NUMERIC,

  verification_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  verified_at             TIMESTAMPTZ,
  verified_by             TEXT,

  saved_at                TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brilliant_move_puzzles_saved_at
  ON brilliant_move_puzzles (saved_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_brilliant_move_puzzles_played_at
  ON brilliant_move_puzzles (played_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_brilliant_move_puzzles_verification
  ON brilliant_move_puzzles (verification_status);
