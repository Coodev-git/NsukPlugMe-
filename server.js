'use strict';

require('dotenv').config();

const http       = require('http');
const createApp  = require('./src/config/express');
const connectDB  = require('./src/config/db');
const { initSocket } = require('./src/socket/socket');
const logger     = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Create Express app
    const app    = createApp();
    const server = http.createServer(app);

    // 3. Initialize Socket.IO
    initSocket(server);

    // 4. Start server
    server.listen(PORT, () => {
      logger.info(`
╔══════════════════════════════════════════════╗
║        NSUK PlugMe API — Running             ║
╠══════════════════════════════════════════════╣
║  Port    : ${PORT}                               ║
║  Env     : ${(process.env.NODE_ENV || 'development').padEnd(20)}      ║
║  Health  : http://localhost:${PORT}/health       ║
║  API     : http://localhost:${PORT}/api          ║
╚══════════════════════════════════════════════╝
      `);
    });

    // 5. Graceful shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('HTTP server closed');
        require('mongoose').connection.close(false, () => {
          logger.info('MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      logger.error(`Unhandled Rejection: ${err.message}`);
      shutdown('unhandledRejection');
    });

  } catch (err) {
    logger.error(`Startup error: ${err.message}`);
    process.exit(1);
  }
})();
