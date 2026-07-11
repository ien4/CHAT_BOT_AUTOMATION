const express = require('express');
const createQuickReplyMenusRepository = require('../../../../infrastructure/repositories/quickReplyMenus.repository');
const {
  createListQuickReplyMenus,
  createGetQuickReplyMenu,
} = require('../../controllers/dashboard/quickReplyMenus.controller');

function createQuickReplyMenuRoutes({ authMiddleware, getTenantScope, prisma }) {
  const router = express.Router();
  const quickReplyMenusRepository = createQuickReplyMenusRepository({ prisma });

  router.get('/', authMiddleware, createListQuickReplyMenus({ getTenantScope, quickReplyMenusRepository }));
  router.get('/:id', authMiddleware, createGetQuickReplyMenu({ getTenantScope, quickReplyMenusRepository }));

  return router;
}

module.exports = createQuickReplyMenuRoutes;
