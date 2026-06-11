const fs = require('fs');
const path = require('path');
const {
  requireSqlite,
  requirePg,
  quoteIdent,
  logLine,
  resolveSqlitePath
} = require('./shared');

const sqlite3 = requireSqlite();
const { Client } = requirePg();

const outDir = __dirname;
const logFile = path.join(outDir, 'import_log.txt');
const reportFile = path.join(outDir, 'failure_report.json');
const sqlFile = path.join(outDir, 'data_import.sql');

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function convertValue(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

async function main() {
  fs.writeFileSync(logFile, '', 'utf8');
  fs.writeFileSync(sqlFile, '-- Generated data import operations\n', 'utf8');

  const sqlitePath = resolveSqlitePath();
  const sqliteDb = new sqlite3.Database(sqlitePath);
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  logLine(logFile, `Connected. Source SQLite: ${sqlitePath}`);

  const tables = await allSqlite(
    sqliteDb,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );

  const failures = [];
  let totalRows = 0;

  try {
    await client.query('BEGIN');
    await client.query("SET session_replication_role = 'replica'");
  } catch (e) {
    logLine(logFile, `Could not disable FK checks globally, continuing: ${e.message}`);
  }

  for (const t of tables) {
    const tableName = t.name;
    const cols = await allSqlite(sqliteDb, `PRAGMA table_info(${quoteIdent(tableName)})`);
    const colNames = cols.map((c) => c.name);
    const rows = await allSqlite(sqliteDb, `SELECT * FROM ${quoteIdent(tableName)}`);
    logLine(logFile, `Current table: ${tableName}`);
    logLine(logFile, `Rows to migrate: ${rows.length}`);

    let migrated = 0;
    let failed = 0;

    if (rows.length === 0) {
      logLine(logFile, `Rows migrated: 0`);
      continue;
    }

    const batchSize = 200;
    fs.appendFileSync(sqlFile, `-- ${tableName}\n-- batched INSERT INTO public.${quoteIdent(tableName)} (...)\n\n`, 'utf8');

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params = [];
      const valueGroups = batch.map((row, rowIdx) => {
        const placeholders = colNames.map((c, colIdx) => {
          params.push(convertValue(row[c]));
          return `$${rowIdx * colNames.length + colIdx + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const insertSql = `INSERT INTO public.${quoteIdent(tableName)} (${colNames
        .map(quoteIdent)
        .join(', ')}) VALUES ${valueGroups.join(', ')}`;

      let ok = false;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await client.query(insertSql, params);
          migrated += batch.length;
          ok = true;
          break;
        } catch (e) {
          logLine(logFile, `Retry attempt ${attempt} failed on ${tableName} batch starting ${i}: ${e.message}`);
          if (attempt === 2) {
            // Fallback to per-row to isolate failures while continuing.
            for (const row of batch) {
              const rowValues = colNames.map((c) => convertValue(row[c]));
              const singleSql = `INSERT INTO public.${quoteIdent(tableName)} (${colNames
                .map(quoteIdent)
                .join(', ')}) VALUES (${colNames.map((_, idx) => `$${idx + 1}`).join(', ')})`;
              try {
                await client.query(singleSql, rowValues);
                migrated += 1;
              } catch (rowErr) {
                failed += 1;
                failures.push({
                  table: tableName,
                  error: rowErr.message,
                  sql: singleSql,
                  row
                });
              }
            }
            ok = true;
          }
        }
      }
      if (!ok) {
        logLine(logFile, `Batch permanently failed on ${tableName}, start index ${i}`);
      }
    }

    totalRows += migrated;
    logLine(logFile, `Rows migrated: ${migrated}`);
    logLine(logFile, `Failed rows: ${failed}`);
  }

  try {
    await client.query("SET session_replication_role = 'origin'");
  } catch (e) {
    logLine(logFile, `Could not re-enable FK checks globally, continuing: ${e.message}`);
  }
  await client.query('COMMIT');

  fs.writeFileSync(reportFile, JSON.stringify({ failures }, null, 2), 'utf8');
  logLine(logFile, `Total rows migrated: ${totalRows}`);
  logLine(logFile, `Failure report: ${reportFile}`);

  await client.end();
  sqliteDb.close();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
