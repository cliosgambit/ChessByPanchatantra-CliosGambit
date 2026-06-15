const fs = require('fs');
const path = require('path');
const db = require('../api/config/database');

const SCHEMA_FLAG = path.join(__dirname, '../database/.chess_com_schema_applied');

async function ensureChessComSchema({ force = false } = {}) {
  if (!force && fs.existsSync(SCHEMA_FLAG)) {
    console.log('✅ chess.com schema already applied');
    return;
  }

  const sqlPath = path.join(__dirname, '../database/chess_com_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  fs.writeFileSync(SCHEMA_FLAG, new Date().toISOString());
  console.log('✅ chess.com schema applied (legacy game tables dropped, new tables created)');
}

module.exports = { ensureChessComSchema };
