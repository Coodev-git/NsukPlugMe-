'use strict';

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const logger      = require('../utils/logger');

// Routes
const authRoutes   = require('../routes/auth.routes');
const jobRoutes    = require('../routes/job.routes');
const offerRoutes  = require('../routes/offer.routes');
const chatRoutes   = require('../routes/chat.routes');
const userRoutes   = require('../routes/user.routes');
const unlockRoutes = require('../routes/unlock.routes');
const reviewRoutes = require('../routes/review.routes');

// Error handling
const { errorHandler, notFound } = require('../middleware/errorHandler');

const createApp = () => {
  const app = express();

  // ── Security headers ──────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }));

  // ── CORS ──────────────────────────────────────────────────
  app.use(cors({
    origin:      process.env.CLIENT_URL || '*',
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));

  // ── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── Sanitize MongoDB query injection ──────────────────────
  app.use(mongoSanitize());

  // ── Compression ───────────────────────────────────────────
  app.use(compression());

  // ── Request logging ───────────────────────────────────────
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    }));
  }

  // ── Rate limiting ─────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max:      parseInt(process.env.RATE_LIMIT_MAX       || '100'),
    message:  { success: false, message: 'Too many requests — please slow down' },
    standardHeaders: true,
    legacyHeaders:   false,
  });
  app.use('/api/', limiter);

  // Auth gets stricter limit
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      20,
    message:  { success: false, message: 'Too many auth attempts' },
  });
  app.use('/api/auth/', authLimiter);

  // ── Health check ──────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status:    'ok',
      service:   'NSUK PlugMe API',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
      env:       process.env.NODE_ENV,
    });
  });

  // ── API Routes ────────────────────────────────────────────
  app.use('/api/auth',    authRoutes);
  app.use('/api/jobs',    jobRoutes);
  app.use('/api/offers',  offerRoutes);
  app.use('/api/chats',   chatRoutes);
  app.use('/api/users',   userRoutes);
  app.use('/api/unlock',  unlockRoutes);
  app.use('/api/reviews', reviewRoutes);

  // ── API docs stub ─────────────────────────────────────────
  app.get('/api', (req, res) => {
    res.json({
      success: true,
      message: 'NSUK PlugMe API v1.0.0',
      docs:    'See README.md for full endpoint list',
      endpoints: {
        auth:    '/api/auth',
        jobs:    '/api/jobs',
        offers:  '/api/offers',
        chats:   '/api/chats',
        users:   '/api/users',
        unlock:  '/api/unlock',
        reviews: '/api/reviews',
      },
    });
  });

  // ── 404 & Error handlers ──────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
