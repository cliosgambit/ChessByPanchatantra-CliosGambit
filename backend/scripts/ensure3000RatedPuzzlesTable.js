const db = require('../api/config/database');
const { sqlite } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

function ensure3000RatedPuzzlesTable() {
  if (skipEnsureIfPostgres('3000_rated_puzzles table ready')) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "3000_rated_puzzles" (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      moral_id      INTEGER REFERENCES Morals(id) ON DELETE SET NULL,
      "Fen"         TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    let cols = sqlite.prepare(`PRAGMA table_info("3000_rated_puzzles")`).all();
    let names = new Set(cols.map((c) => c.name));

    if (!names.has('created_at')) {
      sqlite.exec(
        `ALTER TABLE "3000_rated_puzzles" ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`
      );
    }
    if (!names.has('moral_id')) {
      sqlite.exec(
        `ALTER TABLE "3000_rated_puzzles" ADD COLUMN moral_id INTEGER REFERENCES Morals(id) ON DELETE SET NULL`
      );
    }

    cols = sqlite.prepare(`PRAGMA table_info("3000_rated_puzzles")`).all();
    names = new Set(cols.map((c) => c.name));

    // Drop legacy Rated_id / principle_id by rebuilding
    if (names.has('Rated_id') || names.has('principle_id')) {
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      sqlite.exec(`
        CREATE TABLE "3000_rated_puzzles__new" (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          moral_id      INTEGER REFERENCES Morals(id) ON DELETE SET NULL,
          "Fen"         TEXT NOT NULL,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO "3000_rated_puzzles__new" (id, moral_id, "Fen", created_at)
        SELECT
          id,
          ${names.has('moral_id') ? 'moral_id' : 'NULL'},
          "Fen",
          COALESCE(created_at, datetime('now'))
        FROM "3000_rated_puzzles";
        DROP TABLE "3000_rated_puzzles";
        ALTER TABLE "3000_rated_puzzles__new" RENAME TO "3000_rated_puzzles";
      `);
      sqlite.exec('PRAGMA foreign_keys = ON;');
    }
  } catch (err) {
    console.warn('[ensure3000RatedPuzzlesTable]', err.message);
    try {
      sqlite.exec('PRAGMA foreign_keys = ON;');
    } catch {}
  }

  console.log('✅ 3000_rated_puzzles table ready');
}

async function count3000RatedPuzzles() {
  const { rows } = await db.query(`SELECT COUNT(*) AS c FROM "3000_rated_puzzles"`);
  return Number(rows[0]?.c) || 0;
}

module.exports = {
  ensure3000RatedPuzzlesTable,
  count3000RatedPuzzles,
};
