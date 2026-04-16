'use strict';

const Review = require('../models/Review');
const Job    = require('../models/Job');
const User   = require('../models/User');
const R      = require('../utils/apiResponse');

// ── SUBMIT REVIEW ─────────────────────────────────────────────
exports.submitReview = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { rating, comment, tags } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return R.fail(res, 'Rating must be between 1 and 5');

    const job = await Job.findById(jobId);
    if (!job) return R.notFound(res, 'Job not found');
    if (job.status !== 'completed') return R.fail(res, 'Job must be completed before reviewing');

    // Determine reviewer and reviewee
    const isStudent = req.user._id.toString() === job.student.toString();
    const isWorker  = job.assignedWorker &&
                      req.user._id.toString() === job.assignedWorker.toString();

    if (!isStudent && !isWorker)
      return R.forbidden(res, 'Only the student or assigned worker can review this job');

    const revieweeId = isStudent ? job.assignedWorker : job.student;

    // Check duplicate
    const existing = await Review.findOne({ job: jobId, reviewer: req.user._id });
    if (existing) return R.fail(res, 'You have already reviewed this job', 409);

    const review = await Review.create({
      job:      jobId,
      reviewer: req.user._id,
      reviewee: revieweeId,
      rating,
      comment,
      tags: tags || [],
    });

    // Update reviewee's aggregate rating
    const reviewee = await User.findById(revieweeId);
    if (reviewee) await reviewee.updateRating(rating);

    await review.populate('reviewer', 'name avatar');

    return R.created(res, { review }, 'Review submitted — thank you!');
  } catch (err) {
    next(err);
  }
};

// ── GET REVIEWS FOR A USER ────────────────────────────────────
exports.getUserReviews = async (req, res, next) => {
  try {
    const { userId }       = req.params;
    const { page = 1, limit = 10 } = req.query;

    const total   = await Review.countDocuments({ reviewee: userId });
    const reviews = await Review.find({ reviewee: userId })
      .populate('reviewer', 'name avatar')
      .populate('job',      'title category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, reviews, total, page, limit);
  } catch (err) {
    next(err);
  }
};
