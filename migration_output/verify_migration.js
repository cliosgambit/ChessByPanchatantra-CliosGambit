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
const logFile = path.join(outDir, 'verification_log.txt');
const summaryFile = path.join(outDir, 'verification_summary.json');

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function main() {
  fs.writeFileSync(logFile, '', 'utf8');
  const sqlitePath = resolveSqlitePath();
  const sqliteDb = new sqlite3.Database(sqlitePath);
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pg.connect();

  const tables = await allSqlite(
    sqliteDb,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );

  const results = [];
  let totalRows = 0;

  for (const t of tables) {
    const tableName = t.name;
    const sqliteCnt = await allSqlite(sqliteDb, `SELECT COUNT(*) AS c FROM ${quoteIdent(tableName)}`);
    const pgCnt = await pg.query(`SELECT COUNT(*)::bigint AS c FROM public.${quoteIdent(tableName)}`);
    const sqliteRows = Number(sqliteCnt[0].c);
    const postgresRows = Number(pgCnt.rows[0].c);
    totalRows += postgresRows;

    logLine(logFile, `Table ${tableName}: sqlite=${sqliteRows}, postgres=${postgresRows}`);

    const sample = await pg.query(`SELECT * FROM public.${quoteIdent(tableName)} LIMIT 3`);
    logLine(logFile, `First 3 rows ${tableName}: ${JSON.stringify(sample.rows)}`);

    results.push({
      table: tableName,
      sqlite_rows: sqliteRows,
      postgres_rows: postgresRows,
      match: sqliteRows === postgresRows,
      sample_rows: sample.rows
    });
  }

  const summary = {
    generated_at_utc: new Date().toISOString(),
    total_tables_migrated: results.length,
    total_rows_migrated: totalRows,
    verification_success: results.every((r) => r.match),
    migrated_tables: results.map((r) => r.table),
    table_results: results
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');

  logLine(logFile, `Total tables migrated: ${summary.total_tables_migrated}`);
  logLine(logFile, `Total rows migrated: ${summary.total_rows_migrated}`);
  logLine(logFile, `Verification success/failure: ${summary.verification_success}`);
  logLine(logFile, `Migrated tables: ${summary.migrated_tables.join(', ')}`);

  await pg.end();
  sqliteDb.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
