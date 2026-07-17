/**
 * Reset is_used flags that don't match moral_puzzle_assignments.
 * Also restore GM moral_id from an active assignment when missing.
 */
const db = require('../api/config/database');

async function repairPuzzleUsedFlags() {
  // Clear orphaned used flags (no assignment)
  const cleared = await db.query(`
    UPDATE "3000_rated_puzzles" p
    SET is_used = 0, moral_id = NULL
    WHERE COALESCE(p.is_used, 0) = 1
      AND NOT EXISTS (
        SELECT 1 FROM moral_puzzle_assignments a
        WHERE a.source = 'gm' AND a.puzzle_id = p.id
      )
    RETURNING id
  `);

  const lichessCleared = await db.query(`
    UPDATE lichess_puzzles p
    SET is_used = 0
    WHERE COALESCE(p.is_used, 0) = 1
      AND NOT EXISTS (
        SELECT 1 FROM moral_puzzle_assignments a
        WHERE a.source = 'lichess' AND a.puzzle_id = p.id
      )
    RETURNING id
  `);

  const chesscomCleared = await db.query(`
    UPDATE chesscom_random_puzzles p
    SET is_used = 0
    WHERE COALESCE(p.is_used, 0) = 1
      AND NOT EXISTS (
        SELECT 1 FROM moral_puzzle_assignments a
        WHERE a.source = 'chesscom' AND a.puzzle_id = p.id
      )
    RETURNING id
  `);

  // Sync GM moral_id from active assignments
  const synced = await db.query(`
    UPDATE "3000_rated_puzzles" p
    SET
      is_used = 1,
      moral_id = a.moral_id
    FROM (
      SELECT DISTINCT ON (puzzle_id) puzzle_id, moral_id
      FROM moral_puzzle_assignments
      WHERE source = 'gm'
      ORDER BY puzzle_id, id DESC
    ) a
    WHERE p.id = a.puzzle_id
      AND (COALESCE(p.is_used, 0) = 0 OR p.moral_id IS DISTINCT FROM a.moral_id)
    RETURNING p.id
  `);

  return {
    gm_cleared: cleared.rows.map((r) => r.id),
    lichess_cleared: lichessCleared.rows.map((r) => r.id),
    chesscom_cleared: chesscomCleared.rows.map((r) => r.id),
    gm_synced: synced.rows.map((r) => r.id),
  };
}

async function main() {
  const result = await repairPuzzleUsedFlags();
  console.log('repair_result', result);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { repairPuzzleUsedFlags };
