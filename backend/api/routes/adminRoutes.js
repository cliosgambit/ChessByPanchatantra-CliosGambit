const express = require('express');
const router = express.Router();
const adminStatsController = require('../controllers/adminStatsController');
const { authMiddleware, requireRoles } = require('../middleware/authMiddleware');

router.get(
  '/admin/dashboard-stats',
  authMiddleware,
  requireRoles('admin'),
  adminStatsController.getDashboardStats
);

module.exports = router;
