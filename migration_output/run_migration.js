const path = require('path');
const { execFileSync } = require('child_process');

function run(script) {
  const p = path.join(__dirname, script);
  console.log(`\n=== Running ${script} ===`);
  execFileSync(process.execPath, [p], { stdio: 'inherit' });
}

run('create_schema.js');
run('import_data.js');
run('verify_migration.js');
