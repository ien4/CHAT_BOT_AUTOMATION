function createChannelConfigsRepository({ prisma }) {
  return {
    findManyForScope({ tenantId }) {
      if (tenantId) {
        return prisma.tenantChannelConfig.findMany({ where: { tenantId }, orderBy: { channelType: 'asc' } });
      }
      return prisma.channelConfig.findMany({ orderBy: { channelType: 'asc' } });
    },

    async findByIdForScope({ id, tenantId }) {
      if (tenantId) {
        const config = await prisma.tenantChannelConfig.findUnique({ where: { id } });
        if (!config || config.tenantId !== tenantId) return null;
        return config;
      }
      return prisma.channelConfig.findUnique({ where: { id } });
    },
  };
}

module.exports = createChannelConfigsRepository;
