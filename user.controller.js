'use strict';

const User   = require('../models/User');
const Job    = require('../models/Job');
const Offer  = require('../models/Offer');
const R      = require('../utils/apiResponse');

// ── GET PUBLIC PROFILE ────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-refreshToken -passwordResetToken -passwordResetExpires');

    if (!user || user.isBanned) return R.notFound(res, 'User not found');

    // Never expose phone in public profile
    const profile = user.toObject();
    delete profile.phone;

    return R.ok(res, { user: profile });
  } catch (err) {
    next(err);
  }
};

// ── UPDATE MY PROFILE ─────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name', 'bio', 'skills', 'location', 'isAvailable', 'phone'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new:              true,
      runValidators:    true,
    });

    return R.ok(res, { user }, 'Profile updated');
  } catch (err) {
    next(err);
  }
};

// ── LIST WORKERS (with filters) ───────────────────────────────
exports.listWorkers = async (req, res, next) => {
  try {
    const {
      skills, lat, lng, radius = 3000,
      minRating, page = 1, limit = 20,
      search,
    } = req.query;

    const filter = { role: 'worker', isBanned: false, isAvailable: true };

    if (skills) {
      const skillArray = skills.split(',').map(s => s.trim());
      filter.skills = { $in: skillArray };
    }

    if (minRating) filter.rating = { $gte: Number(minRating) };

    if (search) {
      filter.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { skills: { $regex: search, $options: 'i' } },
        { bio:    { $regex: search, $options: 'i' } },
      ];
    }

    if (lat && lng) {
      filter.location = {
        $near: {
          $geometry:    { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(radius),
        },
      };
    }

    const total   = await User.countDocuments(filter);
    const workers = await User.find(filter)
      .select('name avatar bio skills rating ratingCount campusCred plan isAvailable location')
      .sort({ rating: -1, campusCred: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, workers, total, page, limit);
  } catch (err) {
    next(err);
  }
};

// ── WORKER DASHBOARD ──────────────────────────────────────────
exports.workerDashboard = async (req, res, next) => {
  try {
    if (req.user.role !== 'worker')
      return R.forbidden(res, 'Only workers can access the dashboard');

    const [activeJobs, completedJobs, pendingOffers, totalOffers] = await Promise.all([
      Job.countDocuments({ assignedWorker: req.user._id, status: 'in_progress' }),
      Job.countDocuments({ assignedWorker: req.user._id, status: 'completed' }),
      Offer.countDocuments({ worker: req.user._id, status: 'pending' }),
      Offer.countDocuments({ worker: req.user._id }),
    ]);

    const recentJobs = await Job.find({ assignedWorker: req.user._id })
      .populate('student', 'name avatar')
      .sort({ updatedAt: -1 })
      .limit(5);

    return R.ok(res, {
      stats: {
        activeJobs,
        completedJobs,
        pendingOffers,
        totalOffers,
        totalEarned:   req.user.totalEarned,
        pendingPayout: req.user.pendingPayout,
        rating:        req.user.rating,
        ratingCount:   req.user.ratingCount,
        campusCred:    req.user.campusCred,
      },
      recentJobs,
    });
  } catch (err) {
    next(err);
  }
};

// ── NOTIFICATIONS ─────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
  try {
    const Notification = require('../models/Notification');
    const { page = 1, limit = 20, unreadOnly } = req.query;

    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') filter.isRead = false;

    const total  = await Notification.countDocuments(filter);
    const notifs = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, notifs, total, page, limit);
  } catch (err) {
    next(err);
  }
};

exports.markNotificationsRead = async (req, res, next) => {
  try {
    const Notification = require('../models/Notification');
    const { ids } = req.body; // array of notification IDs, or empty = mark all

    const filter = { recipient: req.user._id, isRead: false };
    if (ids?.length) filter._id = { $in: ids };

    await Notification.updateMany(filter, { isRead: true, readAt: new Date() });
    return R.ok(res, null, 'Notifications marked as read');
  } catch (err) {
    next(err);
  }
};
