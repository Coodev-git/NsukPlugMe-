'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const R    = require('../utils/apiResponse');

/**
 * protect — Verifies JWT and attaches req.user
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) return R.unauthorized(res, 'Access denied — no token provided');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return R.unauthorized(res, 'Token expired — please log in again');
      return R.unauthorized(res, 'Invalid token');
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user)       return R.unauthorized(res, 'User no longer exists');
    if (user.isBanned) return R.forbidden(res, 'Account has been suspended');

    // Update last seen (non-blocking)
    User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * requireRole — Role-based access after protect
 * Usage: requireRole('admin') or requireRole('worker', 'admin')
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return R.unauthorized(res);
  if (!roles.includes(req.user.role)) {
    return R.forbidden(res, `Access restricted to: ${roles.join(', ')}`);
  }
  next();
};

/**
 * optionalAuth — Attaches user if token present, doesn't fail if missing
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id);
    if (user && !user.isBanned) req.user = user;
    next();
  } catch {
    next(); // Silently continue
  }
};

module.exports = { protect, requireRole, optionalAuth };
