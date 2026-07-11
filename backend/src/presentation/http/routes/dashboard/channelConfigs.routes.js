const express = require('express');
const createChannelConfigsRepository = require('../../../../infrastructure/repositories/channelConfigs.repository');
const {
  createListChannelConfigs,
  createGetChannelConfig,
} = require('../../controllers/dashboard/channelConfigs.controller');

function createChannelConfigRoutes({ authMiddleware, getTenantScope, prisma }) {
  const router = express.Router();
  const channelConfigsRepository = createChannelConfigsRepository({ prisma });

  router.get('/', authMiddleware, createListChannelConfigs({ getTenantScope, channelConfigsRepository }));
  router.get('/:id', authMiddleware, createGetChannelConfig({ getTenantScope, channelConfigsRepository }));

  return router;
}

module.exports = createChannelConfigRoutes;
