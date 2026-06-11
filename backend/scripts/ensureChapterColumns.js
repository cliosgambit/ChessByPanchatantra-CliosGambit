const db = require('../api/config/database');

async function ensureChapterColumns() {
  await db.query('ALTER TABLE chapter ADD COLUMN IF NOT EXISTS chapter_number INTEGER');
  await db.query('ALTER TABLE chapter ADD COLUMN IF NOT EXISTS theme_key TEXT');
  await db.query("ALTER TABLE chapter ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'");

  await db.query(`
    WITH ranked AS (
      SELECT chapter_id,
        ROW_NUMBER() OVER (PARTITION BY module_id ORDER BY chapter_id) AS rn
      FROM chapter
      WHERE chapter_number IS NULL
        AND module_id IS NOT NULL
    )
    UPDATE chapter c
    SET chapter_number = ranked.rn
    FROM ranked
    WHERE c.chapter_id = ranked.chapter_id
  `);

  console.log('✅ chapter columns ready');
}

module.exports = { ensureChapterColumns };
