function createListPromptTemplates({ getTenantScope, prisma }) {
  return async function listPromptTemplates(req, res) {
    try {
      const { layer } = req.query;
      const tenantId = getTenantScope(req);
      const where = { tenantId: tenantId ?? null };
      if (layer) where.layer = layer;

      const templates = await prisma.promptTemplate.findMany({
        where,
        orderBy: [{ layer: 'asc' }, { intentType: 'asc' }],
      });
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListPromptTemplates,
};
