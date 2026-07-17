const db = require('../api/config/database');
const { sqlite, isPostgres } = db;

function addColumnIfMissing(table, column, ddl) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

async function renamePgnColumnToSolution() {
  try {
    if (isPostgres) {
      const cols = await db.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'chesscom_random_puzzles'
           AND column_name IN ('pgn', 'solution')`
      );
      const names = new Set(cols.rows.map((r) => r.column_name));
      if (names.has('pgn') && !names.has('solution')) {
        await db.query(`ALTER TABLE chesscom_random_puzzles RENAME COLUMN pgn TO solution`);
        console.log('✅ renamed chesscom_random_puzzles.pgn → solution');
      }
      return;
    }
    const cols = sqlite.prepare(`PRAGMA table_info(chesscom_random_puzzles)`).all();
    const hasPgn = cols.some((c) => c.name === 'pgn');
    const hasSolution = cols.some((c) => c.name === 'solution');
    if (hasPgn && !hasSolution) {
      sqlite.exec(`ALTER TABLE chesscom_random_puzzles RENAME COLUMN pgn TO solution`);
      console.log('✅ renamed chesscom_random_puzzles.pgn → solution');
    }
  } catch (err) {
    console.warn('chesscom_random_puzzles pgn→solution rename skipped:', err.message || err);
  }
}

async function ensureMoralPuzzleTables() {
  if (isPostgres) {
    await renamePgnColumnToSolution();
    console.log(
      '✅ moral puzzle tables ready (chesscom_random_puzzles, moral_puzzle_assignments, is_used) (Supabase)'
    );
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chesscom_random_puzzles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT,
      fen           TEXT NOT NULL UNIQUE,
      solution      TEXT,
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
  await renamePgnColumnToSolution();

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_3000_rated_puzzles_used
      ON "3000_rated_puzzles" (is_used);
    CREATE INDEX IF NOT EXISTS idx_lichess_puzzles_used
      ON lichess_puzzles (is_used);
  `);

  console.log('✅ moral puzzle tables ready (chesscom_random_puzzles, moral_puzzle_assignments, is_used)');
}

module.exports = { ensureMoralPuzzleTables };
