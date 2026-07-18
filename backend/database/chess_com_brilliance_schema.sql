-- Brilliance pipeline: Postgres stores run status + final product only.
-- Stages 0–3 live in the local compute SQLite DB (lichess_pgn_stage0–3).

CREATE TABLE IF NOT EXISTS chess_com_brilliance_runs (
  chess_com_uuid          TEXT PRIMARY KEY
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  sqlite_game_id          INT,
  move_count              INT NOT NULL DEFAULT 0,

  stage0_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage0_status IN ('pending', 'running', 'completed', 'failed')),
  stage0_run_at           TIMESTAMPTZ,
  stage0_sacrifice_count  INT NOT NULL DEFAULT 0,
  stage0_error            TEXT,

  stage1_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage1_status IN ('pending', 'running', 'completed', 'failed')),
  stage1_run_at           TIMESTAMPTZ,
  stage1_candidate_count  INT NOT NULL DEFAULT 0,
  stage1_proceed_stage2_count INT NOT NULL DEFAULT 0,
  stage1_valid_count      INT NOT NULL DEFAULT 0,
  stage1_error            TEXT,

  stage2_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage2_status IN ('pending', 'running', 'completed', 'failed')),
  stage2_run_at           TIMESTAMPTZ,
  stage2_analyzed_count   INT NOT NULL DEFAULT 0,
  stage2_proceed_stage3_count INT NOT NULL DEFAULT 0,
  stage2_error            TEXT,

  stage3_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage3_status IN ('pending', 'running', 'completed', 'failed')),
  stage3_run_at           TIMESTAMPTZ,
  stage3_analyzed_count   INT NOT NULL DEFAULT 0,
  stage3_sound_count      INT NOT NULL DEFAULT 0,
  stage3_error            TEXT,

  stage4_status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (stage4_status IN ('pending', 'running', 'completed', 'failed')),
  stage4_run_at           TIMESTAMPTZ,
  stage4_analyzed_count   INT NOT NULL DEFAULT 0,
  stage4_brilliant_count  INT NOT NULL DEFAULT 0,
  stage4_error            TEXT,

  -- Overall pipeline rollup (derived from stage0–stage4 on each sync)
  pipeline_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (pipeline_status IN ('pending', 'queued', 'running', 'passed', 'failed')),
  current_stage           INT,
  has_brilliant_moves     INT NOT NULL DEFAULT 0,
  brilliant_move_count    INT NOT NULL DEFAULT 0,

  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_stage4
  ON chess_com_brilliance_runs (stage4_status, stage4_run_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_pipeline
  ON chess_com_brilliance_runs (pipeline_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_brilliant
  ON chess_com_brilliance_runs (has_brilliant_moves, brilliant_move_count DESC)
  WHERE has_brilliant_moves = 1;

-- Final product shown to users (formerly chess_com_brilliance_stage4)
CREATE TABLE IF NOT EXISTS brilliant_moves (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
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
);

CREATE INDEX IF NOT EXISTS idx_brilliant_moves_game
  ON brilliant_moves (chess_com_uuid);

CREATE INDEX IF NOT EXISTS idx_brilliant_moves_brilliant
  ON brilliant_moves (is_brilliant, brilliance_score DESC NULLS LAST);
