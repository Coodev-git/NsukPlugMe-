'use strict';

const mongoose = require('mongoose');

const JOB_STATUS = ['open', 'in_progress', 'completed', 'cancelled', 'disputed'];
const CATEGORIES  = ['laundry', 'delivery', 'tech', 'food', 'hair_beauty', 'printing', 'tutoring', 'other'];

const jobSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    assignedWorker: {
      type:  mongoose.Schema.Types.ObjectId,
      ref:   'User',
      default: null,
    },

    // Content
    title: {
      type:      String,
      required:  [true, 'Job title is required'],
      trim:      true,
      maxlength: 100,
    },
    description: {
      type:      String,
      required:  [true, 'Job description is required'],
      maxlength: 1000,
    },
    originalDescription: {       // Saved before AI optimization
      type: String,
      maxlength: 1000,
    },
    category: {
      type:     String,
      enum:     CATEGORIES,
      required: true,
    },
    tags: [{ type: String, trim: true }],

    // Pricing
    budget: {
      min:      { type: Number, min: 0, default: 0 },
      max:      { type: Number, min: 0 },
      currency: { type: String, default: 'NGN' },
    },
    agreedPrice: { type: Number, default: null },

    // Location
    location: {
      type:        { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      address:     { type: String, trim: true },
    },

    // State machine
    status: {
      type:    String,
      enum:    JOB_STATUS,
      default: 'open',
      index:   true,
    },
    statusHistory: [
      {
        status:    { type: String, enum: JOB_STATUS },
        changedAt: { type: Date, default: Date.now },
        note:      String,
      },
    ],

    // AI optimization flag
    aiOptimized: { type: Boolean, default: false },

    // Timestamps
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    deadline:    { type: Date, default: null },

    // Counts (denormalized for performance)
    offerCount: { type: Number, default: 0 },

    // Soft delete
    isDeleted: { type: Boolean, default: false, select: false },
  },
  {
    timestamps: true,
    toJSON:    { virtuals: true },
    toObject:  { virtuals: true },
  }
);

// Geo index
jobSchema.index({ location: '2dsphere' });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ student: 1 });

// Method: push a status change to history
jobSchema.methods.transitionStatus = function (newStatus, note = '') {
  this.status = newStatus;
  this.statusHistory.push({ status: newStatus, note });
  if (newStatus === 'in_progress') this.startedAt   = new Date();
  if (newStatus === 'completed')   this.completedAt = new Date();
};

// Virtual: is the job still actionable
jobSchema.virtual('isActive').get(function () {
  return ['open', 'in_progress'].includes(this.status);
});

// Exclude deleted jobs from all finds
jobSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

module.exports = mongoose.model('Job', jobSchema);
