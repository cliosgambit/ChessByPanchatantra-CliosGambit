const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));
require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'backend', '.env')
});

const OUTPUT_DIR = __dirname;
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'supabase_export.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'export_log.txt');

function qIdent(input) {
  return `"${String(input).replace(/"/g, '""')}"`;
}

function stableStringify(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

async function exportDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in backend/.env');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  const log = (line) => {
    const full = `[${new Date().toISOString()}] ${line}`;
    console.log(full);
    fs.appendFileSync(LOG_FILE, `${full}\n`, 'utf8');
  };

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  log('Connected to Supabase PostgreSQL.');

  const tableRows = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema = 'public'
    ORDER BY table_schema, table_name
  `);

  const exportData = {
    exported_at_utc: new Date().toISOString(),
    source: 'supabase_postgresql',
    tables: []
  };

  log(`Discovered ${tableRows.rowCount} tables in public schema.`);

  for (const t of tableRows.rows) {
    const tableSchema = t.table_schema;
    const tableName = t.table_name;
    const fqName = `${tableSchema}.${tableName}`;
    log(`Exporting table: ${fqName}`);

    const columns = await client.query(
      `
      SELECT
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale
      FROM information_schema.columns c
      WHERE c.table_schema = $1
        AND c.table_name = $2
      ORDER BY c.ordinal_position
      `,
      [tableSchema, tableName]
    );

    const pk = await client.query(
      `
      SELECT kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      `,
      [tableSchema, tableName]
    );

    const fks = await client.query(
      `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
      [tableSchema, tableName]
    );

    const uniqueConstraints = await client.query(
      `
      SELECT
        tc.constraint_name,
        array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      GROUP BY tc.constraint_name
      ORDER BY tc.constraint_name
      `,
      [tableSchema, tableName]
    );

    const checks = await client.query(
      `
      SELECT con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE con.contype = 'c'
        AND nsp.nspname = $1
        AND rel.relname = $2
      ORDER BY con.conname
      `,
      [tableSchema, tableName]
    );

    const indexes = await client.query(
      `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = $2
      ORDER BY indexname
      `,
      [tableSchema, tableName]
    );

    const countResult = await client.query(`SELECT COUNT(*)::bigint AS total FROM ${qIdent(tableSchema)}.${qIdent(tableName)}`);
    const totalRows = Number(countResult.rows[0].total);
    const dataRows = await client.query(`SELECT * FROM ${qIdent(tableSchema)}.${qIdent(tableName)}`);
    log(`Rows exported from ${fqName}: ${dataRows.rowCount}/${totalRows}`);

    exportData.tables.push({
      schema: tableSchema,
      name: tableName,
      columns: columns.rows,
      primary_key: pk.rows.map((r) => r.column_name),
      foreign_keys: fks.rows,
      unique_constraints: uniqueConstraints.rows,
      check_constraints: checks.rows,
      indexes: indexes.rows,
      source_row_count: totalRows,
      rows: dataRows.rows
    });
  }

  fs.writeFileSync(OUTPUT_FILE, stableStringify(exportData), 'utf8');
  log(`Export JSON written: ${OUTPUT_FILE}`);

  await client.end();
  log('Export completed.');
}

exportDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
