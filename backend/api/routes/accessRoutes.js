const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');

// Get all access control settings
router.get('/access-control', accessController.getAccessControl);

// Get access control for a specific role
router.get('/access-control/:role', accessController.getRoleAccess);

// Update access control for a role
router.put('/access-control/:role', accessController.updateRoleAccess);

// Create new role access control
router.post('/access-control', accessController.createRoleAccess);

// Check if user has access to a specific resource
router.get('/access-check/:role/:resourceType/:resourceId', accessController.checkUserAccess);

module.exports = router; 