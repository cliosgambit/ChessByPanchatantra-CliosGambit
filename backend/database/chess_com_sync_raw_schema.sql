-- Staging table: Chess.com archive API responses before parse/upsert
CREATE TABLE IF NOT EXISTS chess_com_sync_raw (
  id              BIGSERIAL PRIMARY KEY,
  sync_batch_id   UUID NOT NULL,
  chess_com_id    TEXT NOT NULL,
  api_username    TEXT NOT NULL,
  archive_year    INT NOT NULL,
  archive_month   INT NOT NULL,
  archive_url     TEXT,
  api_path        TEXT NOT NULL,
  raw_json        JSONB NOT NULL,
  game_count      INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'fetched'
    CHECK (status IN ('fetched', 'parsed', 'failed')),
  fetch_error     TEXT,
  parse_error     TEXT,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parsed_at       TIMESTAMPTZ,
  UNIQUE (sync_batch_id, chess_com_id, archive_year, archive_month)
);

CREATE INDEX IF NOT EXISTS idx_chess_com_sync_raw_batch_status
  ON chess_com_sync_raw (sync_batch_id, status);

CREATE INDEX IF NOT EXISTS idx_chess_com_sync_raw_player
  ON chess_com_sync_raw (chess_com_id, fetched_at DESC);
