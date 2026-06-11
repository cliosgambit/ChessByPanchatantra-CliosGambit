const express = require('express');
const router = express.Router();
const trackerController = require('../controllers/trackerController');

// Update activity_tracker for a player
router.put('/api/tracker/:id', trackerController.updateActivityTracker);
// Add this route to fetch all players for the activity tracker
router.get('/api/players/reports', trackerController.getAllPlayersForTracker);

module.exports = router; 