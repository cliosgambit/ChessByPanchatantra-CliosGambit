const fs = require('fs');
const path = require('path');
const {
  requireSqlite,
  requirePg,
  quoteIdent,
  resolveSqlitePath
} = require('./shared');

const sqlite3 = requireSqlite();
const { Client } = requirePg();

const outDir = __dirname;
const logFile = path.join(outDir, 'migration_logs.txt');
const verificationFile = path.join(outDir, 'verification_report.json');
const failureFile = path.join(outDir, 'failure_report.json');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, `${line}\n`, 'utf8');
}

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function pgQuery(client, sql, params = []) {
  return client.query(sql, params);
}

function convertValue(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

async function ensureTableExists(pg, sqliteDb, tableName) {
  const exists = await pgQuery(
    pg,
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1
    ) AS e`,
    [tableName]
  );
  if (exists.rows[0].e) return;

  const cols = await allSqlite(sqliteDb, `PRAGMA table_info(${quoteIdent(tableName)})`);
  const defs = cols.map((c) => {
    let t = String(c.type || '').toUpperCase();
    if (t.includes('INT')) t = 'BIGINT';
    else if (t.includes('REAL') || t.includes('DOUB') || t.includes('FLOA')) t = 'DOUBLE PRECISION';
    else if (t.includes('BLOB')) t = 'BYTEA';
    else if (t.includes('BOOL')) t = 'BOOLEAN';
    else t = 'TEXT';
    const bits = [quoteIdent(c.name), t];
    if (c.notnull === 1) bits.push('NOT NULL');
    return bits.join(' ');
  });
  const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  if (pkCols.length) defs.push(`PRIMARY KEY (${pkCols.map(quoteIdent).join(', ')})`);
  const sql = `CREATE TABLE IF NOT EXISTS public.${quoteIdent(tableName)} (\n  ${defs.join(',\n  ')}\n)`;
  await pgQuery(pg, sql);
  log(`Created missing table in PostgreSQL: ${tableName}`);
}

async function migrateTable(pg, sqliteDb, tableName, failures) {
  await ensureTableExists(pg, sqliteDb, tableName);

  const cols = await allSqlite(sqliteDb, `PRAGMA table_info(${quoteIdent(tableName)})`);
  const colNames = cols.map((c) => c.name);
  const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  const rows = await allSqlite(sqliteDb, `SELECT * FROM ${quoteIdent(tableName)}`);

  log(`Table: ${tableName}`);
  log(`Rows found in SQLite: ${rows.length}`);

  await pgQuery(pg, `TRUNCATE TABLE public.${quoteIdent(tableName)} RESTART IDENTITY CASCADE`);

  if (rows.length === 0) {
    log(`Rows inserted into Supabase: 0`);
    log(`Failed inserts: 0`);
    return { sqliteRows: 0, postgresRows: 0, ok: true, sampleRows: [] };
  }

  const batchSize = 200;
  let inserted = 0;
  let failed = 0;
  const conflictClause = pkCols.length
    ? ` ON CONFLICT (${pkCols.map(quoteIdent).join(', ')}) DO UPDATE SET ${colNames
        .filter((c) => !pkCols.includes(c))
        .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
        .join(', ')}`
    : '';

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    const valuesSql = batch
      .map((row, rowIdx) => {
        const placeholders = colNames.map((c, colIdx) => {
          params.push(convertValue(row[c]));
          return `$${rowIdx * colNames.length + colIdx + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const sql = `INSERT INTO public.${quoteIdent(tableName)} (${colNames.map(quoteIdent).join(', ')}) VALUES ${valuesSql}${conflictClause}`;
    let done = false;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await pgQuery(pg, sql, params);
        inserted += batch.length;
        done = true;
        break;
      } catch (e) {
        log(`Retry attempt ${attempt} failed on ${tableName} batch ${i}: ${e.message}`);
        if (attempt === 2) {
          for (const row of batch) {
            const singleParams = colNames.map((c) => convertValue(row[c]));
            const oneSql = `INSERT INTO public.${quoteIdent(tableName)} (${colNames
              .map(quoteIdent)
              .join(', ')}) VALUES (${colNames.map((_, idx) => `$${idx + 1}`).join(', ')})${conflictClause}`;
            try {
              await pgQuery(pg, oneSql, singleParams);
              inserted += 1;
            } catch (rowErr) {
              failed += 1;
              failures.push({
                table: tableName,
                error: rowErr.message,
                sql: oneSql,
                row
              });
              log(`Row insert failed on ${tableName}: ${rowErr.message}`);
            }
          }
          done = true;
        }
      }
    }
    if (!done) log(`Batch failed permanently for ${tableName}, start=${i}`);
  }

  const pgCnt = await pgQuery(pg, `SELECT COUNT(*)::bigint AS c FROM public.${quoteIdent(tableName)}`);
  const postgresRows = Number(pgCnt.rows[0].c);
  const sample = await pgQuery(pg, `SELECT * FROM public.${quoteIdent(tableName)} LIMIT 5`);

  log(`Rows inserted into Supabase: ${inserted}`);
  log(`Failed inserts: ${failed}`);
  log(`Row count compare for ${tableName}: sqlite=${rows.length}, postgres=${postgresRows}`);
  log(`First 5 rows ${tableName}: ${JSON.stringify(sample.rows)}`);

  return {
    sqliteRows: rows.length,
    postgresRows,
    ok: rows.length === postgresRows,
    sampleRows: sample.rows
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(logFile, '', 'utf8');

  const sqlitePath = resolveSqlitePath();
  const sqliteDb = new sqlite3.Database(sqlitePath);
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pg.connect();
  await pgQuery(pg, 'SET statement_timeout TO 0');
  await pgQuery(pg, 'SET lock_timeout TO 0');
  await pgQuery(pg, "SET session_replication_role = 'replica'");

  const tables = await allSqlite(
    sqliteDb,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  log(`All table names: ${tables.map((t) => t.name).join(', ')}`);

  const failures = [];
  const report = {
    generated_at_utc: new Date().toISOString(),
    sqlite_source: sqlitePath,
    total_tables_migrated: 0,
    total_rows_migrated: 0,
    verification_success: false,
    tables: []
  };

  for (const t of tables) {
    try {
      const r = await migrateTable(pg, sqliteDb, t.name, failures);
      report.tables.push({
        table: t.name,
        sqlite_rows: r.sqliteRows,
        postgres_rows: r.postgresRows,
        match: r.ok,
        first_5_rows: r.sampleRows
      });
      report.total_tables_migrated += 1;
      report.total_rows_migrated += r.postgresRows;
    } catch (e) {
      failures.push({ table: t.name, error: e.message });
      log(`Table failed and skipped after retries: ${t.name}`);
      log(`Exact SQL error: ${e.message}`);
    }
  }

  await pgQuery(pg, "SET session_replication_role = 'origin'");

  report.verification_success =
    failures.length === 0 && report.tables.every((t) => t.sqlite_rows === t.postgres_rows);

  fs.writeFileSync(verificationFile, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(failureFile, JSON.stringify({ failures }, null, 2), 'utf8');

  log(`Total tables migrated: ${report.total_tables_migrated}`);
  log(`Total rows migrated: ${report.total_rows_migrated}`);
  log(`Verification success/failure: ${report.verification_success}`);
  log(`Migrated tables: ${report.tables.map((t) => t.table).join(', ')}`);

  await pg.end();
  sqliteDb.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
