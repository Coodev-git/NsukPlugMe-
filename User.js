'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      type:     String,
      required: [true, 'Password is required'],
      minlength: 6,
      select:   false,       // Never returned by default
    },
    role: {
      type:    String,
      enum:    ['student', 'worker', 'admin'],
      default: 'student',
    },

    // Profile
    phone: { type: String, trim: true },
    avatar: { type: String, default: null },
    bio: { type: String, maxlength: 300 },
    location: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

    // Worker-specific
    skills:   [{ type: String, trim: true }],
    isAvailable: { type: Boolean, default: true },

    // Trust & reputation
    rating:      { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    campusCred:  { type: Number, default: 0 },   // PlugMe XP/score

    // Earnings (workers)
    totalEarned:   { type: Number, default: 0 },
    pendingPayout: { type: Number, default: 0 },

    // Subscription
    plan: {
      type:    String,
      enum:    ['free', 'pro'],
      default: 'free',
    },
    planExpiresAt: { type: Date, default: null },

    // Account status
    isVerified: { type: Boolean, default: false },
    isBanned:   { type: Boolean, default: false },
    lastSeen:   { type: Date,    default: Date.now },

    // Tokens
    refreshToken:       { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON:    { virtuals: true },
    toObject:  { virtuals: true },
  }
);

// Geo index for location-based queries
userSchema.index({ location: '2dsphere' });
userSchema.index({ role: 1 });
userSchema.index({ email: 1 });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Update rating helper
userSchema.methods.updateRating = async function (newRating) {
  const total      = this.rating * this.ratingCount + newRating;
  this.ratingCount += 1;
  this.rating       = parseFloat((total / this.ratingCount).toFixed(2));
  await this.save();
};

// Virtual: formatted rating string
userSchema.virtual('ratingDisplay').get(function () {
  return this.ratingCount === 0 ? 'New' : `${this.rating} ⭐ (${this.ratingCount})`;
});

module.exports = mongoose.model('User', userSchema);
