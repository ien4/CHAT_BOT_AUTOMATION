function createListQuickReplyMenus({ getTenantScope, quickReplyMenusRepository }) {
  return async function listQuickReplyMenus(req, res) {
    try {
      const { intentType, pageId } = req.query;
      const tenantId = getTenantScope(req);
      const menus = await quickReplyMenusRepository.findManyForScope({ tenantId, intentType, pageId });
      res.json(menus);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function createGetQuickReplyMenu({ getTenantScope, quickReplyMenusRepository }) {
  return async function getQuickReplyMenu(req, res) {
    try {
      const tenantId = getTenantScope(req);
      const menu = await quickReplyMenusRepository.findByIdForScope({ id: req.params.id, tenantId });
      if (!menu) return res.status(404).json({ error: 'Not found' });
      res.json(menu);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  createListQuickReplyMenus,
  createGetQuickReplyMenu,
};
