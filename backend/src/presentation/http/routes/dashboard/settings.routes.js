const express = require('express');
const createHandoffSettingsRepository = require('../../../../infrastructure/repositories/handoffSettings.repository');
const {
  createGetTelegramDestinations,
  createGetHandoffSettings,
  createPutHandoffSettings,
  getWebhookSettings,
} = require('../../controllers/dashboard/settings.controller');

function createSettingsRoutes({ authMiddleware, prisma }) {
  const router = express.Router();
  const handoffSettingsRepository = createHandoffSettingsRepository({ prisma });

  router.get('/webhook', authMiddleware, getWebhookSettings);
  router.get('/telegram-destinations', authMiddleware, createGetTelegramDestinations({ prisma }));
  router.get('/handoff', authMiddleware, createGetHandoffSettings({ handoffSettingsRepository }));
  router.put('/handoff', authMiddleware, createPutHandoffSettings({ handoffSettingsRepository }));

  return router;
}

module.exports = createSettingsRoutes;
