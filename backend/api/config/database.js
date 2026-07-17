/**
 * App database:
 *   - DATABASE_URL set  → Supabase Postgres (primary)
 *   - otherwise         → local SQLite (legacy fallback)
 */
const fs = require('fs');
const path = require('path');
const { Mutex } = require('async-mutex');
require('dotenv').config();

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const USE_POSTGRES = Boolean(DATABASE_URL);
const isPostgres = USE_POSTGRES;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function quoteIdent(name) {
  const cleaned = String(name || '').replace(/"/g, '');
  return `"${cleaned}"`;
}

/** Mixed-case / reserved table names created with quotes on Supabase. */
const QUOTED_TABLES = [
  'Login',
  'Students',
  'Stories',
  'Story_Images',
  'Morals',
  '3000_rated_puzzles',
];

/** Columns that must stay case-sensitive on Postgres. */
const QUOTED_COLUMNS = ['Player_Name', 'Role', 'Chess_com_ID', 'Fen'];

function quoteKnownIdents(sql) {
  let s = String(sql);
  for (const table of QUOTED_TABLES) {
    const re = new RegExp(`(?<![\\w"])${table}(?![\\w"])`, 'g');
    s = s.replace(re, quoteIdent(table));
  }
  for (const col of QUOTED_COLUMNS) {
    const re = new RegExp(`(?<![\\w"])${col}(?![\\w"])`, 'g');
    s = s.replace(re, quoteIdent(col));
  }
  return s;
}

function translateSqliteToPostgres(sql) {
  let s = String(sql);

  // SQLite datetime → Postgres text timestamp (columns are TEXT)
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, '(now()::text)');
  s = s.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');

  // SQLite IFNULL → Postgres COALESCE
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  // SQLite strftime on ISO text timestamps → Postgres EXTRACT
  s = s.replace(
    /CAST\s*\(\s*strftime\s*\(\s*'%Y'\s*,\s*([^)]+?)\s*\)\s+AS\s+INTEGER\s*\)/gi,
    'EXTRACT(YEAR FROM ($1)::timestamptz)::integer'
  );
  s = s.replace(
    /CAST\s*\(\s*strftime\s*\(\s*'%m'\s*,\s*([^)]+?)\s*\)\s+AS\s+INTEGER\s*\)/gi,
    'EXTRACT(MONTH FROM ($1)::timestamptz)::integer'
  );
  s = s.replace(
    /CAST\s*\(\s*strftime\s*\(\s*'%d'\s*,\s*([^)]+?)\s*\)\s+AS\s+INTEGER\s*\)/gi,
    'EXTRACT(DAY FROM ($1)::timestamptz)::integer'
  );
  s = s.replace(
    /strftime\s*\(\s*'%Y'\s*,\s*([^)]+?)\s*\)/gi,
    `to_char(($1)::timestamptz, 'YYYY')`
  );
  s = s.replace(
    /strftime\s*\(\s*'%m'\s*,\s*([^)]+?)\s*\)/gi,
    `to_char(($1)::timestamptz, 'MM')`
  );

  // Integer flag columns (rated, verified, …) — SQLite used 0/1, not boolean
  s = s.replace(/\b=\s*TRUE\b/gi, '= 1');
  s = s.replace(/\b=\s*FALSE\b/gi, '= 0');
  s = s.replace(/\bTRUE\b/g, '1');
  s = s.replace(/\bFALSE\b/g, '0');

  s = quoteKnownIdents(s);
  return s;
}

function serializePgParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

// ---------------------------------------------------------------------------
// Postgres (Supabase) path
// ---------------------------------------------------------------------------

let pool = null;
let sqlite = null;
let dbPath = null;
let pgReady = null;

