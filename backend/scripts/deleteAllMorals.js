/**
 * Delete ALL morals and dependent mapping/assignment rows.
 * Usage: node scripts/deleteAllMorals.js
 */
require('dotenv').config();
const db = require('../api/config/database');

async function main() {
  const before = await db.query(`SELECT COUNT(*) AS c FROM "Morals"`);
  const beforeMap = await db.query(`SELECT COUNT(*) AS c FROM story_moral_mapping`);
  let beforeAssign = { rows: [{ c: 0 }] };
  try {
    beforeAssign = await db.query(`SELECT COUNT(*) AS c FROM moral_puzzle_assignments`);
  } catch {
    /* table may not exist */
  }

  console.log('Before:');
  console.log('  Morals:', before.rows[0].c);
  console.log('  story_moral_mapping:', beforeMap.rows[0].c);
  console.log('  moral_puzzle_assignments:', beforeAssign.rows[0].c);

  // Clear dependents explicitly, then Morals (CASCADE also covers these on Supabase)
  try {
    await db.query(`DELETE FROM moral_puzzle_assignments`);
  } catch {
    /* optional table */
  }
  await db.query(`DELETE FROM story_moral_mapping`);
  await db.query(`DELETE FROM "Morals"`);

  // Clear optional FK on chess_puzzle if present
  try {
    await db.query(`UPDATE chess_puzzle SET moral_id = NULL WHERE moral_id IS NOT NULL`);
  } catch {
    /* optional */
  }

  const after = await db.query(`SELECT COUNT(*) AS c FROM "Morals"`);
  const afterMap = await db.query(`SELECT COUNT(*) AS c FROM story_moral_mapping`);
  console.log('After:');
  console.log('  Morals:', after.rows[0].c);
  console.log('  story_moral_mapping:', afterMap.rows[0].c);
  console.log('✅ All morals deleted.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to delete morals:', err.message);
  process.exit(1);
});
