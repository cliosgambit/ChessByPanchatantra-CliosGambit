const { sqlite } = require('../api/config/database');
const { skipEnsureIfPostgres } = require('./ensureOnPostgres');

function ensureStudentsTable() {
  if (skipEnsureIfPostgres('Students table ready')) return;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS Students (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id        INTEGER NOT NULL UNIQUE
                        REFERENCES "Login"(id) ON DELETE CASCADE,
      chess_com_id    TEXT UNIQUE
                        REFERENCES players("Chess_com_ID") ON DELETE SET NULL,
      player_name     TEXT NOT NULL,
      joining_date    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'left')),
      phone           TEXT,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_students_player_name
      ON Students (player_name);
    CREATE INDEX IF NOT EXISTS idx_students_joining_date
      ON Students (joining_date);
    CREATE INDEX IF NOT EXISTS idx_students_status
      ON Students (status);
  `);

  console.log('✅ Students table ready');
}

module.exports = { ensureStudentsTable };
