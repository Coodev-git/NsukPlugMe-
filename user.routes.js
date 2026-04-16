'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/user.controller');
const { protect, requireRole } = require('../middleware/auth');

router.get   ('/workers',                    ctrl.listWorkers);
router.get   ('/dashboard',       protect, requireRole('worker'), ctrl.workerDashboard);
router.get   ('/notifications',   protect, ctrl.getNotifications);
router.patch ('/notifications/read', protect, ctrl.markNotificationsRead);
router.get   ('/:userId',                    ctrl.getProfile);
router.patch ('/me/profile',      protect, ctrl.updateProfile);

module.exports = router;
