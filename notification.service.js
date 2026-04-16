'use strict';

const Notification = require('../models/Notification');
const logger       = require('../utils/logger');

// io is set by socket module after server starts
let _io = null;
const setIO = (io) => { _io = io; };

/**
 * Create a notification and emit it to the recipient via Socket.IO
 */
const send = async ({ recipient, type, title, message, data = {} }) => {
  try {
    const notif = await Notification.create({ recipient, type, title, message, data });

    // Real-time delivery via Socket.IO
    if (_io) {
      _io.to(`user:${recipient}`).emit('notification', {
        _id:       notif._id,
        type:      notif.type,
        title:     notif.title,
        message:   notif.message,
        data:      notif.data,
        createdAt: notif.createdAt,
      });
    }

    return notif;
  } catch (err) {
    logger.error(`Notification.send error: ${err.message}`);
    return null;
  }
};

// ── Convenience wrappers ──────────────────────────────────────

const newOffer = (studentId, workerName, jobId, offerId) =>
  send({
    recipient: studentId,
    type:      'new_offer',
    title:     '💰 New Offer Received',
    message:   `${workerName} placed an offer on your job.`,
    data:      { jobId, offerId },
  });

const offerAccepted = (workerId, studentName, jobId, offerId, chatId) =>
  send({
    recipient: workerId,
    type:      'offer_accepted',
    title:     '✅ Your Offer Was Accepted!',
    message:   `${studentName} accepted your offer. Chat is ready.`,
    data:      { jobId, offerId, chatId },
  });

const offerRejected = (workerId, jobTitle, jobId, offerId) =>
  send({
    recipient: workerId,
    type:      'offer_rejected',
    title:     '❌ Offer Not Selected',
    message:   `Your offer for "${jobTitle}" was not selected.`,
    data:      { jobId, offerId },
  });

const jobCompleted = (workerId, jobTitle, jobId) =>
  send({
    recipient: workerId,
    type:      'job_completed',
    title:     '🎉 Job Completed!',
    message:   `"${jobTitle}" has been marked complete. Rate your experience.`,
    data:      { jobId },
  });

const contactUnlocked = (workerId, studentName) =>
  send({
    recipient: workerId,
    type:      'contact_unlocked',
    title:     '🔓 Someone Unlocked Your Contact',
    message:   `${studentName} unlocked your phone number.`,
    data:      {},
  });

const newChatMessage = (recipientId, senderName, chatId, jobId) =>
  send({
    recipient: recipientId,
    type:      'chat_message',
    title:     `💬 New message from ${senderName}`,
    message:   'You have a new message. Tap to view.',
    data:      { chatId, jobId },
  });

module.exports = {
  setIO,
  send,
  newOffer,
  offerAccepted,
  offerRejected,
  jobCompleted,
  contactUnlocked,
  newChatMessage,
};
