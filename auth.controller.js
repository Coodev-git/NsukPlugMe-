'use strict';

const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const R      = require('../utils/apiResponse');
const logger = require('../utils/logger');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });

const sendTokens = (res, user, statusCode = 200) => {
  const token        = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Sanitize user object
  const userObj = user.toObject();
  delete userObj.password;
  delete userObj.refreshToken;

  return res.status(statusCode).json({
    success:      true,
    message:      statusCode === 201 ? 'Account created' : 'Login successful',
    token,
    refreshToken,
    data:         { user: userObj },
  });
};

// ── REGISTER ──────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password)
      return R.fail(res, 'Name, email, and password are required');

    if (!['student', 'worker'].includes(role))
      return R.fail(res, 'Role must be student or worker');

    const existing = await User.findOne({ email });
    if (existing) return R.fail(res, 'Email already registered', 409);

    const user = await User.create({ name, email, password, role, phone });

    logger.info(`New user registered: ${email} (${role})`);
    return sendTokens(res, user, 201);
  } catch (err) {
    next(err);
  }
};

// ── LOGIN ─────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return R.fail(res, 'Email and password are required');

    const user = await User.findOne({ email }).select('+password');
    if (!user)                        return R.unauthorized(res, 'Invalid credentials');
    if (user.isBanned)                return R.forbidden(res, 'Account suspended');
    if (!await user.comparePassword(password)) return R.unauthorized(res, 'Invalid credentials');

    // Save refresh token
    user.refreshToken = signRefreshToken(user._id);
    await user.save({ validateBeforeSave: false });

    logger.info(`User logged in: ${email}`);
    return sendTokens(res, user);
  } catch (err) {
    next(err);
  }
};

// ── REFRESH TOKEN ─────────────────────────────────────────────
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return R.unauthorized(res, 'Refresh token required');

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return R.unauthorized(res, 'Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken)
      return R.unauthorized(res, 'Refresh token mismatch — please log in again');

    const newToken        = signToken(user._id);
    const newRefreshToken = signRefreshToken(user._id);
    user.refreshToken     = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    return R.ok(res, { token: newToken, refreshToken: newRefreshToken }, 'Tokens refreshed');
  } catch (err) {
    next(err);
  }
};

// ── LOGOUT ────────────────────────────────────────────────────
exports.logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    return R.ok(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

// ── ME ────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    return R.ok(res, { user });
  } catch (err) {
    next(err);
  }
};

// ── CHANGE PASSWORD ───────────────────────────────────────────
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return R.fail(res, 'Current and new passwords are required');

    const user = await User.findById(req.user._id).select('+password');
    if (!await user.comparePassword(currentPassword))
      return R.unauthorized(res, 'Current password is incorrect');

    user.password = newPassword;
    await user.save();

    return R.ok(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};
