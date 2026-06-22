/**
 * Starts backend + frontend together. Waits for backend health, then launches Vite.
 * Restarts either process if it exits unexpectedly (Ctrl+C stops both cleanly).
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { killProcessOnPort } = require('../backend/api/utils/portKiller');

const ROOT = path.join(__dirname, '..');
const BACKEND_PORT = Number(process.env.PORT) || 10000;
const FRONTEND_PORT = 3000;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;
const RESTART_MS = 2500;
const MAX_HEALTH_ATTEMPTS = 90;
const HEALTH_INTERVAL_MS = 500;

let backendProc = null;
let frontendProc = null;
let shuttingDown = false;

function log(tag, message) {
  console.log(`[dev:${tag}] ${message}`);
}

function runScript(cwd, binRelPath, args, label) {
  const binPath = path.join(cwd, binRelPath);
  const proc = spawn(process.execPath, [binPath, ...args], {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  proc.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  proc.on('error', (err) => {
    log(label, `Failed to start: ${err.message}`);
  });

  proc.on('spawn', () => {
    log(label, `Process started (pid ${proc.pid})`);
  });

  return proc;
}

function waitForBackend() {
  return new Promise((resolve) => {
    let attempts = 0;

    const tick = () => {
      if (shuttingDown) {
        resolve(false);
        return;
      }

      attempts += 1;
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });

      function retry() {
        if (attempts >= MAX_HEALTH_ATTEMPTS) {
          resolve(false);
          return;
        }
        setTimeout(tick, HEALTH_INTERVAL_MS);
      }
    };

    tick();
  });
}

async function clearDevPorts() {
  log('dev', `Clearing ports ${BACKEND_PORT} and ${FRONTEND_PORT}...`);
  await killProcessOnPort(BACKEND_PORT);
  await killProcessOnPort(FRONTEND_PORT);
  await new Promise((r) => setTimeout(r, 800));
}

function startBackend() {
  if (shuttingDown) return;
  log('backend', 'Starting (nodemon on port ' + BACKEND_PORT + ')...');
  backendProc = runScript(
    path.join(ROOT, 'backend'),
    'node_modules/nodemon/bin/nodemon.js',
    ['server.js'],
    'backend'
  );
  backendProc.on('exit', (code, signal) => {
    backendProc = null;
    if (shuttingDown) return;
    log(
      'backend',
      `Stopped (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Restarting in ${RESTART_MS}ms...`
    );
    setTimeout(async () => {
      await killProcessOnPort(BACKEND_PORT);
      startBackend();
    }, RESTART_MS);
  });
}

function startFrontend() {
  if (shuttingDown) return;
  log('frontend', 'Starting Vite on port ' + FRONTEND_PORT + '...');
  frontendProc = runScript(
    path.join(ROOT, 'frontend'),
    'node_modules/vite/bin/vite.js',
    [],
    'frontend'
  );
  frontendProc.on('exit', (code, signal) => {
    frontendProc = null;
    if (shuttingDown) return;
    log(
      'frontend',
      `Stopped (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Restarting in ${RESTART_MS}ms...`
    );
    setTimeout(async () => {
      await killProcessOnPort(FRONTEND_PORT);
      startFrontend();
    }, RESTART_MS);
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('dev', 'Shutting down...');
  frontendProc?.kill('SIGTERM');
  backendProc?.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  log('dev', 'CLIO development servers');
  log('dev', `Backend health: ${HEALTH_URL}`);

  await clearDevPorts();
  startBackend();

  log('dev', 'Waiting for backend...');
  const ready = await waitForBackend();
  if (ready) {
    log('dev', 'Backend is ready.');
  } else if (!shuttingDown) {
    log('dev', 'Backend not ready yet — starting frontend anyway (API calls will retry once backend is up).');
  }

  if (!shuttingDown) {
    startFrontend();
  }
}

main().catch((err) => {
  console.error('[dev] Fatal error:', err);
  process.exit(1);
});
