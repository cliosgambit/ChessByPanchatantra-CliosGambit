require('dotenv').config(); // <-- IMPORTANT: Load .env variables at the very top
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process'); // used only when OPEN_BROWSER=true
const db = require('./api/config/database');
const { killProcessOnPort } = require('./api/utils/portKiller');

// --- Import Route Handlers ---
const courseRoutes = require('./api/routes/courseRoutes');
const authRoutes = require('./routes/authRoutes');
const loginAdminRoutes = require('./routes/loginAdminRoutes');
const dataRoutes = require('./routes/dataRoutes');
const { migrateUsersToLogin } = require('./scripts/migrateUsersToLogin');
const { ensureChessPuzzleColumns } = require('./scripts/ensureChessPuzzleColumns');
const { ensureChessPuzzlePollTable } = require('./scripts/ensureChessPuzzlePollTable');
const { ensureModuleColumns } = require('./scripts/ensureModuleColumns');
const { ensureChapterColumns } = require('./scripts/ensureChapterColumns');
const { ensureStoryColumns } = require('./scripts/ensureStoryColumns');
const accessRoutes = require('./api/routes/accessRoutes'); // <-- NEW: Import access routes
const trackerRoutes = require('./api/routes/trackerRoutes');
const automationRoutes = require('./api/routes/automationRoutes');
const chessComRoutes = require('./api/routes/chessComRoutes');
const stockfishRoutes = require('./api/routes/stockfishRoutes');
const { mountBrillianceRoutes } = require('./brilliance');
const { ensureChessComSchema } = require('./scripts/ensureChessComSchema');
const { ensureChessComMovesTable } = require('./scripts/ensureChessComMovesTable');
const { ensurePlayerChessComColumns } = require('./scripts/ensurePlayerChessComColumns');
const { ensureBrilliantMovePuzzlesTable } = require('./scripts/ensureBrilliantMovePuzzlesTable');
const {
  ensureChessComBrillianceTables,
  migrateExistingBrillianceToSupabase,
} = require('./scripts/ensureChessComBrillianceTables');
const { ensureChessComSyncRawTable } = require('./scripts/ensureChessComSyncRawTable');
const { autoCompleteActivityTracker } = require('./api/controllers/automationController');


// --- Configuration ---
const PORT = process.env.PORT || 10000;
const app = express();
const frontendBuildPath = path.join(__dirname, '../frontend/build');

// --- Core Middleware ---
app.use(cors());
app.use(express.json({limit: '5mb'}));
app.use(express.static(frontendBuildPath));

// --- Health check (DB + API) ---
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'disconnected', error: err.message });
  }
});

// --- API Routes ---
app.use('/api', authRoutes);
app.use('/api', loginAdminRoutes);
app.use('/api', dataRoutes);
app.use('/api', accessRoutes); // <-- NEW: Add access control routes
app.use('/api', courseRoutes); // Your existing course routes
app.use(trackerRoutes);
app.use(automationRoutes);
app.use('/api', chessComRoutes);
app.use('/api', stockfishRoutes);
mountBrillianceRoutes(app);


// --- Frontend Fallback Route ---
app.get('*', (req, res) => {
  const indexPath = path.join(frontendBuildPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('<h1>Frontend Not Found</h1><p>Please run <strong>npm run build</strong> in the /frontend directory.</p>');
  }
});

// --- Server Startup Logic ---
const startServerAndServices = async () => {
  try {
    console.log('Attempting to connect to the database...');
    await db.query('SELECT NOW()');
    console.log('✅ Database connection successful.');
    await migrateUsersToLogin();
    await ensureChessPuzzleColumns();
    await ensureChessPuzzlePollTable();
    await ensureModuleColumns();
    await ensureChapterColumns();
    await ensureStoryColumns();
    await ensureChessComSchema();
    await ensureChessComMovesTable();
    await ensurePlayerChessComColumns();
    await ensureBrilliantMovePuzzlesTable();
    await ensureChessComBrillianceTables();
    await ensureChessComSyncRawTable();

    // console.log('Triggering initial data orchestration cycle...');
    // runDataUpdateCycle();

    // const updateIntervalHours = 4;
    // setInterval(runDataUpdateCycle, updateIntervalHours * 60 * 60 * 1000);
    // console.log(`✅ Data orchestration service scheduled every ${updateIntervalHours} hours.`);

  } catch (error) {
    console.error('❌ FATAL: Failed to connect to the database or start services:', error.message);
    process.exit(1);
  }

  const listen = () =>
    new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => resolve(server));
      server.on('error', reject);
    });

  try {
    await listen();
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${PORT} in use — clearing and retrying...`);
      await killProcessOnPort(PORT);
      await new Promise((r) => setTimeout(r, 1000));
      try {
        await listen();
      } catch (retryErr) {
        console.error(`❌ Could not bind to port ${PORT}:`, retryErr.message);
        process.exit(1);
      }
    } else {
      console.error('❌ Server failed to start:', err.message);
      process.exit(1);
    }
  }

  console.log(`🚀 Server is live at http://localhost:${PORT}`);

  // One-time SQLite → Supabase backfill; can take a long time — must not block listen().
  migrateExistingBrillianceToSupabase().catch((err) => {
    console.error('❌ Brilliance SQLite → Supabase migration failed:', err.message);
  });

  // Never auto-open browser tabs — nodemon restarts were spawning a new tab on every reload.
  // Use frontend dev server (npm start in /frontend → :3000) for daily development.
  // Set OPEN_BROWSER=true only if you explicitly want one tab opened on backend start.
  if (process.env.OPEN_BROWSER === 'true') {
    const openCommand = process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCommand} http://localhost:${PORT}`);
  }

  // Call automation controller immediately on startup
  console.log('⏰ Running autoCompleteActivityTracker (startup)...');
  autoCompleteActivityTracker(
    { body: {} },
    {
      json: (data) => console.log('Automation result:', data),
      status: (code) => ({ json: (data) => console.log('Automation error:', code, data) })
    }
  );

  // Then schedule every 10 minutes
  setInterval(() => {
    console.log('⏰ Running autoCompleteActivityTracker...');
    autoCompleteActivityTracker(
      { body: {} },
      {
        json: (data) => console.log('Automation result:', data),
        status: (code) => ({ json: (data) => console.log('Automation error:', code, data) })
      }
    );
  }, 10 * 60 * 1000);
};

// --- Process error handlers (nodemon restarts on exit) ---
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// --- Main Execution ---
killProcessOnPort(PORT).then(startServerAndServices).catch(err => {
    console.error('❌ A fatal error occurred during the startup sequence:', err);
    process.exit(1);
});