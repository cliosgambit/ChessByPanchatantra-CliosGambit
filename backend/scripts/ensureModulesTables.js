const { sqlite } = require('../api/config/database');

function ensureModulesTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL,
      description           TEXT,
      visible_to_students   INTEGER NOT NULL DEFAULT 0
                              CHECK (visible_to_students IN (0, 1)),
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS module_stories (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id             INTEGER NOT NULL
                              REFERENCES modules(id) ON DELETE CASCADE,
      story_id              INTEGER NOT NULL
                              REFERENCES Stories(id) ON DELETE CASCADE,
      visible_to_students   INTEGER NOT NULL DEFAULT 1
                              CHECK (visible_to_students IN (0, 1)),
      display_order         INTEGER NOT NULL DEFAULT 0,
      added_at              TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (module_id, story_id)
    );

    CREATE INDEX IF NOT EXISTS idx_modules_visible
      ON modules (visible_to_students);
    CREATE INDEX IF NOT EXISTS idx_module_stories_module
      ON module_stories (module_id, display_order, id);
    CREATE INDEX IF NOT EXISTS idx_module_stories_story
      ON module_stories (story_id);
  `);

  console.log('✅ modules tables ready (modules, module_stories)');
}

module.exports = { ensureModulesTables };
