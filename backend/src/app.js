'use strict';

/**
 * app.js — Express application factory.
 *
 * `createApp()` CHỈ dựng Express app: middleware + routes + error handler.
 * KHÔNG `listen`, KHÔNG connect DB, KHÔNG seed, KHÔNG start Telegram/Facebook/
 * notification/scheduled jobs, KHÔNG gửi network request, KHÔNG đăng ký process
 * signal handler. Nhờ vậy import app trong test/smoke không gây side effect external.
 *
 * Toàn bộ startup side-effect nằm ở `index.js` (runtime entrypoint).
 * Route order/middleware giữ nguyên như bản `index.js` trước khi tách.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const webhookHandler = require('./webhook/handler');
const dashboardApi = require('./api/dashboard');

function createApp() {
  const app = express();

  // Middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }));
  app.use(cors());
  app.use(express.json({
    limit: '5mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  app.use('/uploads', express.static('uploads'));

  // Facebook Webhook routes (direct - legacy)
  app.get('/webhook', webhookHandler.verifyWebhook);
  app.post('/webhook', webhookHandler.handleMessage);

  // Dashboard API routes
  app.use('/api', dashboardApi);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}

module.exports = { createApp };
