function createDashboardStatsRepository({ prisma }) {
  return {
    async getDashboardStats() {
      const [
        totalConversations,
        activeConversations,
        totalMessages,
        totalAppointments,
        pendingAppointments,
        knowledgeCount,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { status: 'active' } }),
        prisma.message.count(),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: 'pending' } }),
        prisma.knowledgeBase.count({ where: { isActive: true } }),
      ]);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentMessages = await prisma.message.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const messagesByDay = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        messagesByDay[key] = 0;
      }
      recentMessages.forEach(m => {
        const key = m.createdAt.toISOString().split('T')[0];
        messagesByDay[key] = (messagesByDay[key] || 0) + 1;
      });

      const intentStats = await prisma.message.groupBy({
        by: ['intent'],
        where: { direction: 'inbound', intent: { not: null } },
        _count: true,
      });

      return {
        totalConversations,
        activeConversations,
        totalMessages,
        totalAppointments,
        pendingAppointments,
        knowledgeCount,
        messagesByDay: Object.entries(messagesByDay).map(([date, count]) => ({ date, count })),
        intentDistribution: intentStats.map(i => ({ intent: i.intent, count: i._count })),
      };
    },
  };
}

module.exports = createDashboardStatsRepository;
