const path = require('path');
const { Client } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));
require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv')).config({
  path: path.join(__dirname, '..', 'backend', '.env')
});

const PUBLIC_TABLES = [
  '3000_rated_puzzles',
  'Login',
  'brilliant_moves',
  'chapter',
  'chess_puzzle',
  'module',
  'player_games',
  'players',
  'players_activity',
  'principle_position',
  'principles',
  'roles_control',
  'story',
  'story_mapping'
];

function q(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  for (const t of PUBLIC_TABLES) {
    const badName = `public.${t}`;
    const existsBad = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1
       ) AS e`,
      [badName]
    );
    if (!existsBad.rows[0].e) continue;

    const existsGood = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=$1
       ) AS e`,
      [t]
    );
    if (existsGood.rows[0].e) {
      await client.query(`DROP TABLE IF EXISTS public.${q(t)} CASCADE`);
      console.log(`Dropped existing target table: ${t}`);
    }

    const sql = `ALTER TABLE public.${q(badName)} RENAME TO ${q(t)}`;
    await client.query(sql);
    console.log(`Renamed ${badName} -> ${t}`);
  }

  await client.end();
  console.log('Table rename fix completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
