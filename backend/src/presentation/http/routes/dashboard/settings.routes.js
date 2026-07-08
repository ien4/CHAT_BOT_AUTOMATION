const express = require('express');
const {
  createGetTelegramDestinations,
  createGetHandoffSettings,
  createPutHandoffSettings,
  getWebhookSettings,
} = require('../../controllers/dashboard/settings.controller');

function createSettingsRoutes({ authMiddleware, prisma }) {
  const router = express.Router();

  router.get('/webhook', authMiddleware, getWebhookSettings);
  router.get('/telegram-destinations', authMiddleware, createGetTelegramDestinations({ prisma }));
  router.get('/handoff', authMiddleware, createGetHandoffSettings({ prisma }));
  router.put('/handoff', authMiddleware, createPutHandoffSettings({ prisma }));

  return router;
}

module.exports = createSettingsRoutes;
