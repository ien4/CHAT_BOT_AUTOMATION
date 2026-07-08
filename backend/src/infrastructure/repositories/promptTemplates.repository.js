function createPromptTemplatesRepository({ prisma }) {
  return {
    findManyForScope({ tenantId, layer }) {
      const where = { tenantId: tenantId ?? null };
      if (layer) where.layer = layer;

      return prisma.promptTemplate.findMany({
        where,
        orderBy: [{ layer: 'asc' }, { intentType: 'asc' }],
      });
    },
  };
}

module.exports = createPromptTemplatesRepository;
