function createGetStats({ dashboardStatsRepository }) {
  return async function getStats(req, res) {
    try {
      const stats = await dashboardStatsRepository.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Lỗi máy chủ nội bộ' });
    }
  };
}

module.exports = {
  createGetStats,
};
