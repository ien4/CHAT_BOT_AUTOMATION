const MANAGER_CHAT_ID = process.env.TELEGRAM_MANAGER_CHAT_ID;

async function send(text) {
  if (!MANAGER_CHAT_ID) return;

  // Lazy require để tránh circular dependency: handoff → telegramManager → bot → handoff
  const { getBot } = require('../telegram/bot');
  const bot = getBot();
  if (!bot) return;

  try {
    await bot.sendMessage(MANAGER_CHAT_ID, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[ManagerNotify] Failed to send:', err.message);
  }
}

module.exports = { send };
