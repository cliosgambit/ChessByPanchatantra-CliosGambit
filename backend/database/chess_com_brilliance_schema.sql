-- Brilliance pipeline results keyed by Chess.com game UUID
-- Mirrors test-page compute fields (lichess_pgn_stage*) plus full move snapshot in features_json.

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

  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_com_brilliance_runs_stage4
  ON chess_com_brilliance_runs (stage4_status, stage4_run_at DESC NULLS LAST);

-- Stage 0: every move (test-page parity columns + features_json snapshot)
CREATE TABLE IF NOT EXISTS chess_com_brilliance_stage0 (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  game_phase              TEXT,
  see_value               INT,
  is_capture              BOOLEAN NOT NULL DEFAULT FALSE,
  is_sacrifice_candidate  BOOLEAN NOT NULL DEFAULT FALSE,
  was_piece_hanging       BOOLEAN NOT NULL DEFAULT FALSE,
  proceed_to_stage1       BOOLEAN NOT NULL DEFAULT FALSE,
  king_safety_delta       INT,
  multiplexing_score      INT,
  ev_score                INT,
  harmony_score           REAL,
  control_delta           INT,
  activity_delta          REAL,
  is_check                BOOLEAN NOT NULL DEFAULT FALSE,
  moving_piece_type       TEXT,
  dest_attackers          INT,
  dest_defenders          INT,
  novelty_score           REAL,
  early_game_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
  features_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s0_game
  ON chess_com_brilliance_stage0 (chess_com_uuid);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s0_sac
  ON chess_com_brilliance_stage0 (chess_com_uuid, is_sacrifice_candidate);

-- Stage 1: sacrifice candidates
CREATE TABLE IF NOT EXISTS chess_com_brilliance_stage1 (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  is_valid_sacrifice      BOOLEAN NOT NULL DEFAULT FALSE,
  is_pseudo               BOOLEAN NOT NULL DEFAULT FALSE,
  is_forced               BOOLEAN NOT NULL DEFAULT FALSE,
  proceed_to_stage2       BOOLEAN NOT NULL DEFAULT FALSE,
  gate_fail_reason        TEXT,
  material_loss_cp        INT,
  sacrifice_uncertainty   REAL,
  recapture_options       INT,
  forced_reason           TEXT,
  n_legal                 INT,
  disqualifiers_json      JSONB,
  features_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s1_game
  ON chess_com_brilliance_stage1 (chess_com_uuid);

-- Stage 2: shallow Stockfish
CREATE TABLE IF NOT EXISTS chess_com_brilliance_stage2 (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  best_move               TEXT,
  best_score_cp           INT,
  our_score_cp            INT,
  cpl_shallow             INT,
  ep_delta_shallow        REAL,
  our_rank_in_top5        INT,
  is_forced_engine        BOOLEAN NOT NULL DEFAULT FALSE,
  n_reasonable_moves      INT,
  response_width          INT,
  is_best_or_near_best    BOOLEAN NOT NULL DEFAULT FALSE,
  proceed_to_stage3       BOOLEAN NOT NULL DEFAULT FALSE,
  gate_fail_reason        TEXT,
  classification_if_fail  TEXT,
  engine_depth            INT NOT NULL DEFAULT 12,
  features_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s2_game
  ON chess_com_brilliance_stage2 (chess_com_uuid);

-- Stage 3: deep Stockfish
CREATE TABLE IF NOT EXISTS chess_com_brilliance_stage3 (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  deep_eval_cp            INT,
  depth_slope             REAL,
  depth_gain              REAL,
  depth_variance          REAL,
  early_eval_avg          REAL,
  late_eval_avg           REAL,
  is_rising_curve         BOOLEAN NOT NULL DEFAULT FALSE,
  is_sound                BOOLEAN NOT NULL DEFAULT FALSE,
  is_non_obvious          BOOLEAN NOT NULL DEFAULT FALSE,
  non_obvious_score       REAL,
  rank_at_depth8          INT,
  rank_at_depth22         INT,
  rank_jump               INT,
  good_defenses           INT,
  defense_difficulty      REAL,
  counterfactual_delta    REAL,
  classification_if_unsound TEXT,
  proceed_to_stage4       BOOLEAN NOT NULL DEFAULT FALSE,
  gate_fail_reason        TEXT,
  engine_depth            INT NOT NULL DEFAULT 25,
  depth_evals_json        JSONB,
  eval_perspective        TEXT NOT NULL DEFAULT 'white',
  features_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s3_game
  ON chess_com_brilliance_stage3 (chess_com_uuid);

-- Stage 4: human perception / final classification
CREATE TABLE IF NOT EXISTS chess_com_brilliance_stage4 (
  id                      BIGSERIAL PRIMARY KEY,
  chess_com_uuid          TEXT NOT NULL
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  ply_index               INT NOT NULL,
  san_move                TEXT,
  turn                    TEXT,
  sac_type                TEXT,
  player_rating           INT,
  surprise_score          REAL,
  info_surprise_bits      REAL,
  brilliant_for_rating    BOOLEAN NOT NULL DEFAULT FALSE,
  pb_score                REAL,
  pb_category             TEXT,
  obj_quality             REAL,
  practical_value         REAL,
  is_tal_zone             BOOLEAN NOT NULL DEFAULT FALSE,
  archetype               TEXT,
  brilliance_score        REAL,
  brilliance_score_raw    REAL,
  novelty_score           REAL,
  classification          TEXT,
  is_brilliant            BOOLEAN NOT NULL DEFAULT FALSE,
  features_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  sqlite_stage4_id        INT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chess_com_uuid, ply_index)
);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s4_game
  ON chess_com_brilliance_stage4 (chess_com_uuid);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s4_brilliant
  ON chess_com_brilliance_stage4 (is_brilliant, brilliance_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cc_brilliance_s4_sqlite
  ON chess_com_brilliance_stage4 (sqlite_stage4_id)
  WHERE sqlite_stage4_id IS NOT NULL;
