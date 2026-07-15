const { sqlite } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

function ensureLichessPuzzlesTable() {
  if (skipEnsureIfPostgres('lichess_puzzles table ready')) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS lichess_puzzles (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      fen                TEXT NOT NULL UNIQUE,
      moves              TEXT,
      rating             INTEGER,
      rating_deviation   INTEGER,
      popularity         INTEGER,
      nb_plays           INTEGER,
      themes             TEXT,
      game_url           TEXT,
      opening_tags       TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lichess_puzzles_fen
      ON lichess_puzzles (fen);

    CREATE INDEX IF NOT EXISTS idx_lichess_puzzles_rating
      ON lichess_puzzles (rating);
  `);

  console.log('✅ lichess_puzzles table ready');
}

module.exports = { ensureLichessPuzzlesTable };
