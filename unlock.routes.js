'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/unlock.controller');
const { protect, requireRole } = require('../middleware/auth');

router.post('/worker/:workerId/initiate',  protect, requireRole('student'), ctrl.initiateUnlock);
router.get ('/verify/:reference',          protect, ctrl.verifyUnlock);
router.get ('/worker/:workerId/status',    protect, requireRole('student'), ctrl.checkUnlock);
router.get ('/admin/history', protect, requireRole('admin'), ctrl.unlockHistory);

module.exports = router;