function getPool() {
  if (pool) return pool;
  const { Pool } = require('pg');

  // Transaction pooler (6543) breaks prepared statements; prefer session (5432).
  let connectionString = DATABASE_URL;
  try {
    const u = new URL(connectionString);
    if (u.port === '6543') {
      u.port = '5432';
      connectionString = u.toString();
      console.log('[db] Using session pooler port 5432 for app queries');
    }
  } catch {
    // keep original
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  pool.on('error', (err) => {
    console.error('[db] Postgres pool error:', err.message);
  });
  return pool;
}

async function ensurePgReady() {
  if (pgReady) return pgReady;
  pgReady = (async () => {
    const p = getPool();
    await p.query('SELECT 1');
    return true;
  })();
  return pgReady;
}

/** Held client while app uses BEGIN/COMMIT/ROLLBACK across pooled connections. */
let pgTxClient = null;
let pgTxDepth = 0;
const pgTxMutex = new Mutex();
let pgTxRelease = null;

async function runOnPg(clientOrPool, sql, params = []) {
  const values = (params || []).map(serializePgParam);
  try {
    const result = await clientOrPool.query(sql, values);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    };
  } catch (err) {
    if (
      /duplicate key|unique constraint/i.test(err.message || '') &&
      /^\s*INSERT\s+INTO\b/i.test(sql) &&
      !/\bON\s+CONFLICT\b/i.test(sql)
    ) {
      // ON CONFLICT must come before RETURNING — appending after RETURNING is invalid SQL.
      const trimmed = sql.replace(/;?\s*$/, '');
      const returningMatch = trimmed.match(/\bRETURNING\b[\s\S]*$/i);
      const retrySql = returningMatch
        ? `${trimmed.slice(0, returningMatch.index).trimEnd()} ON CONFLICT DO NOTHING ${returningMatch[0]}`
        : `${trimmed} ON CONFLICT DO NOTHING`;
      const result = await clientOrPool.query(retrySql, values);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
      };
    }
    throw err;
  }
}

