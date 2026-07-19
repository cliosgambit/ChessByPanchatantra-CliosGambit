-- Pioneer Wins: early piece giveaway via a real mistake (not a trade), still won.

CREATE TABLE IF NOT EXISTS chess_com_pioneer_wins (
  chess_com_uuid              TEXT PRIMARY KEY
    REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  chess_com_id                TEXT NOT NULL,
  winner_color                TEXT,
  piece_lost                  TEXT,
  loss_move_number            INT,
  loss_ply                    INT,
  loss_uci                    TEXT,
  loss_san                    TEXT,
  material_delta_cp           INT,
  net_balance_after_loss_cp   INT,
  max_move_number             INT NOT NULL DEFAULT 10,
  best_move_san               TEXT,
  best_move_uci               TEXT,
  best_move_elo               INT,
  played_move_elo             INT,
  elo_diff                    INT,
  cpl                         INT,
  ep_before                   DOUBLE PRECISION,
  ep_after                    DOUBLE PRECISION,
  ep_delta                    DOUBLE PRECISION,
  win_pct_before              DOUBLE PRECISION,
  win_pct_after               DOUBLE PRECISION,
  win_pct_delta               DOUBLE PRECISION,
  detected_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_com_pioneer_wins_player
  ON chess_com_pioneer_wins (chess_com_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_chess_com_pioneer_wins_piece
  ON chess_com_pioneer_wins (piece_lost, loss_move_number);
