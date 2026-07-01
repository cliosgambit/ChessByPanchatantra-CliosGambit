const db = require('../api/config/database');

async function ensureStoryColumns() {
  await db.query('ALTER TABLE story ADD COLUMN IF NOT EXISTS thumbnail_url TEXT');
  await db.query('ALTER TABLE story ADD COLUMN IF NOT EXISTS theme_key TEXT');
  await db.query('ALTER TABLE story ADD COLUMN IF NOT EXISTS story_type TEXT');
  await db.query('ALTER TABLE story ADD COLUMN IF NOT EXISTS story_number INTEGER');
  console.log('✅ story columns ready');
}

module.exports = { ensureStoryColumns };
