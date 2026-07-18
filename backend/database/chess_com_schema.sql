-- Chess.com persistence schema (replaces legacy player_games / players_activity game storage)

DROP TABLE IF EXISTS chess_com_clubs CASCADE;
DROP TABLE IF EXISTS chess_com_moves CASCADE;
DROP TABLE IF EXISTS chess_com_archives CASCADE;
DROP TABLE IF EXISTS chess_com_games CASCADE;
DROP TABLE IF EXISTS chess_com_profiles CASCADE;
DROP TABLE IF EXISTS player_games CASCADE;
DROP TABLE IF EXISTS players_activity CASCADE;

CREATE TABLE chess_com_profiles (
  chess_com_id        TEXT PRIMARY KEY,
  username            TEXT NOT NULL,
  name                TEXT,
  avatar_url          TEXT,
  title               TEXT,
  country_url         TEXT,
  country_code        TEXT,
  location            TEXT,
  followers           INT,
  league              TEXT,
  membership_status   TEXT,
  verified            BOOLEAN DEFAULT FALSE,
  is_streamer         BOOLEAN DEFAULT FALSE,
  twitch_url          TEXT,
  is_online           BOOLEAN DEFAULT FALSE,
  last_online_at      TIMESTAMPTZ,
  joined_at           TIMESTAMPTZ,
  profile_url         TEXT,
  profile_json        JSONB,
  stats_json          JSONB,
  rapid_rating        INT,
  rapid_best          INT,
  blitz_rating        INT,
  blitz_best          INT,
  bullet_rating       INT,
  bullet_best         INT,
  daily_rating        INT,
  daily_best          INT,
  puzzle_rush_best    INT,
  tactics_highest     INT,
  total_games_estimate INT DEFAULT 0,
  last_synced_at      TIMESTAMPTZ,
  sync_status         TEXT DEFAULT 'pending',
  sync_error          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chess_com_archives (
  id              BIGSERIAL PRIMARY KEY,
  chess_com_id    TEXT NOT NULL REFERENCES chess_com_profiles(chess_com_id) ON DELETE CASCADE,
  archive_year    INT NOT NULL,
  archive_month   INT NOT NULL,
  archive_url     TEXT NOT NULL,
  game_count      INT DEFAULT 0,
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chess_com_id, archive_year, archive_month)
);

CREATE TABLE chess_com_games (
  id                  BIGSERIAL PRIMARY KEY,
  chess_com_uuid      TEXT NOT NULL UNIQUE,
  chess_com_id        TEXT NOT NULL REFERENCES chess_com_profiles(chess_com_id) ON DELETE CASCADE,
  game_url            TEXT,
  played_at           TIMESTAMPTZ,
  time_class          TEXT,
  time_control        INT,
  time_control_label  TEXT,
  rated               BOOLEAN DEFAULT FALSE,
  pgn                 TEXT NOT NULL,
  white_username      TEXT,
  black_username      TEXT,
  white_rating        INT,
  black_rating        INT,
  white_result        TEXT,
  black_result        TEXT,
  white_accuracy      REAL,
  black_accuracy      REAL,
  white_country_code  TEXT,
  black_country_code  TEXT,
  white_score         TEXT,
  black_score         TEXT,
  self_color          TEXT,
  self_result         TEXT,
  self_result_type    TEXT,
  result_notation     TEXT,
  opponent_username   TEXT,
  move_count          INT,
  game_json           JSONB,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chess_com_games_player_played ON chess_com_games (chess_com_id, played_at DESC);
CREATE INDEX idx_chess_com_games_player_uuid ON chess_com_games (chess_com_id, chess_com_uuid);

CREATE TABLE chess_com_moves (
  id              BIGSERIAL PRIMARY KEY,
  chess_com_uuid  TEXT NOT NULL REFERENCES chess_com_games(chess_com_uuid) ON DELETE CASCADE,
  chess_com_id    TEXT NOT NULL,
  ply             INT NOT NULL,
  move_number     INT NOT NULL,
  color           CHAR(1) NOT NULL CHECK (color IN ('w', 'b')),
  san             TEXT NOT NULL,
  uci             TEXT,
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
);

CREATE INDEX idx_chess_com_moves_game_ply ON chess_com_moves (chess_com_uuid, ply);
CREATE INDEX idx_chess_com_moves_player ON chess_com_moves (chess_com_id);

CREATE TABLE chess_com_clubs (
  id           BIGSERIAL PRIMARY KEY,
  chess_com_id TEXT NOT NULL REFERENCES chess_com_profiles(chess_com_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT,
  icon_url     TEXT,
  member_count INT,
  synced_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chess_com_id, name)
);
