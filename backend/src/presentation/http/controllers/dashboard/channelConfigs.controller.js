function createListChannelConfigs({ getTenantScope, channelConfigsRepository }) {
  return async function listChannelConfigs(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const configs = await channelConfigsRepository.findManyForScope({ tenantId });
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function createGetChannelConfig({ getTenantScope, channelConfigsRepository }) {
  return async function getChannelConfig(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const config = await channelConfigsRepository.findByIdForScope({ id: req.params.id, tenantId });
      if (!config) return res.status(404).json({ error: 'Not found' });
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListChannelConfigs,
  createGetChannelConfig,
};
