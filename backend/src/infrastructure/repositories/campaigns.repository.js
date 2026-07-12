function createCampaignsRepository({ prisma }) {
  return {
    findMany() {
      return prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
      });
    },

    findById({ id }) {
      return prisma.campaign.findUnique({ where: { id } });
    },
  };
}

module.exports = createCampaignsRepository;
