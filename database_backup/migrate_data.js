const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sqlite3 = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sqlite3')).verbose();

const INPUT_FILE = path.join(__dirname, 'supabase_export.json');
const SQLITE_FILE = path.join(__dirname, 'database.db');
const LOG_FILE = path.join(__dirname, 'migration_log.txt');
const SUMMARY_FILE = path.join(__dirname, 'verification_summary.json');

function qIdent(input) {
  return `"${String(input).replace(/"/g, '""')}"`;
}

function sqliteTableName(schema, table) {
  return `${schema}.${table}`;
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

async function insertTableRows(db, table, log) {
  const tName = sqliteTableName(table.schema, table.name);
  const rows = table.rows || [];
  const columns = table.columns || [];
  if (rows.length === 0) return { inserted: 0 };

  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${qIdent(tName)} (${columns.map((c) => qIdent(c.column_name)).join(', ')}) VALUES (${placeholders})`;
  for (const row of rows) {
    const params = columns.map((c) => valueForSqlite(row[c.column_name]));
    await run(db, insertSql, params);
  }
  log(`Rows inserted: ${rows.length} into ${tName}`);
  return { inserted: rows.length };
}

async function main() {
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  const log = (line) => {
    const full = `[${new Date().toISOString()}] ${line}`;
    console.log(full);
    fs.appendFileSync(LOG_FILE, `${full}\n`, 'utf8');
  };

  log('Running export_supabase.js');
  execFileSync(process.execPath, [path.join(__dirname, 'export_supabase.js')], { stdio: 'inherit' });

  log('Running create_sqlite.js');
  execFileSync(process.execPath, [path.join(__dirname, 'create_sqlite.js')], { stdio: 'inherit' });

  if (!fs.existsSync(INPUT_FILE)) throw new Error(`Missing ${INPUT_FILE}`);
  const payload = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  const db = new sqlite3.Database(SQLITE_FILE);
  await run(db, 'PRAGMA foreign_keys = OFF');
  await run(db, 'BEGIN TRANSACTION');

  const verification = [];
  let totalRowsMigrated = 0;
  let failedTables = 0;

  for (const table of payload.tables) {
    const tName = sqliteTableName(table.schema, table.name);
    const sourceRows = Number(table.source_row_count ?? (table.rows || []).length);
    log(`Migrating table: ${tName}`);
    log(`Rows fetched: ${sourceRows}`);

    let inserted = 0;
    let ok = false;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (attempt > 1) {
          log(`Retrying ${tName} (attempt ${attempt})`);
        }
        await run(db, `DELETE FROM ${qIdent(tName)}`);
        const result = await insertTableRows(db, table, log);
        inserted = result.inserted;
        ok = true;
        break;
      } catch (error) {
        log(`Error migrating ${tName}: ${error.message}`);
        if (attempt === 2) {
          failedTables += 1;
        }
      }
    }

    const sqliteCountRows = await all(db, `SELECT COUNT(*) AS c FROM ${qIdent(tName)}`);
    const sqliteRows = Number(sqliteCountRows[0].c);
    totalRowsMigrated += sqliteRows;

    verification.push({
      table: tName,
      source_rows: sourceRows,
      sqlite_rows: sqliteRows,
      success: ok && sourceRows === sqliteRows
    });
    log(`Rows inserted: ${inserted}`);
    log(`Verification: source=${sourceRows}, sqlite=${sqliteRows}`);
  }

  await run(db, 'COMMIT');
  await run(db, 'PRAGMA foreign_keys = ON');

  const allTables = await all(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  const summary = {
    generated_at_utc: new Date().toISOString(),
    sqlite_path: SQLITE_FILE,
    total_tables_migrated: verification.length,
    total_rows_migrated: totalRowsMigrated,
    failed_tables: failedTables,
    verification_success: failedTables === 0 && verification.every((x) => x.success),
    table_results: verification
  };
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');

  log('--- FINAL VERIFICATION SUMMARY ---');
  log(`Total tables migrated: ${summary.total_tables_migrated}`);
  log(`Total rows migrated: ${summary.total_rows_migrated}`);
  log(`Verification success: ${summary.verification_success}`);
  log(`SQLite DB path: ${summary.sqlite_path}`);

  for (const tableNameRow of allTables) {
    const tableName = tableNameRow.name;
    const countRows = await all(db, `SELECT COUNT(*) AS c FROM ${qIdent(tableName)}`);
    const firstRows = await all(db, `SELECT * FROM ${qIdent(tableName)} LIMIT 5`);
    log(`Preview ${tableName}: total=${countRows[0].c}`);
    console.log(firstRows);
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
