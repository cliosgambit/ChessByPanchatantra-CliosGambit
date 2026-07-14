const { addColumnIfNotExists } = require('../api/config/database');

async function ensureStoryColumns() {
  addColumnIfNotExists('story', 'thumbnail_url', 'thumbnail_url TEXT');
  addColumnIfNotExists('story', 'theme_key', 'theme_key TEXT');
  addColumnIfNotExists('story', 'story_type', 'story_type TEXT');
  addColumnIfNotExists('story', 'story_number', 'story_number INTEGER');
  console.log('✅ story columns ready');
}

module.exports = { ensureStoryColumns };
