function createTelegramDestinationsRepository({ prisma }) {
  return {
    findAll() {
      return prisma.telegramDestination.findMany({
        orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
      });
    },
  };
}

module.exports = createTelegramDestinationsRepository;
