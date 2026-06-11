require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool
  .query('SELECT NOW()')
  .then((r) => {
    console.log('Database connection OK:', r.rows[0]);
    return pool.end();
  })
  .catch((e) => {
    console.error('Database connection FAILED:', e.message);
    pool.end();
    process.exit(1);
  });
