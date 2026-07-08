const express = require('express');
const { getWebhookSettings } = require('../../controllers/dashboard/settings.controller');

function createSettingsRoutes({ authMiddleware }) {
  const router = express.Router();

  router.get('/webhook', authMiddleware, getWebhookSettings);

  return router;
}

module.exports = createSettingsRoutes;
