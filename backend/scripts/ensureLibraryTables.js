const db = require('../api/config/database');
const { sqlite } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

const LEGACY_TABLES = [
  'story_mapping',
  'principle_position',
  'principles',
  'story',
  'module',
  'chapter',
  // principles → morals migration
  'Story_Principles',
  'story_principle_mapping',
  'Chess_Principles',
];

async function ensureLibraryTables() {
  if (skipEnsureIfPostgres('Library tables ready (Stories, Story_Images, Morals, story_moral_mapping)')) {
    return;
  }
  sqlite.exec('PRAGMA foreign_keys = OFF;');
  try {
    for (const name of LEGACY_TABLES) {
      sqlite.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}";`);
    }
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS Stories (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      subheading      TEXT,
      content         TEXT,
      cover_image     TEXT,
      status          TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published')),
      created_by      INTEGER REFERENCES "Login"(id) ON DELETE SET NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS Story_Images (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id        INTEGER NOT NULL REFERENCES Stories(id) ON DELETE CASCADE,
      image_url       TEXT NOT NULL,
      display_order   INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_story_images_story
      ON Story_Images (story_id, display_order)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS Morals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      moral_code      TEXT NOT NULL UNIQUE,
      moral_name      TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS story_moral_mapping (
      story_id        INTEGER NOT NULL REFERENCES Stories(id) ON DELETE CASCADE,
      moral_id        INTEGER NOT NULL REFERENCES Morals(id) ON DELETE CASCADE,
      PRIMARY KEY (story_id, moral_id)
    )
  `);

  console.log('✅ Library tables ready (Stories, Story_Images, Morals, story_moral_mapping)');
}

module.exports = { ensureLibraryTables };
