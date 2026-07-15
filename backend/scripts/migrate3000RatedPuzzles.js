/**
 * Migrate "3000_rated_puzzles" from Supabase (backend/.env DATABASE_URL)
 * into local SQLite clio.db.
 *
 * Usage (from backend/):
 *   node scripts/migrate3000RatedPuzzles.js
 */
const path = require('path');
const { createRequire } = require('module');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

let Pool;
try {
  ({ Pool } = require('pg'));
} catch {
  const requireFromVersion1 = createRequire(
    path.join(__dirname, '..', '..', '_version_1', 'backend', 'package.json')
  );
  ({ Pool } = requireFromVersion1('pg'));
}

const localDb = require('../api/config/database');
const { ensure3000RatedPuzzlesTable } = require('./ensure3000RatedPuzzlesTable');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL missing in backend/.env');
  }

  ensure3000RatedPuzzlesTable();

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const { rows } = await pool.query(`SELECT * FROM "3000_rated_puzzles"`);
    console.log('Fetched remote rows:', rows.length);
    if (rows[0]) console.log('Sample:', rows[0]);

    await localDb.query(`DELETE FROM "3000_rated_puzzles"`);

    let inserted = 0;
    for (const row of rows) {
      const fen = row.Fen || row.fen;
      if (!fen || !String(fen).trim()) continue;
      await localDb.query(
        `INSERT INTO "3000_rated_puzzles" ("Fen")
         VALUES ($1)`,
        [String(fen).trim()]
      );
      inserted += 1;
    }

    const localCount = await localDb.query(
      `SELECT COUNT(*) AS c FROM "3000_rated_puzzles"`
    );
    console.log('Inserted:', inserted, 'Local count:', localCount.rows[0]?.c);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
