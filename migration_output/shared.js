const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, 'backend', '.env');
require(path.join(rootDir, 'backend', 'node_modules', 'dotenv')).config({ path: envPath });

function requireSqlite() {
  return require(path.join(rootDir, 'backend', 'node_modules', 'sqlite3')).verbose();
}

function requirePg() {
  return require(path.join(rootDir, 'backend', 'node_modules', 'pg'));
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function logLine(logFile, msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, `${line}\n`, 'utf8');
}

function resolveSqlitePath() {
  const candidates = [
    path.join(rootDir, 'database.db'),
    path.join(rootDir, 'database_backup', 'database.db')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const backupDir = path.join(rootDir, 'database_backup');
  if (fs.existsSync(backupDir)) {
    const dbFiles = fs
      .readdirSync(backupDir)
      .filter((f) => /^database_.*\.db$/i.test(f))
      .map((f) => path.join(backupDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (dbFiles.length > 0) return dbFiles[0];
  }
  throw new Error('SQLite database not found. Expected ./database.db or ./database_backup/database*.db');
}

function mapSqliteTypeToPostgres(rawType, col) {
  const t = String(rawType || '').toUpperCase();
  const upperName = String(col.name || '').toUpperCase();
  if (col.pk > 0 && t.includes('INT')) return 'BIGINT';
  if (t.includes('INT')) return upperName.startsWith('IS_') ? 'BOOLEAN' : 'BIGINT';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
  if (t.includes('BLOB')) return 'BYTEA';
  if (t.includes('BOOL')) return 'BOOLEAN';
  return 'TEXT';
}

function normalizeDefaultForPg(dflt) {
  if (dflt === null || dflt === undefined) return null;
  const raw = String(dflt).trim();
  if (raw.length === 0) return null;
  if (/^null$/i.test(raw)) return 'NULL';
  if (/^current_timestamp$/i.test(raw) || /^datetime\s*\(\s*'now'\s*\)$/i.test(raw)) return 'CURRENT_TIMESTAMP';
  if (/^\d+(\.\d+)?$/.test(raw)) return raw;
  if (/^'.*'$/.test(raw)) return raw.replace(/'/g, "''").replace(/^''|''$/g, "'");
  return `'${raw.replace(/'/g, "''")}'`;
}

module.exports = {
  rootDir,
  requireSqlite,
  requirePg,
  quoteIdent,
  logLine,
  resolveSqlitePath,
  mapSqliteTypeToPostgres,
  normalizeDefaultForPg
};
