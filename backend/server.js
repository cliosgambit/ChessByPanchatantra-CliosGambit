require('dotenv').config(); // <-- IMPORTANT: Load .env variables at the very top
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process'); // used only when OPEN_BROWSER=true
const db = require('./api/config/database');
const {
  connectSupabase,
  getSupabaseStatus,
} = require('./api/config/supabase');
const { killProcessOnPort } = require('./api/utils/portKiller');

// --- Import Route Handlers ---
const courseRoutes = require('./api/routes/courseRoutes');
const authRoutes = require('./routes/authRoutes');
const loginAdminRoutes = require('./routes/loginAdminRoutes');
const dataRoutes = require('./routes/dataRoutes');
const libraryRoutes = require('./routes/libraryRoutes');
const puzzleRoutes = require('./routes/puzzleRoutes');
const studentRoutes = require('./routes/studentRoutes');
const { migrateUsersToLogin } = require('./scripts/migrateUsersToLogin');
const { ensureChessPuzzleColumns } = require('./scripts/ensureChessPuzzleColumns');
const { ensureChessPuzzlePollTable } = require('./scripts/ensureChessPuzzlePollTable');
const { ensureLibraryTables } = require('./scripts/ensureLibraryTables');
const {
  ensure3000RatedPuzzlesTable,
} = require('./scripts/ensure3000RatedPuzzlesTable');
const {
  ensureLichessPuzzlesTable,
} = require('./scripts/ensureLichessPuzzlesTable');
const {
  ensureMoralPuzzleTables,
} = require('./scripts/ensureMoralPuzzleTables');
const { repairPuzzleUsedFlags } = require('./scripts/repairPuzzleUsedFlags');
const { ensureStudentsTable } = require('./scripts/ensureStudentsTable');
const { ensureBatchesTables } = require('./scripts/ensureBatchesTables');
const { ensureModulesTables } = require('./scripts/ensureModulesTables');
const moduleRoutes = require('./routes/moduleRoutes');
const batchRoutes = require('./routes/batchRoutes');
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
} = require('./scripts/ensureChessComBrillianceTables');
const { ensureChessComSyncRawTable } = require('./scripts/ensureChessComSyncRawTable');
const { autoCompleteActivityTracker } = require('./api/controllers/automationController');


// --- Configuration ---
const PORT = process.env.PORT || 10000;
const app = express();
const frontendBuildPath = path.join(__dirname, '../frontend/build');
const storyImagesPath = path.join(__dirname, '../frontend/public/story_images');
const { ensureStoryImagesDir } = require('./api/utils/storyImageUpload');
ensureStoryImagesDir();

// --- Core Middleware ---
app.use(cors());
app.use(express.json({limit: '5mb'}));
app.use('/story_images', express.static(storyImagesPath));
app.use(express.static(frontendBuildPath));

// --- Health check (app DB + Supabase API) ---
app.get('/api/health', async (req, res) => {
  const supabase = getSupabaseStatus();
  const driver = db.isPostgres ? 'supabase-postgres' : 'sqlite';
  try {
    await db.query('SELECT 1');
    const ok = db.isPostgres ? true : supabase.configured ? supabase.connected : true;
    res.status(ok ? 200 : 503).json({
      ok,
      database: 'connected',
      driver,
      supabase: {
        configured: supabase.configured,
        connected: supabase.connected || db.isPostgres,
        url: supabase.url,
        error: supabase.error,
      },
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      database: 'disconnected',
      driver,
      supabase,
      error: err.message,
    });
  }
});