async function queryPostgres(text, params = []) {
  await ensurePgReady();
  const sql = translateSqliteToPostgres(text);
  const trimmed = sql.trim();
  const txnCmd =
    (!params || params.length === 0) && /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(trimmed)
      ? trimmed.split(/\s+/)[0].toUpperCase()
      : null;

  if (txnCmd === 'BEGIN') {
    if (pgTxDepth === 0) {
      pgTxRelease = await pgTxMutex.acquire();
      pgTxClient = await getPool().connect();
      await pgTxClient.query('BEGIN');
      pgTxDepth = 1;
    } else {
      await pgTxClient.query(`SAVEPOINT nest_${pgTxDepth}`);
      pgTxDepth += 1;
    }
    return { rows: [], rowCount: 0 };
  }

  if (txnCmd === 'COMMIT') {
    if (!pgTxClient || pgTxDepth <= 0) return { rows: [], rowCount: 0 };
    pgTxDepth -= 1;
    if (pgTxDepth === 0) {
      await pgTxClient.query('COMMIT');
      pgTxClient.release();
      pgTxClient = null;
      if (pgTxRelease) {
        pgTxRelease();
        pgTxRelease = null;
      }
    } else {
      await pgTxClient.query(`RELEASE SAVEPOINT nest_${pgTxDepth}`);
    }
    return { rows: [], rowCount: 0 };
  }

  if (txnCmd === 'ROLLBACK') {
    if (!pgTxClient) return { rows: [], rowCount: 0 };
    if (pgTxDepth <= 1) {
      try {
        await pgTxClient.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      pgTxClient.release();
      pgTxClient = null;
      pgTxDepth = 0;
      if (pgTxRelease) {
        pgTxRelease();
        pgTxRelease = null;
      }
    } else {
      pgTxDepth -= 1;
      try {
        await pgTxClient.query(`ROLLBACK TO SAVEPOINT nest_${pgTxDepth}`);
        await pgTxClient.query(`RELEASE SAVEPOINT nest_${pgTxDepth}`);
      } catch {
        /* ignore */
      }
    }
    return { rows: [], rowCount: 0 };
  }

  const runner = pgTxClient || getPool();
  return runOnPg(runner, sql, params);
}

async function withTransactionPostgres(fn) {
  await queryPostgres('BEGIN');
  try {
    const result = await fn();
    await queryPostgres('COMMIT');
    return result;
  } catch (err) {
    try {
      await queryPostgres('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function tableHasColumnPostgres(table, column) {
  const { rows } = await queryPostgres(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [String(table).replace(/"/g, ''), column]
  );
  return rows.length > 0;
}

async function addColumnIfNotExistsPostgres(table, column, ddl) {
  if (await tableHasColumnPostgres(table, column)) return false;
  // ddl like: "col TYPE ..." or "col TYPE DEFAULT ..."
  await queryPostgres(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN IF NOT EXISTS ${ddl}`);
  return true;
}

// ---------------------------------------------------------------------------
// SQLite fallback path (unchanged behavior)
// ---------------------------------------------------------------------------

const writeMutex = new Mutex();
let txRelease = null;
let txDepth = 0;

function initSqlite() {
  if (sqlite) return;
  const { DatabaseSync } = require('node:sqlite');
  const dataDir = path.join(__dirname, '..', '..', 'data');
  dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'clio.db');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');

  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sqlite.sql');
  if (fs.existsSync(schemaPath)) {
    sqlite.exec(fs.readFileSync(schemaPath, 'utf8'));
  }
}

function tableHasColumnSqlite(table, column) {
  initSqlite();
  const cols = sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  return cols.some((c) => c.name === column);
}

function addColumnIfNotExistsSqlite(table, column, ddl) {
  if (tableHasColumnSqlite(table, column)) return false;
  initSqlite();
  sqlite.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${ddl}`);
  return true;
}

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

function translateSqlForSqlite(sql) {
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
  s = s.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+)\)/gi, "CAST(strftime('%d', $1) AS INTEGER)");
  s = s.replace(/\s+NULLS\s+LAST\b/gi, '');
  s = s.replace(/\s+NULLS\s+FIRST\b/gi, '');
  s = s.replace(/::\s*(int|integer|bigint|text|jsonb|uuid|boolean|float|real|numeric)(\[\])?/gi, '');
  s = s.replace(/\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b([^;]*?)\bCASCADE\b/gi, 'DROP $1$2');
  return s;
}

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
      newValues.push(serializeParam(values[v++]));
      result.push('?');
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

function releaseTxLock() {
  if (txRelease) {
    const release = txRelease;
    txRelease = null;
    release();
  }
  txDepth = 0;
}

function execTxnControl(command) {
  initSqlite();
  const cmd = String(command || '')
    .trim()
    .split(/\s+/)[0]
    .toUpperCase();

  if (cmd === 'BEGIN') {
    if (txDepth === 0) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        /* none */
      }
      sqlite.exec('BEGIN');
      txDepth = 1;
    } else {
      sqlite.exec(`SAVEPOINT nest_${txDepth}`);
      txDepth += 1;
    }
    return { rows: [], rowCount: 0 };
  }
  if (cmd === 'COMMIT') {
    if (txDepth <= 0) return { rows: [], rowCount: 0 };
    txDepth -= 1;
    if (txDepth === 0) {
      sqlite.exec('COMMIT');
      releaseTxLock();
    } else {
      sqlite.exec(`RELEASE SAVEPOINT nest_${txDepth}`);
    }
    return { rows: [], rowCount: 0 };
  }
  if (cmd === 'ROLLBACK') {
    if (txDepth <= 0) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      releaseTxLock();
      return { rows: [], rowCount: 0 };
    }
    txDepth -= 1;
    if (txDepth === 0) {
      try {
        sqlite.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      releaseTxLock();
    } else {
      try {
        sqlite.exec(`ROLLBACK TO SAVEPOINT nest_${txDepth}`);
      } catch {
        /* ignore */
      }
      try {
        sqlite.exec(`RELEASE SAVEPOINT nest_${txDepth}`);
      } catch {
        /* ignore */
      }
    }
    return { rows: [], rowCount: 0 };
  }
  return null;
}

function runQuerySync(text, params = []) {
  initSqlite();
  let sql = translateSqlForSqlite(String(text));

  if ((!params || params.length === 0) && isMultiStatement(sql)) {
    sqlite.exec(sql);
    return { rows: [], rowCount: 0 };
  }

  const addCol = sql.match(
    /^\s*ALTER\s+TABLE\s+("?[\w]+"?)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+([\s\S]+)$/i
  );
  if (addCol) {
    const table = addCol[1].replace(/"/g, '');
    const column = addCol[2];
    const rest = addCol[3].replace(/;?\s*$/, '');
    addColumnIfNotExistsSqlite(table, column, `${column} ${rest}`);
    return { rows: [], rowCount: 0 };
  }

  const converted = convertPlaceholders(sql, params || []);
  const expanded = expandAnyClauses(converted.sql, converted.values);
  const stmt = sqlite.prepare(expanded.sql);
  const isSelect = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(expanded.sql);
  const hasReturning = /\bRETURNING\b/i.test(expanded.sql);

  if (isSelect || hasReturning) {
    const rows = stmt.all(...expanded.values);
    return { rows, rowCount: rows.length };
  }

  const info = stmt.run(...expanded.values);
  return {
    rows: [],
    rowCount: Number(info.changes) || 0,
    lastInsertRowid: info.lastInsertRowid,
  };
}

async function querySqlite(text, params = []) {
  try {
    const trimmed = String(text || '').trim();
    const isTxn =
      (!params || params.length === 0) && /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(trimmed);

    if (isTxn) {
      const cmd = trimmed.split(/\s+/)[0].toUpperCase();
      if (cmd === 'BEGIN' && txDepth === 0) {
        txRelease = await writeMutex.acquire();
        try {
          return execTxnControl('BEGIN');
        } catch (err) {
          releaseTxLock();
          throw err;
        }
      }
      return execTxnControl(cmd);
    }

    if (txDepth > 0) return runQuerySync(text, params);
    return await writeMutex.runExclusive(() => runQuerySync(text, params));
  } catch (err) {
    return Promise.reject(mapSqliteError(err));
  }
}

async function withTransactionSqlite(fn) {
  await querySqlite('BEGIN');
  try {
    const result = await fn();
    await querySqlite('COMMIT');
    return result;
  } catch (err) {
    try {
      await querySqlite('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function query(text, params = []) {
  if (USE_POSTGRES) return queryPostgres(text, params);
  return querySqlite(text, params);
}

async function withTransaction(fn) {
  if (USE_POSTGRES) return withTransactionPostgres(fn);
  return withTransactionSqlite(fn);
}

function tableHasColumn(table, column) {
  if (USE_POSTGRES) {
    // sync API expected by some ensure scripts — return false; they use addColumnIfNotExists
    console.warn('[db] tableHasColumn sync call on Postgres; use async addColumnIfNotExists');
    return false;
  }
  return tableHasColumnSqlite(table, column);
}

function addColumnIfNotExists(table, column, ddl) {
  if (USE_POSTGRES) {
    // fire-and-forget style for sync callers; prefer skipping ensures on PG
    addColumnIfNotExistsPostgres(table, column, ddl).catch((err) => {
      console.warn('[db] addColumnIfNotExists:', err.message);
    });
    return false;
  }
  return addColumnIfNotExistsSqlite(table, column, ddl);
}

/** No-op stub when on Postgres so ensure* scripts that call sqlite.exec don't crash. */
const sqliteStub = {
  exec() {
    /* schema already on Supabase */
  },
  prepare() {
    return {
      all() {
        return [];
      },
      run() {
        return { changes: 0, lastInsertRowid: 0 };
      },
    };
  },
};

if (!USE_POSTGRES) {
  initSqlite();
}

module.exports = {
  query,
  withTransaction,
  sqlite: USE_POSTGRES ? sqliteStub : sqlite,
  dbPath: USE_POSTGRES ? 'supabase-postgres' : dbPath,
  isPostgres,
  USE_POSTGRES,
  addColumnIfNotExists,
  tableHasColumn,
  getPool: USE_POSTGRES ? getPool : null,
};
