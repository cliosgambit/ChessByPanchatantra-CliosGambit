require('dotenv').config();
const db = require('../api/config/database');

db.query("SELECT datetime('now') AS now")
  .then((r) => {
    console.log('SQLite connection OK:', r.rows[0], 'path=', db.dbPath);
  })
  .catch((e) => {
    console.error('Database connection FAILED:', e.message);
    process.exit(1);
  });
