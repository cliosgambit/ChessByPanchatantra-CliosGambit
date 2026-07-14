const db = require('../api/config/database');
const { addColumnIfNotExists } = require('../api/config/database');

async function ensureModuleColumns() {
  addColumnIfNotExists('module', 'module_number', 'module_number INTEGER');
  addColumnIfNotExists('module', 'theme_key', 'theme_key TEXT');
  addColumnIfNotExists('module', 'status', "status TEXT DEFAULT 'active'");

  const { rows } = await db.query(
    'SELECT module_id, module_number FROM module WHERE module_id IS NOT NULL'
  );

  for (const row of rows) {
    const id = String(row.module_id || '');
    const canonical = /^MOD[0-9]+$/i.test(id);
    let nextNumber = row.module_number;

    if (nextNumber != null && (nextNumber > 2147483647 || !canonical)) {
      nextNumber = null;
    }
    if (nextNumber == null && canonical) {
      const m = id.match(/([0-9]+)$/);
      nextNumber = m ? Number(m[1]) : null;
    }

    if (nextNumber !== row.module_number) {
      await db.query('UPDATE module SET module_number = $1 WHERE module_id = $2', [
        nextNumber,
        row.module_id,
      ]);
    }
  }

  console.log('✅ module columns ready');
}

module.exports = { ensureModuleColumns };
