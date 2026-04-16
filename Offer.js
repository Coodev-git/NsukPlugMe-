'use strict';

const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    job: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Job',
      required: true,
      index:    true,
    },
    worker: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // Bid details
    price: {
      type:     Number,
      required: [true, 'Offer price is required'],
      min:      [1, 'Price must be at least ₦1'],
    },
    currency:  { type: String, default: 'NGN' },
    message:   { type: String, maxlength: 500, trim: true },
    eta:       { type: String, maxlength: 80 },   // e.g. "30 minutes", "1 hour"

    status: {
      type:    String,
      enum:    ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'],
      default: 'pending',
      index:   true,
    },

    // Set when accepted — links to auto-created chat
    chatId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Chat',
      default: null,
    },

    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  },
  { timestamps: true }
);

// One worker → one offer per job (can re-offer only after withdrawal)
offerSchema.index({ job: 1, worker: 1 }, { unique: true });

module.exports = mongoose.model('Offer', offerSchema);
