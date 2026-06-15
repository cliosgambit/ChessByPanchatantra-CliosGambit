const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automationController');

router.post('/api/automation/complete-activity-tracker', automationController.autoCompleteActivityTracker);
router.post('/api/automation/test-single', automationController.testSingleFetchAndSave);
router.post('/api/automation/retry-chess-com/:chessComId', automationController.clearChessComFetchBlock);

module.exports = router; 