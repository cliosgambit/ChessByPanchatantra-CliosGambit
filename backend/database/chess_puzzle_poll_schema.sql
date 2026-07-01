CREATE TABLE IF NOT EXISTS chess_puzzle_poll_response (
  id                  SERIAL PRIMARY KEY,
  chess_puzzle_id     TEXT NOT NULL,
  selected_move       TEXT NOT NULL,
  is_correct          BOOLEAN NOT NULL DEFAULT FALSE,
  poll_options        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chess_puzzle_poll_puzzle_id
  ON chess_puzzle_poll_response (chess_puzzle_id);

CREATE INDEX IF NOT EXISTS idx_chess_puzzle_poll_created_at
  ON chess_puzzle_poll_response (created_at DESC);
