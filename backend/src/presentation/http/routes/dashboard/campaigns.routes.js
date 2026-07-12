const express = require('express');
const createCampaignsRepository = require('../../../../infrastructure/repositories/campaigns.repository');
const {
  createListCampaigns,
  createGetCampaign,
} = require('../../controllers/dashboard/campaigns.controller');

function createCampaignRoutes({ authMiddleware, platformAdminOnly, prisma }) {
  const router = express.Router();
  const campaignsRepository = createCampaignsRepository({ prisma });

  router.get('/', authMiddleware, platformAdminOnly, createListCampaigns({ campaignsRepository }));
  router.get('/:id', authMiddleware, platformAdminOnly, createGetCampaign({ campaignsRepository }));

  return router;
}

module.exports = createCampaignRoutes;
