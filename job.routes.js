'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/job.controller');
const offerCtrl = require('../controllers/offer.controller');
const { protect, requireRole } = require('../middleware/auth');

// Public
router.get('/',     ctrl.listJobs);
router.get('/:id',  ctrl.getJob);

// Student-only
router.post('/',           protect, requireRole('student'), ctrl.createJob);
router.patch('/:id',       protect, requireRole('student'), ctrl.updateJob);
router.delete('/:id',      protect, requireRole('student'), ctrl.deleteJob);
router.patch('/:id/complete', protect, requireRole('student'), ctrl.completeJob);
router.get('/my/posted',   protect, requireRole('student'), ctrl.myJobs);

// Offers sub-resource
router.post  ('/:jobId/offers',            protect, requireRole('worker'),  offerCtrl.submitOffer);
router.get   ('/:jobId/offers',            protect, requireRole('student'), offerCtrl.listOffers);
router.patch ('/:jobId/offers/:offerId/accept', protect, requireRole('student'), offerCtrl.acceptOffer);
router.patch ('/:jobId/offers/:offerId/reject', protect, requireRole('student'), offerCtrl.rejectOffer);

module.exports = router;
