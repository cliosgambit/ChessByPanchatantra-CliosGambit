/**
 * chess.js ships a source map pointing at node_modules/src/chess.ts, which
 * does not exist. Create a stub so webpack's source-map-loader stops warning.
 */
const fs = require('fs');
const path = require('path');

const stubDir = path.join(__dirname, '..', 'node_modules', 'src');
const stubFile = path.join(stubDir, 'chess.ts');

try {
  fs.mkdirSync(stubDir, { recursive: true });
  if (!fs.existsSync(stubFile)) {
    fs.writeFileSync(stubFile, '// Stub for chess.js source map (see scripts/ensure-chess-sourcemap.js)\nexport {};\n');
    console.log('[postinstall] Created chess.js source map stub:', stubFile);
  }
} catch (err) {
  console.warn('[postinstall] Could not create chess.js source map stub:', err.message);
}
