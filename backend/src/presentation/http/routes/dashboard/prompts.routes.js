const express = require('express');
const { createListPromptTemplates } = require('../../controllers/dashboard/prompts.controller');

function createPromptRoutes({ authMiddleware, getTenantScope, prisma }) {
  const router = express.Router();

  router.get('/', authMiddleware, createListPromptTemplates({ getTenantScope, prisma }));

  return router;
}

module.exports = createPromptRoutes;
