const express = require('express');
const createDashboardStatsRepository = require('../../../../infrastructure/repositories/dashboardStats.repository');
const { createGetStats } = require('../../controllers/dashboard/stats.controller');

function createStatsRoutes({ authMiddleware, platformAdminOnly, prisma }) {
  const router = express.Router();
  const dashboardStatsRepository = createDashboardStatsRepository({ prisma });

  router.get('/', authMiddleware, platformAdminOnly, createGetStats({ dashboardStatsRepository }));

  return router;
}

module.exports = createStatsRoutes;
