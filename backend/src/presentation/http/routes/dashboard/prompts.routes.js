const express = require('express');
const createPromptTemplatesRepository = require('../../../../infrastructure/repositories/promptTemplates.repository');
const { createListPromptTemplates } = require('../../controllers/dashboard/prompts.controller');

function createPromptRoutes({ authMiddleware, getTenantScope, prisma }) {
  const router = express.Router();
  const promptTemplatesRepository = createPromptTemplatesRepository({ prisma });

  router.get('/', authMiddleware, createListPromptTemplates({ getTenantScope, promptTemplatesRepository }));

  return router;
}

module.exports = createPromptRoutes;