// --- API Routes ---
app.use('/api', authRoutes);
app.use('/api', loginAdminRoutes);
app.use('/api', dataRoutes);
app.use('/api', libraryRoutes);
app.use('/api', puzzleRoutes);
app.use('/api', studentRoutes);
app.use('/api', batchRoutes);
app.use('/api', moduleRoutes);
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
    if (db.isPostgres) {
      console.log('Attempting to connect to Supabase Postgres (DATABASE_URL)...');
      await db.query("SELECT (now()::text) AS now");
      console.log(`✅ App database: Supabase Postgres (${db.dbPath}).`);
      const supabaseStatus = await connectSupabase();
      if (supabaseStatus.connected) {
        console.log(`✅ Supabase API client ready (${supabaseStatus.url}).`);
      } else {
        console.warn(`⚠️ Supabase API client: ${supabaseStatus.error || 'not connected'}`);
      }
    } else {
      console.log('Attempting to connect to local SQLite database...');
      await db.query("SELECT datetime('now')");
      console.log(`✅ Database connection successful (${db.dbPath}).`);
      console.log('Attempting to connect to Supabase...');
      const supabaseStatus = await connectSupabase();
      if (!supabaseStatus.configured) {
        console.warn(`⚠️ Supabase not configured: ${supabaseStatus.error}`);
      } else if (!supabaseStatus.connected) {
        console.error(`❌ Supabase connection failed: ${supabaseStatus.error}`);
        throw new Error(`Supabase connection failed: ${supabaseStatus.error}`);
      } else {
        console.log(`✅ Supabase connected (${supabaseStatus.url}).`);
      }
    }

    await migrateUsersToLogin();
    await ensureLibraryTables();
    ensure3000RatedPuzzlesTable();
    ensureLichessPuzzlesTable();
    await ensureMoralPuzzleTables();
    try {
      const repair = await repairPuzzleUsedFlags();
      const cleared =
        (repair.gm_cleared?.length || 0) +
        (repair.lichess_cleared?.length || 0) +
        (repair.chesscom_cleared?.length || 0);
      if (cleared || repair.gm_synced?.length) {
        console.log(
          `✅ puzzle used-flag repair: cleared=${cleared}, gm_synced=${repair.gm_synced?.length || 0}`
        );
      }
    } catch (repairErr) {
      console.warn('⚠️ puzzle used-flag repair skipped:', repairErr.message);
    }
    ensureStudentsTable();
    await ensureBatchesTables();
    await ensureModulesTables();
    await ensureChessPuzzleColumns();
    await ensureChessPuzzlePollTable();
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

  // Brilliance results sync into app SQLite during normal analysis (no cloud backfill).

  // Continuous Chess.com sync for all tracked students (startup + interval).
  try {
    const chessComSyncService = require('./api/services/chessComSyncService');
    // Default 2 minutes (override with CHESS_COM_AUTO_SYNC_INTERVAL_MS). Avoid 60s
    // ticks stacking on long syncs and starving the Supabase pool.
    chessComSyncService.startAutoSyncScheduler({
      runOnStart: true,
    });
  } catch (syncErr) {
    console.warn('⚠️ Chess.com auto-sync scheduler failed to start:', syncErr.message);
  }

  // Parse PGNs → chess_com_moves for games since each student's joining date.
  try {
    const movesBackfill = require('./api/services/chessComMovesBackfillService');
    movesBackfill.startMovesBackfillWorker({ runOnStart: true });
  } catch (movesErr) {
    console.warn('⚠️ Chess.com moves-backfill worker failed to start:', movesErr.message);
  }

  // Brilliance stages stay on-demand when opening a game (no background S0–S4 workers).

  // Never auto-open browser tabs — nodemon restarts were spawning a new tab on every reload.
  // Use frontend dev server (npm start in /frontend → :3000) for daily development.
  // Set OPEN_BROWSER=true only if you explicitly want one tab opened on backend start.
  if (process.env.OPEN_BROWSER === 'true') {
    const openCommand = process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCommand} http://localhost:${PORT}`);
  }

  // Call automation controller immediately on startup (never crash the process).
  console.log('⏰ Running autoCompleteActivityTracker (startup)...');
  Promise.resolve()
    .then(() =>
      autoCompleteActivityTracker(
        { body: {} },
        {
          json: (data) => console.log('Automation result:', data),
          status: (code) => ({
            json: (data) => console.log('Automation error:', code, data),
          }),
        }
      )
    )
    .catch((err) => {
      console.error('⚠️ autoCompleteActivityTracker (startup) failed:', err?.message || err);
    });

  // Then schedule every 10 minutes
  setInterval(() => {
    console.log('⏰ Running autoCompleteActivityTracker...');
    Promise.resolve()
      .then(() =>
        autoCompleteActivityTracker(
          { body: {} },
          {
            json: (data) => console.log('Automation result:', data),
            status: (code) => ({
              json: (data) => console.log('Automation error:', code, data),
            }),
          }
        )
      )
      .catch((err) => {
        console.error('⚠️ autoCompleteActivityTracker failed:', err?.message || err);
      });
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