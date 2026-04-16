'use strict';

const { Server }   = require('socket.io');
const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const { Chat, Message } = require('../models/Chat');
const notifSvc     = require('../services/notification.service');
const logger       = require('../utils/logger');

let _io = null;

const getIO = () => _io;

const initSocket = (httpServer) => {
  _io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL || '*',
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── JWT Authentication middleware ─────────────────────────
  _io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await User.findById(decoded.id).select('name role avatar isBanned');

      if (!user)          return next(new Error('User not found'));
      if (user.isBanned)  return next(new Error('Account suspended'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ────────────────────────────────────────────
  _io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`Socket connected: ${user.name} (${user._id}) — ${socket.id}`);

    // Join personal room for targeted notifications
    socket.join(`user:${user._id}`);

    // Update last seen
    User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();

    // ── JOIN CHAT ROOM ──────────────────────────────────────
    socket.on('join_chat', async ({ chatId }) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) return socket.emit('error', { message: 'Chat not found' });

        const isParticipant = chat.participants.some(
          p => p.toString() === user._id.toString()
        );
        if (!isParticipant) return socket.emit('error', { message: 'Not a participant' });

        socket.join(`chat:${chatId}`);

        // Mark messages as read
        await Message.updateMany(
          { chat: chatId, readBy: { $ne: user._id } },
          { $addToSet: { readBy: user._id } }
        );
        await Chat.findByIdAndUpdate(chatId, {
          $set: { [`unreadCounts.${user._id}`]: 0 },
        });

        // Emit read receipts to others in the room
        socket.to(`chat:${chatId}`).emit('messages_read', {
          chatId,
          readBy: { _id: user._id, name: user.name },
        });

        socket.emit('joined_chat', { chatId });
        logger.info(`${user.name} joined chat: ${chatId}`);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── LEAVE CHAT ROOM ─────────────────────────────────────
    socket.on('leave_chat', ({ chatId }) => {
      socket.leave(`chat:${chatId}`);
    });

    // ── SEND MESSAGE ────────────────────────────────────────
    socket.on('send_message', async ({ chatId, text, location }) => {
      try {
        if (!text && !location) return;

        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isActive)
          return socket.emit('error', { message: 'Chat not found or closed' });

        const isParticipant = chat.participants.some(
          p => p.toString() === user._id.toString()
        );
        if (!isParticipant)
          return socket.emit('error', { message: 'Not a participant' });

        const msgType = location ? 'location' : 'text';
        const message = await Message.create({
          chat:     chatId,
          sender:   user._id,
          text:     text || '',
          type:     msgType,
          location: location || undefined,
          readBy:   [user._id],
        });

        // Update chat last message
        const recipientId = chat.participants
          .find(p => p.toString() !== user._id.toString())?.toString();

        await Chat.findByIdAndUpdate(chatId, {
          lastMessage:  { text: text || '📍 Location', sender: user._id, timestamp: new Date() },
          updatedAt:    new Date(),
          ...(recipientId && { $inc: { [`unreadCounts.${recipientId}`]: 1 } }),
        });

        // Broadcast to chat room
        _io.to(`chat:${chatId}`).emit('new_message', {
          _id:       message._id,
          chat:      chatId,
          sender:    { _id: user._id, name: user.name, avatar: user.avatar, role: user.role },
          text:      message.text,
          type:      message.type,
          location:  message.location,
          isSystem:  false,
          readBy:    [user._id],
          createdAt: message.createdAt,
        });

        // Notify recipient if they're not in this chat room
        if (recipientId) {
          const recipientSockets = await _io.in(`user:${recipientId}`).fetchSockets();
          const inChatRoom = recipientSockets.some(s =>
            s.rooms.has(`chat:${chatId}`)
          );
          if (!inChatRoom) {
            await notifSvc.newChatMessage(recipientId, user.name, chatId, chat.job);
          }
        }

      } catch (err) {
        logger.error(`send_message error: ${err.message}`);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── TYPING INDICATOR ────────────────────────────────────
    socket.on('typing_start', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('user_typing', {
        chatId,
        user: { _id: user._id, name: user.name },
      });
    });

    socket.on('typing_stop', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('user_stopped_typing', {
        chatId,
        userId: user._id,
      });
    });

    // ── SHARE LOCATION ──────────────────────────────────────
    socket.on('share_location', async ({ chatId, lat, lng, label }) => {
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) return;

        const message = await Message.create({
          chat:     chatId,
          sender:   user._id,
          text:     label || '📍 Shared location',
          type:     'location',
          location: { lat, lng, label },
          readBy:   [user._id],
        });

        _io.to(`chat:${chatId}`).emit('new_message', {
          _id:       message._id,
          chat:      chatId,
          sender:    { _id: user._id, name: user.name, avatar: user.avatar },
          text:      message.text,
          type:      'location',
          location:  { lat, lng, label },
          createdAt: message.createdAt,
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── ONLINE PRESENCE ─────────────────────────────────────
    socket.on('ping_presence', () => {
      socket.emit('pong_presence', { timestamp: Date.now() });
    });

    // ── DISCONNECT ──────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();
      logger.info(`Socket disconnected: ${user.name} — reason: ${reason}`);
    });
  });

  // Pass io to notification service
  notifSvc.setIO(_io);

  logger.info('Socket.IO server initialized');
  return _io;
};

module.exports = { initSocket, getIO };
