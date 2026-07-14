const express = require('express');
const createAdminUsersRepository = require('../../../../infrastructure/repositories/adminUsers.repository');
const { createListAdminUsers } = require('../../controllers/dashboard/adminUsers.controller');

function createAdminUsersRoutes({ authMiddleware, platformAdminOnly, prisma }) {
  const router = express.Router();
  const adminUsersRepository = createAdminUsersRepository({ prisma });

  router.get('/', authMiddleware, platformAdminOnly, createListAdminUsers({ adminUsersRepository }));

  return router;
}

module.exports = createAdminUsersRoutes;
