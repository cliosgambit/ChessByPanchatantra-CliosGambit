/**
 * Create used CLIO tables on Supabase, then copy data from local SQLite.
 *
 * Schema (CREATE TABLE):
 *   - Preferred: DATABASE_URL in backend/.env (Postgres URI)
 *   - Or run database/supabase_used_schema.sql in Supabase SQL Editor, then --data-only
 *
 * Data:
 *   - DATABASE_URL → fast pg inserts
 *   - Else SUPABASE_URL + SUPABASE_SECRET_KEY → supabase-js upserts
 *
 * Skips unused: roles_control, chess_puzzle, chess_puzzle_poll_response, legacy curriculum.
 *
 * Usage:
 *   node scripts/migrateLocalToSupabase.js
 *   node scripts/migrateLocalToSupabase.js --data-only
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const localDb = require('../api/config/database');
const { createAdminClient, resolveEnv } = require('@supabase/server/core');

const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'supabase_used_schema.sql');
const BATCH_PG = 500;
const BATCH_API = 200;
const dataOnly = process.argv.includes('--data-only');

const TABLES = [
  { name: 'Login', sql: '"Login"', api: 'Login', pk: 'id' },
  { name: 'players', sql: 'players', api: 'players', pk: 'Chess_com_ID' },
  { name: 'Students', sql: '"Students"', api: 'Students', pk: 'id' },
  { name: 'Morals', sql: '"Morals"', api: 'Morals', pk: 'id' },
  { name: 'Stories', sql: '"Stories"', api: 'Stories', pk: 'id' },
  { name: 'Story_Images', sql: '"Story_Images"', api: 'Story_Images', pk: 'id' },
  { name: 'story_moral_mapping', sql: 'story_moral_mapping', api: 'story_moral_mapping', pk: null },
  { name: 'modules', sql: 'modules', api: 'modules', pk: 'id' },
  { name: 'module_stories', sql: 'module_stories', api: 'module_stories', pk: 'id' },
  { name: '3000_rated_puzzles', sql: '"3000_rated_puzzles"', api: '3000_rated_puzzles', pk: 'id' },
  { name: 'lichess_puzzles', sql: 'lichess_puzzles', api: 'lichess_puzzles', pk: 'id' },
  { name: 'chesscom_random_puzzles', sql: 'chesscom_random_puzzles', api: 'chesscom_random_puzzles', pk: 'id' },
  { name: 'moral_puzzle_assignments', sql: 'moral_puzzle_assignments', api: 'moral_puzzle_assignments', pk: 'id' },
  { name: 'chess_com_profiles', sql: 'chess_com_profiles', api: 'chess_com_profiles', pk: 'chess_com_id' },
  { name: 'chess_com_archives', sql: 'chess_com_archives', api: 'chess_com_archives', pk: 'id' },
  { name: 'chess_com_games', sql: 'chess_com_games', api: 'chess_com_games', pk: 'id' },
  { name: 'chess_com_moves', sql: 'chess_com_moves', api: 'chess_com_moves', pk: 'id' },
  { name: 'chess_com_clubs', sql: 'chess_com_clubs', api: 'chess_com_clubs', pk: 'id' },
  { name: 'chess_com_sync_raw', sql: 'chess_com_sync_raw', api: 'chess_com_sync_raw', pk: 'id' },
  { name: 'chess_com_brilliance_runs', sql: 'chess_com_brilliance_runs', api: 'chess_com_brilliance_runs', pk: 'chess_com_uuid' },
  { name: 'chess_com_brilliance_stage0', sql: 'chess_com_brilliance_stage0', api: 'chess_com_brilliance_stage0', pk: 'id' },
  { name: 'chess_com_brilliance_stage1', sql: 'chess_com_brilliance_stage1', api: 'chess_com_brilliance_stage1', pk: 'id' },
  { name: 'chess_com_brilliance_stage2', sql: 'chess_com_brilliance_stage2', api: 'chess_com_brilliance_stage2', pk: 'id' },
  { name: 'chess_com_brilliance_stage3', sql: 'chess_com_brilliance_stage3', api: 'chess_com_brilliance_stage3', pk: 'id' },
  { name: 'chess_com_brilliance_stage4', sql: 'chess_com_brilliance_stage4', api: 'chess_com_brilliance_stage4', pk: 'id' },
  { name: 'brilliant_move_puzzles', sql: 'brilliant_move_puzzles', api: 'brilliant_move_puzzles', pk: 'id' },
];

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function cleanRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) out[k] = null;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

async function fetchLocalRows(sqlName) {
  const { rows } = await localDb.query(`SELECT * FROM ${sqlName}`);
  return rows.map(cleanRow);
}

async function createSchemaWithPg(pool) {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  console.log('Creating tables via DATABASE_URL ...');
  await pool.query(sql);
  console.log('✅ Schema applied');
}

async function tableExistsViaApi(supabase, apiName) {
  const { error } = await supabase.from(apiName).select('*', { head: true, count: 'exact' }).limit(1);
  if (!error) return true;
  const msg = String(error.message || error.details || '');
  if (/does not exist|schema cache|Could not find the table/i.test(msg)) return false;
  // other errors (empty, RLS) still mean table likely exists
  return !/relation .* does not exist/i.test(msg);
}

async function ensureSchema(pool, supabase) {
  if (dataOnly) {
    console.log('Skipping schema (--data-only)');
    return;
  }
  if (pool) {
    await createSchemaWithPg(pool);
    return;
  }

  // No DATABASE_URL — check if tables already created in SQL Editor
  const probe = await tableExistsViaApi(supabase, 'Stories');
  if (probe) {
    console.log('✅ Schema already present on Supabase (Stories found)');
    return;
  }

  console.error(`
Cannot CREATE TABLE with API keys alone.

Option A (recommended): add DATABASE_URL to backend/.env
  Dashboard → Project Settings → Database → Connection string → URI
  Then: node scripts/migrateLocalToSupabase.js

Option B: open Supabase SQL Editor, paste & run:
  backend/database/supabase_used_schema.sql
  Then: node scripts/migrateLocalToSupabase.js --data-only
`);
  process.exit(1);
}

async function migrateWithPg(pool) {
  const summary = [];

  for (const table of TABLES) {
    const localRows = await fetchLocalRows(table.sql);
    console.log(`→ ${table.name}: ${localRows.length} local rows`);

    await pool.query(`TRUNCATE TABLE ${table.sql} RESTART IDENTITY CASCADE`).catch(async () => {
      await pool.query(`DELETE FROM ${table.sql}`);
    });

    if (!localRows.length) {
      summary.push({ name: table.name, local: 0, remote: 0 });
      console.log(`   ✅ ${table.name}: remote=0`);
      continue;
    }

    const columns = Object.keys(localRows[0]);
    const colSql = columns.map(quoteIdent).join(', ');
    let inserted = 0;

    for (let i = 0; i < localRows.length; i += BATCH_PG) {
      const chunk = localRows.slice(i, i + BATCH_PG);
      const values = [];
      const placeholders = chunk.map((row, rIdx) => {
        const cells = columns.map((col, cIdx) => {
          values.push(row[col] ?? null);
          return `$${rIdx * columns.length + cIdx + 1}`;
        });
        return `(${cells.join(', ')})`;
      });
      await pool.query(
        `INSERT INTO ${table.sql} (${colSql}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
        values
      );
      inserted += chunk.length;
      if (localRows.length > BATCH_PG && i % (BATCH_PG * 20) === 0) {
        process.stdout.write(`   ${Math.min(i + BATCH_PG, localRows.length)}/${localRows.length}\r`);
      }
    }

    if (columns.includes('id')) {
      try {
        await pool.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'),
             COALESCE((SELECT MAX(id) FROM ${table.sql}), 1), true)`,
          [table.sql]
        );
      } catch {
        /* no serial */
      }
    }

    const remote = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table.sql}`);
    console.log(`   ✅ ${table.name}: remote=${remote.rows[0].c} (inserted≈${inserted})`);
    summary.push({ name: table.name, local: localRows.length, remote: remote.rows[0].c });
  }
  return summary;
}

function clearFilterColumn(table) {
  if (table.pk) return table.pk;
  if (table.name === 'story_moral_mapping') return 'story_id';
  return 'id';
}

async function clearViaApi(supabase, table) {
  const col = clearFilterColumn(table);
  const { error } = await supabase.from(table.api).delete().not(col, 'is', null);
  if (error) throw new Error(`clear ${table.name}: ${error.message}`);
}

async function countViaApi(supabase, apiName) {
  const { count, error } = await supabase
    .from(apiName)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function migrateWithApi(supabase) {
  const summary = [];

  console.log('Clearing remote tables (reverse FK order)...');
  for (const table of [...TABLES].reverse()) {
    try {
      await clearViaApi(supabase, table);
    } catch (err) {
      console.warn(`   ${err.message || err}`);
    }
  }

  for (const table of TABLES) {
    const localRows = await fetchLocalRows(table.sql);
    console.log(`→ ${table.name}: ${localRows.length} local rows`);

    if (!localRows.length) {
      const remote = await countViaApi(supabase, table.api).catch(() => 0);
      summary.push({ name: table.name, local: 0, remote });
      console.log(`   ✅ ${table.name}: remote=${remote}`);
      continue;
    }

    for (let i = 0; i < localRows.length; i += BATCH_API) {
      const chunk = localRows.slice(i, i + BATCH_API);
      let error = null;
      if (table.pk) {
        ({ error } = await supabase.from(table.api).upsert(chunk, { onConflict: table.pk }));
      } else {
        ({ error } = await supabase.from(table.api).upsert(chunk, {
          onConflict: 'story_id,moral_id',
        }));
      }
      if (error) {
        const { error: e2 } = await supabase.from(table.api).insert(chunk);
        if (e2) throw new Error(`${table.name}: ${e2.message}`);
      }
      if (localRows.length > BATCH_API && i % (BATCH_API * 25) === 0) {
        process.stdout.write(`   ${Math.min(i + BATCH_API, localRows.length)}/${localRows.length}\r`);
      }
    }

    const remote = await countViaApi(supabase, table.api);
    console.log(`   ✅ ${table.name}: remote=${remote}`);
    summary.push({ name: table.name, local: localRows.length, remote });
  }
  return summary;
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  let pool = null;

  if (connectionString) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
    const ping = await pool.query('SELECT current_database() AS db, now() AS ts');
    console.log('Connected via DATABASE_URL:', ping.rows[0]);
  } else {
    console.log('No DATABASE_URL — will use Supabase API for data (schema must exist or be creatable via pg).');
  }

  const { data: env, error: envError } = resolveEnv();
  if (envError) throw envError;
  const supabase = createAdminClient();
  console.log('Supabase API client ready:', env.url);

  await ensureSchema(pool, supabase);

  const summary = pool ? await migrateWithPg(pool) : await migrateWithApi(supabase);

  console.log('\n=== Migration summary ===');
  let bad = 0;
  for (const row of summary) {
    const ok = row.local === row.remote;
    if (!ok) bad += 1;
    console.log(`${(ok ? 'OK' : 'MISMATCH').padEnd(10)} ${row.name}: local=${row.local} remote=${row.remote}`);
  }

  if (bad) {
    console.error(`\n❌ ${bad} table(s) mismatched.`);
    process.exit(1);
  }
  console.log('\n✅ All used tables migrated to Supabase.');
  console.log('Skipped (unused): roles_control, chess_puzzle, chess_puzzle_poll_response, legacy curriculum.');

  if (pool) await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Migration failed:', err.message || err);
  process.exit(1);
});
