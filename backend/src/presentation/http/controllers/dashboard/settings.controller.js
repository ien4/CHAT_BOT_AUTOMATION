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

function createGetHandoffSettings({ prisma }) {
  return async function getHandoffSettings(req, res) {
    try {
      let settings = await prisma.handoffSetting.findUnique({ where: { id: 'singleton' } });
      if (!settings) {
        settings = await prisma.handoffSetting.create({
          data: { id: 'singleton', pendingTimeoutSeconds: 30, sessionTimeoutSeconds: 30, offHoursPendingTimeout: 10, workHoursStart: 8, workHoursEnd: 22 },
        });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function createPutHandoffSettings({ prisma }) {
  return async function putHandoffSettings(req, res) {
    try {
      const { pendingTimeoutSeconds, sessionTimeoutSeconds, offHoursPendingTimeout, workHoursStart, workHoursEnd } = req.body;
      const settings = await prisma.handoffSetting.upsert({
        where: { id: 'singleton' },
        update: { pendingTimeoutSeconds, sessionTimeoutSeconds, offHoursPendingTimeout, workHoursStart, workHoursEnd },
        create: { id: 'singleton', pendingTimeoutSeconds: pendingTimeoutSeconds ?? 30, sessionTimeoutSeconds: sessionTimeoutSeconds ?? 30, offHoursPendingTimeout: offHoursPendingTimeout ?? 10, workHoursStart, workHoursEnd },
      });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update handoff settings' });
    }
  };
}

module.exports = {
  createGetTelegramDestinations,
  createGetHandoffSettings,
  createPutHandoffSettings,
  getWebhookSettings,
};
