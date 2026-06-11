DROP TABLE IF EXISTS public."public.3000_rated_puzzles" CASCADE;
DROP TABLE IF EXISTS public."public.Login" CASCADE;
DROP TABLE IF EXISTS public."public.brilliant_moves" CASCADE;
DROP TABLE IF EXISTS public."public.chapter" CASCADE;
DROP TABLE IF EXISTS public."public.chess_puzzle" CASCADE;
DROP TABLE IF EXISTS public."public.module" CASCADE;
DROP TABLE IF EXISTS public."public.player_games" CASCADE;
DROP TABLE IF EXISTS public."public.players" CASCADE;
DROP TABLE IF EXISTS public."public.players_activity" CASCADE;
DROP TABLE IF EXISTS public."public.principle_position" CASCADE;
DROP TABLE IF EXISTS public."public.principles" CASCADE;
DROP TABLE IF EXISTS public."public.roles_control" CASCADE;
DROP TABLE IF EXISTS public."public.story" CASCADE;
DROP TABLE IF EXISTS public."public.story_mapping" CASCADE;
CREATE TABLE IF NOT EXISTS "public.3000_rated_puzzles" (
  "Rated_id" TEXT,
  "principle_id" TEXT,
  "Fen" TEXT,
  PRIMARY KEY ("Rated_id")
);

CREATE TABLE IF NOT EXISTS "public.Login" (
  "Chess_com_ID" TEXT,
  "Player_Name" TEXT,
  "email" TEXT,
  "password" TEXT,
  "Role" TEXT NOT NULL DEFAULT 'student',
  "otp" TEXT,
  "otp_expires_at" TEXT,
  PRIMARY KEY ("Chess_com_ID")
);

CREATE TABLE IF NOT EXISTS "public.brilliant_moves" (
  "id" BIGINT,
  "game_link" TEXT NOT NULL,
  "chess_com_id" TEXT NOT NULL,
  "player_name" TEXT NOT NULL,
  "move_number" BIGINT NOT NULL,
  "move_san" TEXT NOT NULL,
  "move_uci" TEXT NOT NULL,
  "player_color" TEXT NOT NULL,
  "game_date" TEXT NOT NULL,
  "white_player" TEXT NOT NULL,
  "black_player" TEXT NOT NULL,
  "game_result" TEXT NOT NULL,
  "pgn_moves" TEXT NOT NULL,
  "hanging_pieces" TEXT NOT NULL,
  "analysis_depth" BIGINT NOT NULL,
  "weighted_eval_score" DOUBLE PRECISION,
  "eval_summary" TEXT,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP,
  "fen_before_move" TEXT NOT NULL,
  "fen_after_move" TEXT NOT NULL,
  "move_from" TEXT NOT NULL,
  "move_to" TEXT NOT NULL,
  "captured_piece" TEXT,
  "promotion" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public.chapter" (
  "chapter_id" TEXT,
  "chapter_name" TEXT,
  "story_ids" TEXT,
  "module_id" TEXT,
  PRIMARY KEY ("chapter_id")
);

CREATE TABLE IF NOT EXISTS "public.chess_puzzle" (
  "chess_puzzle_id" TEXT,
  "principle_id" TEXT,
  "fen_with_move" TEXT,
  "isdone" BIGINT DEFAULT 0,
  "answer" TEXT,
  PRIMARY KEY ("chess_puzzle_id")
);

CREATE TABLE IF NOT EXISTS "public.module" (
  "module_id" TEXT,
  "module_name" TEXT,
  "chapter_ids" TEXT,
  PRIMARY KEY ("module_id")
);

CREATE TABLE IF NOT EXISTS "public.player_games" (
  "game_id" BIGINT,
  "chess_com_id" TEXT NOT NULL,
  "game_date" TEXT NOT NULL,
  "pgn" TEXT NOT NULL,
  "white_player" TEXT,
  "black_player" TEXT,
  "is_brilliant_found" BOOLEAN,
  "brilliant_moves" TEXT,
  PRIMARY KEY ("game_id")
);

CREATE TABLE IF NOT EXISTS "public.players" (
  "Chess_com_ID" TEXT,
  "Player_Name" TEXT,
  "Joining_Date" TEXT,
  "activity_tracker" TEXT,
  "current_elo" BIGINT,
  "chess_profile_url" TEXT,
  "chess_country_url" TEXT,
  "rapid_rating" BIGINT,
  "rapid_best" BIGINT,
  "blitz_rating" BIGINT,
  "blitz_best" BIGINT,
  "bullet_rating" BIGINT,
  "bullet_best" BIGINT,
  "fide_rating" BIGINT,
  "tactics_highest" BIGINT,
  "puzzle_rush_best" BIGINT,
  "chess_last_synced_at" TEXT,
  PRIMARY KEY ("Chess_com_ID")
);

CREATE TABLE IF NOT EXISTS "public.players_activity" (
  "Chess_com_ID" TEXT NOT NULL,
  "index" BIGINT,
  "status" TEXT,
  "total_games" BIGINT,
  "blitz_rating" TEXT,
  "rapid_rating" TEXT,
  "rapid_results" TEXT,
  "blitz_results" TEXT,
  "fetch_lock" BIGINT,
  "date" TEXT,
  "blitz_times" TEXT,
  "rapid_times" TEXT,
  PRIMARY KEY ("index")
);

CREATE TABLE IF NOT EXISTS "public.principle_position" (
  "principle_id" TEXT,
  "principle" TEXT,
  "fen_with_move" TEXT,
  "puzzle_list" TEXT,
  "isdone" BIGINT DEFAULT 0,
  PRIMARY KEY ("principle_id")
);

CREATE TABLE IF NOT EXISTS "public.principles" (
  "id" TEXT,
  "name" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public.roles_control" (
  "role" TEXT,
  "mod_access" TEXT,
  "chap_access" TEXT,
  "story_access" TEXT,
  PRIMARY KEY ("role")
);

CREATE TABLE IF NOT EXISTS "public.story" (
  "story_id" TEXT,
  "title" TEXT,
  "description" TEXT,
  "chapter_id" TEXT,
  "module_id" TEXT,
  "status" TEXT DEFAULT 'published',
  "tags" TEXT DEFAULT '[]',
  PRIMARY KEY ("story_id")
);

CREATE TABLE IF NOT EXISTS "public.story_mapping" (
  "mapping_id" TEXT,
  "story_id" TEXT,
  "principle_id" TEXT,
  "story_text" TEXT,
  "isdone" BIGINT DEFAULT 0,
  PRIMARY KEY ("mapping_id")
);


-- Foreign Keys
ALTER TABLE "public.story" ADD CONSTRAINT "public.story_fk_0" FOREIGN KEY ("module_id") REFERENCES "public.module" ("module_id");
ALTER TABLE "public.story" ADD CONSTRAINT "public.story_fk_1" FOREIGN KEY ("chapter_id") REFERENCES "public.chapter" ("chapter_id");
ALTER TABLE "public.story_mapping" ADD CONSTRAINT "public.story_mapping_fk_0" FOREIGN KEY ("story_id") REFERENCES "public.story" ("story_id");
ALTER TABLE "public.story_mapping" ADD CONSTRAINT "public.story_mapping_fk_1" FOREIGN KEY ("principle_id") REFERENCES "public.principles" ("id");

-- Indexes

