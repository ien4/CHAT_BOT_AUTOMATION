function getWebhookSettings(req, res) {
  res.json({
    verifyToken: process.env.FB_VERIFY_TOKEN ? '***configured***' : null,
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN ? '***configured***' : null,
    appSecret: process.env.FB_APP_SECRET ? '***configured***' : null,
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`,
  });
}

function createGetTelegramDestinations({ prisma }) {
  return async function getTelegramDestinations(req, res) {
    try {
      const destinations = await prisma.telegramDestination.findMany({
        orderBy: [{ purpose: 'asc' }, { name: 'asc' }],
      });
      res.json({
        destinations,
        envFallback: {
          statusGroupIdConfigured: Boolean(process.env.TELEGRAM_STATUS_GROUP_ID),
        },
      });
    } catch (error) {
      console.error('Failed to list Telegram destinations:', error);
      res.status(500).json({ error: 'Failed to list Telegram destinations' });
    }
  };
}

module.exports = {
  createGetTelegramDestinations,
  getWebhookSettings,
};
