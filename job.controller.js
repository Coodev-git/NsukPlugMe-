'use strict';

const Job           = require('../models/Job');
const { optimizeJobRequest } = require('../services/ai.service');
const R             = require('../utils/apiResponse');

// ── CREATE JOB ────────────────────────────────────────────────
exports.createJob = async (req, res, next) => {
  try {
    const { title, description, category, budget, location, deadline, tags } = req.body;

    if (!title || !description || !category)
      return R.fail(res, 'Title, description, and category are required');

    // AI optimization
    let finalTitle       = title;
    let finalDescription = description;
    let aiOptimized      = false;

    try {
      const optimized  = await optimizeJobRequest(title, description, category);
      finalTitle       = optimized.title;
      finalDescription = optimized.description;
      aiOptimized      = true;
    } catch { /* use original if AI fails */ }

    const job = await Job.create({
      student:             req.user._id,
      title:               finalTitle,
      description:         finalDescription,
      originalDescription: description,
      category,
      budget:              budget || {},
      location:            location || {},
      deadline:            deadline || null,
      tags:                tags || [],
      aiOptimized,
      statusHistory:       [{ status: 'open', note: 'Job created' }],
    });

    await job.populate('student', 'name avatar rating');

    return R.created(res, { job }, 'Job posted successfully');
  } catch (err) {
    next(err);
  }
};

// ── LIST JOBS (with filters + pagination) ─────────────────────
exports.listJobs = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20,
      category, status = 'open',
      lat, lng, radius = 2000,   // radius in metres, default 2km
      search, minBudget, maxBudget,
    } = req.query;

    const filter = { status };
    if (category) filter.category = category;

    // Text search
    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Budget filter
    if (minBudget || maxBudget) {
      filter['budget.max'] = {};
      if (minBudget) filter['budget.max'].$gte = Number(minBudget);
      if (maxBudget) filter['budget.max'].$lte = Number(maxBudget);
    }

    // Geo filter
    if (lat && lng) {
      filter['location'] = {
        $near: {
          $geometry:    { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(radius),
        },
      };
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Job.countDocuments(filter);
    const jobs  = await Job.find(filter)
      .populate('student', 'name avatar rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    return R.paginate(res, jobs, total, page, limit);
  } catch (err) {
    next(err);
  }
};

// ── GET ONE JOB ───────────────────────────────────────────────
exports.getJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('student',        'name avatar rating campusCred')
      .populate('assignedWorker', 'name avatar rating skills');

    if (!job) return R.notFound(res, 'Job not found');
    return R.ok(res, { job });
  } catch (err) {
    next(err);
  }
};

// ── UPDATE JOB ────────────────────────────────────────────────
exports.updateJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return R.notFound(res, 'Job not found');

    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the student who posted this job can edit it');

    if (job.status !== 'open')
      return R.fail(res, 'Cannot edit a job that is no longer open');

    const allowed = ['title', 'description', 'budget', 'deadline', 'tags', 'location'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) job[field] = req.body[field];
    });

    await job.save();
    return R.ok(res, { job }, 'Job updated');
  } catch (err) {
    next(err);
  }
};

// ── DELETE (soft) ─────────────────────────────────────────────
exports.deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return R.notFound(res, 'Job not found');

    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the student who posted this job can delete it');

    if (job.status === 'in_progress')
      return R.fail(res, 'Cannot delete an in-progress job — cancel it first');

    job.isDeleted = true;
    job.transitionStatus('cancelled', 'Deleted by student');
    await job.save();

    return R.ok(res, null, 'Job removed');
  } catch (err) {
    next(err);
  }
};

// ── COMPLETE JOB ──────────────────────────────────────────────
exports.completeJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return R.notFound(res, 'Job not found');

    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the student can mark a job as complete');

    if (job.status !== 'in_progress')
      return R.fail(res, 'Job must be In Progress to complete');

    job.transitionStatus('completed', 'Marked complete by student');
    await job.save();

    // Update worker earnings
    if (job.assignedWorker && job.agreedPrice) {
      const User = require('../models/User');
      await User.findByIdAndUpdate(job.assignedWorker, {
        $inc: { totalEarned: job.agreedPrice, campusCred: 10 },
      });
    }

    // Notify worker
    if (job.assignedWorker) {
      const notifSvc = require('../services/notification.service');
      await notifSvc.jobCompleted(job.assignedWorker, job.title, job._id);
    }

    return R.ok(res, { job }, 'Job marked as completed');
  } catch (err) {
    next(err);
  }
};

// ── MY JOBS (student's posted jobs) ───────────────────────────
exports.myJobs = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { student: req.user._id };
    if (status) filter.status = status;

    const total = await Job.countDocuments(filter);
    const jobs  = await Job.find(filter)
      .populate('assignedWorker', 'name avatar rating')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, jobs, total, page, limit);
  } catch (err) {
    next(err);
  }
};
