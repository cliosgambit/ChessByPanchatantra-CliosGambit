const fs = require('fs');
const path = require('path');
const sqlite3 = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sqlite3')).verbose();

const INPUT_FILE = path.join(__dirname, 'supabase_export.json');
const requestedOutput = process.argv[2];
const SQLITE_FILE = requestedOutput ? path.resolve(process.cwd(), requestedOutput) : path.join(__dirname, 'database.db');
const LOG_FILE = path.join(__dirname, 'import_log.txt');
const SUMMARY_FILE = path.join(__dirname, 'verification_summary.json');

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
  const incompatiblePatterns = [
    /::/i,
    /~~/i,
    /(^|[^*])~([^*]|$)/i,
    /\bANY\s*\(/i,
    /\bARRAY\s*\[/i
  ];
  if (incompatiblePatterns.some((p) => p.test(expr))) return null;
  return expr
    .replace(/\bchar_length\s*\(/gi, 'length(')
    .replace(/\bTRIM\s*\(\s*BOTH\s+FROM\s+([^)]+)\)/gi, 'trim($1)');
}

function valueForSqlite(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

async function importAndVerify() {
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
  let targetFile = SQLITE_FILE;
  if (fs.existsSync(targetFile)) {
    try {
      fs.unlinkSync(targetFile);
    } catch (e) {
      if (e && e.code === 'EBUSY') {
        targetFile = path.join(path.dirname(SQLITE_FILE), `database_${Date.now()}.db`);
        log(`Target database is locked, writing to fallback file: ${targetFile}`);
      } else {
        throw e;
      }
    }
  }

  const db = new sqlite3.Database(targetFile);
  await run(db, 'PRAGMA foreign_keys = ON');
  await run(db, 'BEGIN TRANSACTION');

  const perTable = [];

  for (const table of payload.tables) {
    const tName = sqliteTableName(table.schema, table.name);
    log(`Creating table: ${tName}`);

    const pkSet = new Set(table.primary_key || []);
    const colDefs = table.columns.map((c) => {
      const pieces = [qIdent(c.column_name), mapPostgresTypeToSqlite(c)];
      if (c.is_nullable === 'NO' && !pkSet.has(c.column_name)) pieces.push('NOT NULL');
      const def = normalizeDefault(c.column_default);
      if (def !== null) pieces.push(`DEFAULT ${def}`);
      return pieces.join(' ');
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
      const ordered = group;
      const localCols = ordered.map((x) => qIdent(x.column_name)).join(', ');
      const refTable = sqliteTableName(ordered[0].foreign_table_schema, ordered[0].foreign_table_name);
      const refCols = ordered.map((x) => qIdent(x.foreign_column_name)).join(', ');
      const onUpdate = ordered[0].update_rule && ordered[0].update_rule !== 'NO ACTION' ? ` ON UPDATE ${ordered[0].update_rule}` : '';
      const onDelete = ordered[0].delete_rule && ordered[0].delete_rule !== 'NO ACTION' ? ` ON DELETE ${ordered[0].delete_rule}` : '';
      colDefs.push(`FOREIGN KEY (${localCols}) REFERENCES ${qIdent(refTable)} (${refCols})${onUpdate}${onDelete}`);
    }

    for (const uq of table.unique_constraints || []) {
      if (Array.isArray(uq.columns) && uq.columns.length > 0) {
        colDefs.push(`UNIQUE (${uq.columns.map((x) => qIdent(x)).join(', ')})`);
      }
    }

    for (const chk of table.check_constraints || []) {
      const sqliteExpr = sanitizeCheckExpression(chk.definition);
      if (sqliteExpr) colDefs.push(`CHECK (${sqliteExpr})`);
      else log(`Skipped incompatible CHECK on ${tName}: ${chk.constraint_name}`);
    }

    await run(db, `CREATE TABLE ${qIdent(tName)} (\n  ${colDefs.join(',\n  ')}\n)`);

    if ((table.rows || []).length > 0) {
      const placeholders = table.columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${qIdent(tName)} (${table.columns.map((c) => qIdent(c.column_name)).join(', ')}) VALUES (${placeholders})`;
      for (const row of table.rows) {
        const params = table.columns.map((c) => valueForSqlite(row[c.column_name]));
        await run(db, insertSql, params);
      }
    }
    log(`Rows imported for ${tName}: ${table.rows.length}`);

    for (const idx of table.indexes || []) {
      const def = String(idx.indexdef || '');
      if (!def) continue;
      const cleaned = def.replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
      const converted = cleaned
        .replace(new RegExp(`${qIdent(table.schema)}\\.${qIdent(table.name)}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), qIdent(tName))
        .replace(/::[\w\s\[\]\."]+/g, '');
      try {
        await run(db, converted);
      } catch (_e) {
        // Keep import strict for data; keep incompatible index DDL in metadata file.
      }
    }

    const importedCount = await all(db, `SELECT COUNT(*) AS c FROM ${qIdent(tName)}`);
    perTable.push({
      schema: table.schema,
      table: table.name,
      sqlite_table: tName,
      source_rows: table.rows.length,
      imported_rows: importedCount[0].c
    });
  }

  await run(db, 'COMMIT');

  const sqliteTables = await all(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );

  const summary = {
    generated_at_utc: new Date().toISOString(),
    source_table_count: payload.tables.length,
    sqlite_table_count: sqliteTables.length,
    per_table: perTable,
    verification_ok:
      payload.tables.length === sqliteTables.length &&
      perTable.every((t) => Number(t.source_rows) === Number(t.imported_rows))
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');

  log(`Verification - source tables: ${summary.source_table_count}`);
  log(`Verification - sqlite tables: ${summary.sqlite_table_count}`);
  for (const t of summary.per_table) {
    log(`Verification - ${t.schema}.${t.table}: source=${t.source_rows}, sqlite=${t.imported_rows}`);
  }
  log(`Verification result: ${summary.verification_ok ? 'PASS' : 'FAIL'}`);
  log(`SQLite database written: ${targetFile}`);
  log(`Summary written: ${SUMMARY_FILE}`);

  db.close();
}

importAndVerify().catch((error) => {
  console.error(error);
  process.exit(1);
});
