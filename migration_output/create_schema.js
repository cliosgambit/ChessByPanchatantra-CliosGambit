const fs = require('fs');
const path = require('path');
const {
  requireSqlite,
  requirePg,
  quoteIdent,
  logLine,
  resolveSqlitePath,
  mapSqliteTypeToPostgres,
  normalizeDefaultForPg
} = require('./shared');

const sqlite3 = requireSqlite();
const { Client } = requirePg();

const outDir = __dirname;
const logFile = path.join(outDir, 'schema_log.txt');
const schemaSqlFile = path.join(outDir, 'schema_creation.sql');
const metadataFile = path.join(outDir, 'sqlite_metadata.json');

function allSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function getMetadata(db) {
  const tables = await allSqlite(
    db,
    `SELECT name, sql
     FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  );

  const result = [];
  for (const t of tables) {
    const cols = await allSqlite(db, `PRAGMA table_info(${quoteIdent(t.name)})`);
    const fks = await allSqlite(db, `PRAGMA foreign_key_list(${quoteIdent(t.name)})`);
    const idxList = await allSqlite(db, `PRAGMA index_list(${quoteIdent(t.name)})`);
    const idxFull = [];
    for (const idx of idxList) {
      const idxInfo = await allSqlite(db, `PRAGMA index_info(${quoteIdent(idx.name)})`);
      idxFull.push({ ...idx, columns: idxInfo.map((c) => c.name) });
    }
    const rowCount = await allSqlite(db, `SELECT COUNT(*) AS c FROM ${quoteIdent(t.name)}`);
    result.push({
      name: t.name,
      create_sql: t.sql,
      columns: cols,
      foreign_keys: fks,
      indexes: idxFull,
      row_count: Number(rowCount[0].c)
    });
  }
  return result;
}

function buildPgTableSql(table) {
  const pkCols = table.columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  const colDefs = table.columns.map((c) => {
    const pgType = mapSqliteTypeToPostgres(c.type, c);
    const parts = [quoteIdent(c.name), pgType];
    if (c.notnull === 1) parts.push('NOT NULL');
    const dflt = normalizeDefaultForPg(c.dflt_value);
    if (dflt !== null) parts.push(`DEFAULT ${dflt}`);
    return parts.join(' ');
  });
  if (pkCols.length) colDefs.push(`PRIMARY KEY (${pkCols.map(quoteIdent).join(', ')})`);

  const uniqueConstraints = table.indexes
    .filter((i) => i.unique === 1 && i.origin !== 'pk' && i.columns && i.columns.length > 0)
    .map((i) => `CONSTRAINT ${quoteIdent(`${table.name}_${i.name}_uniq`)} UNIQUE (${i.columns.map(quoteIdent).join(', ')})`);
  colDefs.push(...uniqueConstraints);

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n  ${colDefs.join(',\n  ')}\n);`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(logFile, '', 'utf8');
  fs.writeFileSync(schemaSqlFile, '', 'utf8');

  const sqlitePath = resolveSqlitePath();
  logLine(logFile, `Using SQLite source: ${sqlitePath}`);

  const sqliteDb = new sqlite3.Database(sqlitePath);
  const tables = await getMetadata(sqliteDb);
  fs.writeFileSync(metadataFile, JSON.stringify({ sqlitePath, tables }, null, 2), 'utf8');
  logLine(logFile, `Discovered ${tables.length} SQLite tables.`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  logLine(logFile, 'Connected to PostgreSQL.');
  await client.query('SET statement_timeout TO 0');
  await client.query('SET lock_timeout TO 0');

  const tableNames = tables.map((t) => t.name);
  const conflicts = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname='public'
       AND tablename = ANY($1::text[])
     ORDER BY tablename`,
    [tableNames]
  );

  for (const row of conflicts.rows) {
    const dropSql = `DROP TABLE IF EXISTS public.${quoteIdent(row.tablename)} CASCADE;`;
    const deleteSql = `DELETE FROM public.${quoteIdent(row.tablename)};`;
    logLine(logFile, `Dropping conflicting table: ${row.tablename}`);
    fs.appendFileSync(schemaSqlFile, `${dropSql}\n`, 'utf8');
    let handled = false;
    await client.query(
      `SELECT pg_terminate_backend(a.pid)
       FROM pg_locks l
       JOIN pg_stat_activity a ON a.pid = l.pid
       JOIN pg_class c ON c.oid = l.relation
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = $1
         AND a.pid <> pg_backend_pid()`,
      [row.tablename]
    );
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await client.query(dropSql);
        handled = true;
        break;
      } catch (e) {
        logLine(logFile, `Drop retry ${attempt} failed for ${row.tablename}: ${e.message}`);
        logLine(logFile, `Failing SQL: ${dropSql}`);
        if (attempt === 2) {
          try {
            await client.query(deleteSql);
            handled = true;
            logLine(logFile, `Fallback delete succeeded for ${row.tablename}`);
          } catch (deleteErr) {
            logLine(logFile, `Fallback delete failed for ${row.tablename}: ${deleteErr.message}`);
            logLine(logFile, `Failing SQL: ${deleteSql}`);
            throw deleteErr;
          }
        }
      }
    }
    if (!handled) throw new Error(`Failed to clear table ${row.tablename}`);
  }

  const fkSql = [];
  const indexSql = [];

  for (const table of tables) {
    const createSql = buildPgTableSql(table);
    fs.appendFileSync(schemaSqlFile, `${createSql}\n\n`, 'utf8');
    logLine(logFile, `Creating table: ${table.name}`);
    await client.query(createSql);

    const fkGroups = {};
    for (const fk of table.foreign_keys) {
      if (!fkGroups[fk.id]) fkGroups[fk.id] = [];
      fkGroups[fk.id].push(fk);
    }

    for (const id of Object.keys(fkGroups)) {
      const group = fkGroups[id].sort((a, b) => a.seq - b.seq);
      const localCols = group.map((g) => quoteIdent(g.from)).join(', ');
      const refCols = group.map((g) => quoteIdent(g.to)).join(', ');
      const constraintName = `${table.name}_fk_${id}`;
      const onUpdate = group[0].on_update && group[0].on_update !== 'NO ACTION' ? ` ON UPDATE ${group[0].on_update}` : '';
      const onDelete = group[0].on_delete && group[0].on_delete !== 'NO ACTION' ? ` ON DELETE ${group[0].on_delete}` : '';
      fkSql.push(
        `ALTER TABLE ${quoteIdent(table.name)} ADD CONSTRAINT ${quoteIdent(
          constraintName
        )} FOREIGN KEY (${localCols}) REFERENCES ${quoteIdent(group[0].table)} (${refCols})${onUpdate}${onDelete};`
      );
    }

    for (const idx of table.indexes) {
      if (!idx.columns || idx.columns.length === 0 || idx.origin === 'pk') continue;
      const sql = `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quoteIdent(
        idx.name
      )} ON ${quoteIdent(table.name)} (${idx.columns.map(quoteIdent).join(', ')});`;
      indexSql.push(sql);
    }
  }

  fs.appendFileSync(schemaSqlFile, `\n-- Foreign Keys\n${fkSql.join('\n')}\n`, 'utf8');
  fs.appendFileSync(schemaSqlFile, `\n-- Indexes\n${indexSql.join('\n')}\n`, 'utf8');

  for (const sql of fkSql) {
    try {
      await client.query(sql);
    } catch (e) {
      logLine(logFile, `FK creation warning: ${e.message}`);
    }
  }
  for (const sql of indexSql) {
    try {
      await client.query(sql);
    } catch (e) {
      logLine(logFile, `Index creation warning: ${e.message}`);
    }
  }

  await client.end();
  sqliteDb.close();
  logLine(logFile, `Schema creation SQL written: ${schemaSqlFile}`);
  logLine(logFile, `SQLite metadata written: ${metadataFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
