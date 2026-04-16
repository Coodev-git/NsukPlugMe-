'use strict';

const mongoose = require('mongoose');

const NOTIF_TYPES = [
  'new_offer',
  'offer_accepted',
  'offer_rejected',
  'chat_message',
  'job_completed',
  'job_cancelled',
  'payment_received',
  'contact_unlocked',
  'review_received',
  'system',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      enum:     NOTIF_TYPES,
      required: true,
    },
    title:   { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },

    // Deep-link data
    data: {
      jobId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Job',    default: null },
      offerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Offer',  default: null },
      chatId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Chat',   default: null },
      userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    },

    isRead:  { type: Boolean, default: false, index: true },
    readAt:  { type: Date,    default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
