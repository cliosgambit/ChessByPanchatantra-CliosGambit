import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_TARGET = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:10000';

const BACKEND_UNAVAILABLE_BODY = JSON.stringify({
  error:
    'Backend server unavailable. From the project root run: npm run dev — or: cd backend && npm start (port 10000).',
  code: 'BACKEND_UNAVAILABLE',
});

function backendProxyErrorHandler(err, req, res) {
  const path = req?.url || '';
  console.warn(`[vite] Backend unavailable for ${path}: ${err?.message || err}`);
  if (res.headersSent || !res.writeHead) return;
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(BACKEND_UNAVAILABLE_BODY);
}

function backendHealthCheckPlugin() {
  return {
    name: 'backend-health-check',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        fetch(`${BACKEND_TARGET}/api/health`)
          .then((res) => {
            if (res.ok) {
              console.log(`[vite] Backend reachable at ${BACKEND_TARGET}`);
              return;
            }
            console.warn(
              `[vite] Backend returned ${res.status} at ${BACKEND_TARGET}. Start it: cd backend && npm start`
            );
          })
          .catch(() => {
            console.warn(
              `[vite] Backend not running at ${BACKEND_TARGET}. API calls will fail until you start it (npm run dev from project root).`
            );
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), backendHealthCheckPlugin()],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', backendProxyErrorHandler);
        },
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
