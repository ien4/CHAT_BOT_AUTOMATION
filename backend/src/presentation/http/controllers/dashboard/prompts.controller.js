function createListPromptTemplates({ getTenantScope, promptTemplatesRepository }) {
  return async function listPromptTemplates(req, res) {
    try {
      const { layer } = req.query;
      const tenantId = getTenantScope(req);
      const templates = await promptTemplatesRepository.findManyForScope({ tenantId, layer });
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListPromptTemplates,
};
