function createAdminUsersRepository({ prisma }) {
  return {
    findMany() {
      return prisma.adminUser.findMany({
        select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    },
  };
}

module.exports = createAdminUsersRepository;
