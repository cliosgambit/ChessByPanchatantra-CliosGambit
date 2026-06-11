const fs = require('fs');
const path = require('path');
const sqlite3 = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sqlite3')).verbose();

const INPUT_FILE = path.join(__dirname, 'supabase_export.json');
const SQLITE_FILE = path.join(__dirname, 'database.db');
const LOG_FILE = path.join(__dirname, 'create_sqlite_log.txt');

function qIdent(input) {
  return `"${String(input).replace(/"/g, '""')}"`;
}

function sqliteTableName(schema, table) {
  return `${schema}.${table}`;
}

function mapPostgresTypeToSqlite(column) {
  const t = String(column.data_type || '').toLowerCase();
  const udt = String(column.udt_name || '').toLowerCase();
  if (['smallint', 'integer', 'bigint'].includes(t)) return 'INTEGER';
  if (['real', 'double precision', 'numeric', 'decimal'].includes(t)) return 'REAL';
  if (t === 'boolean') return 'INTEGER';
  if (t === 'bytea') return 'BLOB';
  if (udt.startsWith('_')) return 'TEXT';
  if (['json', 'jsonb', 'uuid', 'timestamp without time zone', 'timestamp with time zone', 'date', 'time without time zone', 'time with time zone', 'character varying', 'character', 'text'].includes(t)) {
    return 'TEXT';
  }
  return 'TEXT';
}

function normalizeDefault(defaultExpr) {
  if (!defaultExpr) return null;
  const d = String(defaultExpr).trim();
  if (/^now\(\)/i.test(d) || /^CURRENT_TIMESTAMP/i.test(d)) return 'CURRENT_TIMESTAMP';
  if (/^true$/i.test(d)) return '1';
  if (/^false$/i.test(d)) return '0';
  if (/^[-]?\d+(\.\d+)?$/.test(d)) return d;
  const quoted = d.match(/^'(.*)'::/);
  if (quoted) return `'${quoted[1].replace(/'/g, "''")}'`;
  return null;
}

function sanitizeCheckExpression(definition) {
  const raw = String(definition || '').trim();
  const m = raw.match(/^CHECK\s*\(([\s\S]+)\)$/i);
  if (!m) return null;
  const expr = m[1];
  const incompatiblePatterns = [/::/i, /~~/i, /(^|[^*])~([^*]|$)/i, /\bANY\s*\(/i, /\bARRAY\s*\[/i];
  if (incompatiblePatterns.some((p) => p.test(expr))) return null;
  return expr
    .replace(/\bchar_length\s*\(/gi, 'length(')
    .replace(/\bTRIM\s*\(\s*BOTH\s+FROM\s+([^)]+)\)/gi, 'trim($1)');
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function createSqliteSchema() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Missing export file: ${INPUT_FILE}`);
  }
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  const log = (line) => {
    const full = `[${new Date().toISOString()}] ${line}`;
    console.log(full);
    fs.appendFileSync(LOG_FILE, `${full}\n`, 'utf8');
  };

  const payload = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const db = new sqlite3.Database(SQLITE_FILE);

  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'BEGIN TRANSACTION');
  const existing = await all(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  for (const t of existing) {
    await run(db, `DROP TABLE IF EXISTS ${qIdent(t.name)}`);
  }

  for (const table of payload.tables) {
    const tName = sqliteTableName(table.schema, table.name);
    log(`Creating table: ${tName}`);

    const pkSet = new Set(table.primary_key || []);
    const colDefs = table.columns.map((c) => {
      const parts = [qIdent(c.column_name), mapPostgresTypeToSqlite(c)];
      if (c.is_nullable === 'NO' && !pkSet.has(c.column_name)) parts.push('NOT NULL');
      const def = normalizeDefault(c.column_default);
      if (def !== null) parts.push(`DEFAULT ${def}`);
      return parts.join(' ');
    });

    if ((table.primary_key || []).length > 0) {
      colDefs.push(`PRIMARY KEY (${table.primary_key.map((x) => qIdent(x)).join(', ')})`);
    }

    const fkGroups = new Map();
    for (const fk of table.foreign_keys || []) {
      if (!fkGroups.has(fk.constraint_name)) fkGroups.set(fk.constraint_name, []);
      fkGroups.get(fk.constraint_name).push(fk);
    }
    for (const group of fkGroups.values()) {
      const localCols = group.map((x) => qIdent(x.column_name)).join(', ');
      const refTable = sqliteTableName(group[0].foreign_table_schema, group[0].foreign_table_name);
      const refCols = group.map((x) => qIdent(x.foreign_column_name)).join(', ');
      colDefs.push(`FOREIGN KEY (${localCols}) REFERENCES ${qIdent(refTable)} (${refCols})`);
    }

    for (const uq of table.unique_constraints || []) {
      if (Array.isArray(uq.columns) && uq.columns.length > 0) {
        colDefs.push(`UNIQUE (${uq.columns.map((x) => qIdent(x)).join(', ')})`);
      }
    }

    for (const chk of table.check_constraints || []) {
      const sqliteExpr = sanitizeCheckExpression(chk.definition);
      if (sqliteExpr) colDefs.push(`CHECK (${sqliteExpr})`);
      else log(`Skipped incompatible CHECK: ${tName}.${chk.constraint_name}`);
    }

    await run(db, `CREATE TABLE ${qIdent(tName)} (\n  ${colDefs.join(',\n  ')}\n)`);
  }

  for (const table of payload.tables) {
    const tName = sqliteTableName(table.schema, table.name);
    for (const idx of table.indexes || []) {
      const def = String(idx.indexdef || '');
      if (!def || /^CREATE\s+UNIQUE\s+INDEX/i.test(def) === false && /^CREATE\s+INDEX/i.test(def) === false) continue;
      const converted = def
        .replace(/^CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ')
        .replace(new RegExp(`${qIdent(table.schema)}\\.${qIdent(table.name)}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), qIdent(tName))
        .replace(/::[\w\s\[\]\."]+/g, '');
      try {
        await run(db, converted);
      } catch (_e) {
        log(`Skipped incompatible index: ${tName}.${idx.indexname}`);
      }
    }
  }

  await run(db, 'COMMIT');
  await run(db, 'PRAGMA foreign_keys = ON');
  db.close();
  log(`Schema created in ${SQLITE_FILE}`);
}

createSqliteSchema().catch((error) => {
  console.error(error);
  process.exit(1);
});
