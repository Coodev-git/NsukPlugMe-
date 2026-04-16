'use strict';

const mongoose = require('mongoose');

const contactUnlockSchema = new mongoose.Schema(
  {
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    worker: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    amountPaid:  { type: Number, required: true },   // in kobo
    currency:    { type: String, default: 'NGN' },

    // Payment gateway details
    paymentRef:    { type: String, required: true, unique: true },
    paymentStatus: {
      type:    String,
      enum:    ['pending', 'success', 'failed'],
      default: 'pending',
    },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, select: false },

    // Access control
    isActive:  { type: Boolean, default: false },   // true only after payment succeeds
    expiresAt: { type: Date,    default: null },      // null = never expires
  },
  { timestamps: true }
);

// Composite unique: one unlock record per student-worker pair (idempotent)
contactUnlockSchema.index({ student: 1, worker: 1 }, { unique: true });

module.exports = mongoose.model('ContactUnlock', contactUnlockSchema);
