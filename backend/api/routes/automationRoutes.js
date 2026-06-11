const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automationController');

router.post('/api/automation/complete-activity-tracker', automationController.autoCompleteActivityTracker);
router.post('/api/automation/test-single', automationController.testSingleFetchAndSave);

module.exports = router; 