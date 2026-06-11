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
const { ensureUsersTable } = require('./scripts/ensureUsersTable');
const { ensureChessPuzzleColumns } = require('./scripts/ensureChessPuzzleColumns');
const { ensureModuleColumns } = require('./scripts/ensureModuleColumns');
const { ensureChapterColumns } = require('./scripts/ensureChapterColumns');
const accessRoutes = require('./api/routes/accessRoutes'); // <-- NEW: Import access routes
const trackerRoutes = require('./api/routes/trackerRoutes');
const automationRoutes = require('./api/routes/automationRoutes');
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
    await ensureUsersTable();
    await ensureChessPuzzleColumns();
    await ensureModuleColumns();
    await ensureChapterColumns();

    // console.log('Triggering initial data orchestration cycle...');
    // runDataUpdateCycle();

    // const updateIntervalHours = 4;
    // setInterval(runDataUpdateCycle, updateIntervalHours * 60 * 60 * 1000);
    // console.log(`✅ Data orchestration service scheduled every ${updateIntervalHours} hours.`);

  } catch (error) {
    console.error('❌ FATAL: Failed to connect to the database or start services:', error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server is live at http://localhost:${PORT}`);
    // Never auto-open browser tabs — nodemon restarts were spawning a new tab on every reload.
    // Use frontend dev server (npm start in /frontend → :3000) for daily development.
    // Set OPEN_BROWSER=true only if you explicitly want one tab opened on backend start.
    if (process.env.OPEN_BROWSER === 'true') {
      const openCommand = process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${openCommand} http://localhost:${PORT}`);
    }
  });

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

// --- Main Execution ---
killProcessOnPort(PORT).then(startServerAndServices).catch(err => {
    console.error('❌ A fatal error occurred during the startup sequence:', err);
    process.exit(1);
});