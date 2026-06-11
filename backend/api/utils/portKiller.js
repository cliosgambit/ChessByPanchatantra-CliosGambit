const { exec } = require('child_process');

/**
 * Attempts to kill any process currently running on a specific port.
 * This is primarily for Windows development environments to prevent EADDRINUSE errors.
 * Resolves immediately on non-Windows platforms.
 * @param {number} port The port number to clear.
 * @returns {Promise<void>} A promise that resolves when the command is complete.
 */
const killProcessOnPort = (port) => {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      // Not a Windows platform, so just resolve and continue.
      return resolve();
    }

    // Single %a — required when invoking via exec (%% is only for .bat files)
    const command = `cmd /c "for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /PID %a /F 2>nul"`;
    
    exec(command, (err, stdout, stderr) => {
      // Don't treat "not found" or "no tasks" as a fatal error.
      // These just mean the port was already free.
      if (err && !stderr.toLowerCase().includes('not found') && !stderr.toLowerCase().includes('no tasks')) {
        console.warn(`Attempted to kill process on port ${port}. Stderr: ${stderr.trim()}`);
        // We still resolve because the server can likely start anyway.
        // For a critical failure, you might reject here.
        return resolve();
      }

      if (stdout.trim() || (stderr && stderr.toLowerCase().includes("successfully terminated"))) {
        console.log(`✅ Previous process on port ${port} cleared successfully.`);
      } else {
        console.log(`- No existing process found on port ${port}.`);
      }
      
      resolve();
    });
  });
};

module.exports = { killProcessOnPort };