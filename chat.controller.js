'use strict';

const { Chat, Message } = require('../models/Chat');
const R      = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ── GET MY CHATS ──────────────────────────────────────────────
exports.myChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({ participants: req.user._id, isActive: true })
      .populate('participants', 'name avatar role rating')
      .populate('job',         'title category status agreedPrice')
      .sort({ updatedAt: -1 });

    // Attach unread count for this user
    const result = chats.map(chat => {
      const obj     = chat.toObject();
      const uid     = req.user._id.toString();
      obj.myUnread  = chat.unreadCounts?.get(uid) || 0;
      obj.otherUser = obj.participants.find(p => p._id.toString() !== uid);
      return obj;
    });

    return R.ok(res, { chats: result, count: result.length });
  } catch (err) {
    next(err);
  }
};

// ── GET SINGLE CHAT + MESSAGES ────────────────────────────────
exports.getChatMessages = async (req, res, next) => {
  try {
    const { chatId }  = req.params;
    const { page = 1, limit = 30 } = req.query;

    const chat = await Chat.findById(chatId)
      .populate('participants', 'name avatar role rating')
      .populate('job',         'title category status agreedPrice assignedWorker');

    if (!chat) return R.notFound(res, 'Chat not found');

    const isParticipant = chat.participants.some(
      p => p._id.toString() === req.user._id.toString()
    );
    if (!isParticipant) return R.forbidden(res, 'You are not part of this chat');

    // Get messages (paginated, newest first)
    const total    = await Message.countDocuments({ chat: chatId });
    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'name avatar role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Mark messages as read
    const uid = req.user._id.toString();
    await Message.updateMany(
      { chat: chatId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    // Reset unread count for this user
    await Chat.findByIdAndUpdate(chatId, {
      $set: { [`unreadCounts.${uid}`]: 0 },
    });

    return R.paginate(res, messages.reverse(), total, page, limit, 'Chat loaded');
  } catch (err) {
    next(err);
  }
};

// ── SEND MESSAGE (REST fallback — primary is Socket.IO) ───────
exports.sendMessage = async (req, res, next) => {
  try {
    const { chatId }  = req.params;
    const { text, location } = req.body;

    if (!text && !location)
      return R.fail(res, 'Message text or location is required');

    const chat = await Chat.findById(chatId);
    if (!chat) return R.notFound(res, 'Chat not found');

    const isParticipant = chat.participants.some(
      p => p.toString() === req.user._id.toString()
    );
    if (!isParticipant) return R.forbidden(res, 'You are not part of this chat');
    if (!chat.isActive)  return R.fail(res, 'This chat is closed');

    const msgType = location ? 'location' : 'text';
    const message = await Message.create({
      chat:     chatId,
      sender:   req.user._id,
      text:     text || '',
      type:     msgType,
      location: location || undefined,
      readBy:   [req.user._id],
    });

    // Update chat lastMessage + increment unread for recipient
    const recipientId = chat.participants
      .find(p => p.toString() !== req.user._id.toString())
      ?.toString();

    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: { text: text || '📍 Location shared', sender: req.user._id, timestamp: new Date() },
      ...(recipientId && { $inc: { [`unreadCounts.${recipientId}`]: 1 } }),
    });

    // Emit via Socket.IO if available
    const io = require('../socket/socket').getIO();
    if (io) {
      io.to(`chat:${chatId}`).emit('new_message', {
        ...message.toObject(),
        sender: { _id: req.user._id, name: req.user.name, avatar: req.user.avatar },
      });
    }

    // Notify recipient (only if offline)
    if (recipientId) {
      const notifSvc = require('../services/notification.service');
      await notifSvc.newChatMessage(recipientId, req.user.name, chatId, chat.job);
    }

    await message.populate('sender', 'name avatar role');
    return R.created(res, { message });
  } catch (err) {
    next(err);
  }
};
