'use strict';

const mongoose = require('mongoose');

/* ── Chat Room ─────────────────────────────────────────────── */
const chatSchema = new mongoose.Schema(
  {
    job: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Job',
      required: true,
    },
    offer: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Offer',
      required: true,
    },
    participants: [
      {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      'User',
        required: true,
      },
    ],

    // Last message snapshot (avoids chat-list re-fetching messages)
    lastMessage: {
      text:      { type: String, default: '' },
      sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      timestamp: { type: Date, default: null },
    },

    // Unread counts per participant: { userId: count }
    unreadCounts: {
      type:    Map,
      of:      Number,
      default: {},
    },

    isActive:  { type: Boolean, default: true },
    closedAt:  { type: Date,    default: null },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ job: 1 });

/* ── Message ───────────────────────────────────────────────── */
const messageSchema = new mongoose.Schema(
  {
    chat: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Chat',
      required: true,
      index:    true,
    },
    sender: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    text:     { type: String, maxlength: 2000, trim: true },
    type:     {
      type:    String,
      enum:    ['text', 'location', 'image', 'system'],
      default: 'text',
    },
    // For location messages
    location: {
      lat: Number,
      lng: Number,
      label: String,
    },
    // For system messages (auto-generated)
    isSystem: { type: Boolean, default: false },

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: -1 });

const Chat    = mongoose.model('Chat',    chatSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { Chat, Message };
