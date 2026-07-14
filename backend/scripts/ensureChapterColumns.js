const { addColumnIfNotExists } = require('../api/config/database');

async function ensureChapterColumns() {
  addColumnIfNotExists('chapter', 'chapter_number', 'chapter_number INTEGER');
  addColumnIfNotExists('chapter', 'theme_key', 'theme_key TEXT');
  addColumnIfNotExists('chapter', 'status', "status TEXT DEFAULT 'draft'");
  console.log('✅ chapter columns ready');
}

module.exports = { ensureChapterColumns };
