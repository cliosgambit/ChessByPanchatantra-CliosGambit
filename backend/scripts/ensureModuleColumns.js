const db = require('../api/config/database');

async function ensureModuleColumns() {
  await db.query('ALTER TABLE module ADD COLUMN IF NOT EXISTS module_number INTEGER');
  await db.query('ALTER TABLE module ADD COLUMN IF NOT EXISTS theme_key TEXT');
  await db.query('ALTER TABLE module ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'active\'');

  // Clear invalid values from legacy mod-{timestamp} ids (INTEGER overflow)
  await db.query(`
    UPDATE module
    SET module_number = NULL
    WHERE module_number IS NOT NULL
      AND (
        module_number > 2147483647
        OR module_id !~* '^MOD[0-9]+$'
      )
  `);

  // Backfill only canonical MOD{n} rows — never parse timestamp-style ids
  await db.query(`
    UPDATE module
    SET module_number = CAST(SUBSTRING(module_id FROM '([0-9]+)$') AS INTEGER)
    WHERE module_number IS NULL
      AND module_id ~* '^MOD[0-9]+$'
  `);

  console.log('✅ module columns ready');
}

module.exports = { ensureModuleColumns };
