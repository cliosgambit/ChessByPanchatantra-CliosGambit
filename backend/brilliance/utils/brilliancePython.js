const path = require('path');
const { execFile } = require('child_process');

const STOCKFISH_EXE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'stockfish',
  'stockfish-windows-x86-64-avx2.exe'
);

function runPythonScript(scriptPath, inputJson) {
  const run = (cmd, cmdArgs) =>
    new Promise((resolve, reject) => {
      execFile(
        cmd,
        cmdArgs,
        { timeout: 600000, maxBuffer: 50 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }
          try {
            resolve(JSON.parse(String(stdout || '').trim() || '{}'));
          } catch {
            reject(new Error(`Invalid JSON from ${path.basename(scriptPath)}`));
          }
        }
      );
    });

  const args = [scriptPath, inputJson];
  if (process.platform === 'win32') {
    return run('py', ['-3', ...args]).catch(() => run('python', args)).catch(() => run('python3', args));
  }
  return run('python3', args).catch(() => run('python', args)).catch(() => run('py', ['-3', ...args]));
}

module.exports = {
  STOCKFISH_EXE,
  runPythonScript,
};
