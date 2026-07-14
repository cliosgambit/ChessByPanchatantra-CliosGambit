// Local SQLite database (replaces Supabase / PostgreSQL via DATABASE_URL)
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'clio.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new DatabaseSync(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');
sqlite.exec('PRAGMA busy_timeout = 5000;');

const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sqlite.sql');
if (fs.existsSync(schemaPath)) {
  sqlite.exec(fs.readFileSync(schemaPath, 'utf8'));
}

function tableHasColumn(table, column) {
  const cols = sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  return cols.some((c) => c.name === column);
}

function quoteIdent(name) {
  const cleaned = String(name || '').replace(/"/g, '');
  return `"${cleaned}"`;
}

function addColumnIfNotExists(table, column, ddl) {
  if (tableHasColumn(table, column)) return false;
  sqlite.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${ddl}`);
  return true;
}

/** Expand reused $N placeholders into sequential ? for SQLite. */
function convertPlaceholders(sql, params = []) {
  const values = [];
  const out = sql.replace(/\$(\d+)/g, (_, n) => {
    values.push(params[Number(n) - 1]);
    return '?';
  });
  return { sql: out, values };
}

function serializeParam(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Rewrite common PostgreSQL idioms for SQLite. */
function translateSql(sql) {
  let s = sql;

  s = s.replace(/\bBIGSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  s = s.replace(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  s = s.replace(/\bBIGSERIAL\b/gi, 'INTEGER');
  s = s.replace(/\bSERIAL\b/gi, 'INTEGER');
  s = s.replace(/\bTIMESTAMPTZ\b/gi, 'TEXT');
  s = s.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  s = s.replace(/\bJSONB\b/gi, 'TEXT');
  s = s.replace(/\bUUID\b/gi, 'TEXT');
  s = s.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  s = s.replace(/\bNUMERIC\b/gi, 'REAL');
  s = s.replace(/\bVARCHAR\(\d+\)\b/gi, 'TEXT');
  s = s.replace(/\bCHAR\(\d+\)\b/gi, 'TEXT');

  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
  s = s.replace(/\bTRUE\b/g, '1');
  s = s.replace(/\bFALSE\b/g, '0');
  s = s.replace(/'\{\}'::jsonb/gi, "'{}'");
  s = s.replace(/\{\}::jsonb/gi, "'{}'");

  // Strip PG casts (::int, ::text[], etc.)
  s = s.replace(/::\s*(int|integer|bigint|text|jsonb|uuid|boolean|float|real|numeric)(\[\])?/gi, '');

  // Only strip CASCADE from DROP TABLE/INDEX statements, not ON DELETE CASCADE
  s = s.replace(/\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b([^;]*?)\bCASCADE\b/gi, 'DROP $1$2');

  s = s.replace(
    /SELECT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+information_schema\.tables\s+WHERE\s+table_schema\s*=\s*'public'\s+AND\s+table_name\s*=\s*'([^']+)'\s*\)\s+AS\s+exists/gi,
    (_, table) =>
      `SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}') AS "exists"`
  );

  return s;
}

/**
 * Expand `= ANY(?)` when the bound value is an array into `IN (?,?,?)`.
 */
function expandAnyClauses(sql, values) {
  const re = /=\s*ANY\s*\(\s*\?\)|IN\s*\(\s*ANY\s*\(\s*\?\)\s*\)|\?/gi;
  let m;
  let cursor = 0;
  let v = 0;
  const result = [];
  const newValues = [];

  while ((m = re.exec(sql)) !== null) {
    result.push(sql.slice(cursor, m.index));
    const token = m[0];
    if (/ANY/i.test(token)) {
      const arr = values[v++];
      const list = Array.isArray(arr) ? arr : arr == null ? [] : [arr];
      if (list.length === 0) {
        result.push('IN (SELECT NULL WHERE 0)');
      } else {
        result.push(`IN (${list.map(() => '?').join(',')})`);
        for (const item of list) newValues.push(serializeParam(item));
      }
    } else {
      result.push('?');
      newValues.push(serializeParam(values[v++]));
    }
    cursor = m.index + token.length;
  }
  result.push(sql.slice(cursor));
  return { sql: result.join(''), values: newValues };
}

function isMultiStatement(sql) {
  const stripped = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return (stripped.match(/;/g) || []).length > 1;
}

function mapSqliteError(err) {
  const message = err?.message || String(err);
  const e = new Error(message);
  if (/UNIQUE constraint failed/i.test(message)) e.code = '23505';
  e.original = err;
  return e;
}

function query(text, params = []) {
  try {
    let sql = translateSql(String(text));

    if ((!params || params.length === 0) && isMultiStatement(sql)) {
      sqlite.exec(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    const addCol = sql.match(
      /^\s*ALTER\s+TABLE\s+("?[\w]+"?)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+([\s\S]+)$/i
    );
    if (addCol) {
      const table = addCol[1].replace(/"/g, '');
      const column = addCol[2];
      const rest = addCol[3].replace(/;?\s*$/, '');
      addColumnIfNotExists(table, column, `${column} ${rest}`);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    const converted = convertPlaceholders(sql, params || []);
    const expanded = expandAnyClauses(converted.sql, converted.values);
    const stmt = sqlite.prepare(expanded.sql);
    const isSelect = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(expanded.sql);
    const hasReturning = /\bRETURNING\b/i.test(expanded.sql);

    if (isSelect || hasReturning) {
      const rows = stmt.all(...expanded.values);
      return Promise.resolve({ rows, rowCount: rows.length });
    }

    const info = stmt.run(...expanded.values);
    return Promise.resolve({
      rows: [],
      rowCount: Number(info.changes) || 0,
      lastInsertRowid: info.lastInsertRowid,
    });
  } catch (err) {
    return Promise.reject(mapSqliteError(err));
  }
}

module.exports = {
  query,
  sqlite,
  dbPath,
  addColumnIfNotExists,
  tableHasColumn,
};
