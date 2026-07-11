function createQuickReplyMenusRepository({ prisma }) {
  return {
    findManyForScope({ tenantId, intentType, pageId }) {
      const where = { tenantId: tenantId ?? null };
      if (intentType) where.intentType = intentType;
      if (pageId) where.pageId = pageId;

      return prisma.quickReplyMenu.findMany({
        where,
        orderBy: [{ intentType: 'asc' }, { createdAt: 'desc' }],
      });
    },

    findByIdForScope({ id, tenantId }) {
      if (tenantId) {
        return prisma.quickReplyMenu.findFirst({ where: { id, tenantId } });
      }
      return prisma.quickReplyMenu.findUnique({ where: { id } });
    },
  };
}

module.exports = createQuickReplyMenusRepository;
