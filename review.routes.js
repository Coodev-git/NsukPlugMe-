'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/review.controller');
const { protect } = require('../middleware/auth');

router.post('/job/:jobId',   protect, ctrl.submitReview);
router.get ('/user/:userId',          ctrl.getUserReviews);

module.exports = router;
