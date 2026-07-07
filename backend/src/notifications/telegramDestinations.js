const getPrisma = require('../db');

const prisma = getPrisma();

function dashboardUrl(path = '/dashboard/appointments') {
  const base = process.env.DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${String(base).replace(/\/$/, '')}${path}`;
}

async function getStatusChatIds() {
  try {
    const destinations = await prisma.telegramDestination.findMany({
      where: { purpose: 'status', isActive: true },
      select: { chatId: true },
    });
    if (destinations.length > 0) return destinations.map((destination) => destination.chatId);
  } catch (error) {
    console.error('[TelegramDestinations] Failed to load status destinations:', error.message);
  }

  return process.env.TELEGRAM_STATUS_GROUP_ID ? [process.env.TELEGRAM_STATUS_GROUP_ID] : [];
}

async function sendStatus(text, options = {}) {
  const { getBot } = require('../telegram/bot');
  const bot = getBot();
  if (!bot) return;

  const chatIds = await getStatusChatIds();
  if (chatIds.length === 0) return;

  await Promise.allSettled(chatIds.map((chatId) => (
    bot.sendMessage(chatId, text, options)
  )));
}

module.exports = {
  dashboardUrl,
  sendStatus,
};
