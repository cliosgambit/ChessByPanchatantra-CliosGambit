const { sqlite } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

function addColumnIfMissing(table, column, ddl) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function ensureMoralPuzzleTables() {
  if (skipEnsureIfPostgres('moral puzzle tables ready (chesscom_random_puzzles, moral_puzzle_assignments, is_used)')) {
    return;
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chesscom_random_puzzles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT,
      fen           TEXT NOT NULL UNIQUE,
      pgn           TEXT,
      source_url    TEXT,
      image_url     TEXT,
      publish_time  INTEGER,
      comments      TEXT,
      is_used       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chesscom_random_puzzles_fen
      ON chesscom_random_puzzles (fen);
    CREATE INDEX IF NOT EXISTS idx_chesscom_random_puzzles_used
      ON chesscom_random_puzzles (is_used);

    CREATE TABLE IF NOT EXISTS moral_puzzle_assignments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id       INTEGER NOT NULL REFERENCES Stories(id) ON DELETE CASCADE,
      moral_id       INTEGER NOT NULL REFERENCES Morals(id) ON DELETE CASCADE,
      source         TEXT NOT NULL CHECK (source IN ('gm', 'lichess', 'chesscom')),
      puzzle_id      INTEGER NOT NULL,
      display_order  INTEGER NOT NULL DEFAULT 0,
      assigned_at    TEXT NOT NULL DEFAULT (datetime('now')),
      assigned_by    INTEGER REFERENCES "Login"(id) ON DELETE SET NULL,
      UNIQUE (story_id, moral_id, source, puzzle_id),
      UNIQUE (source, puzzle_id)
    );

    CREATE INDEX IF NOT EXISTS idx_moral_puzzle_assignments_story_moral
      ON moral_puzzle_assignments (story_id, moral_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_moral_puzzle_assignments_source
      ON moral_puzzle_assignments (source, puzzle_id);
  `);

  addColumnIfMissing('"3000_rated_puzzles"', 'is_used', 'is_used INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('lichess_puzzles', 'is_used', 'is_used INTEGER NOT NULL DEFAULT 0');

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_3000_rated_puzzles_used
      ON "3000_rated_puzzles" (is_used);
    CREATE INDEX IF NOT EXISTS idx_lichess_puzzles_used
      ON lichess_puzzles (is_used);
  `);

  console.log('✅ moral puzzle tables ready (chesscom_random_puzzles, moral_puzzle_assignments, is_used)');
}

module.exports = { ensureMoralPuzzleTables };
