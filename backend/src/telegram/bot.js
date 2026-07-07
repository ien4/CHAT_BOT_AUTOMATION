const TelegramBot = require('node-telegram-bot-api');
const handoff = require('./handoff');
const tenantHandoff = require('../tenants/handoff');
const getPrisma = require('../db');

let bot = null;

function init() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — Telegram handoff disabled');
    return null;
  }

  bot = new TelegramBot(token, { polling: true });

  // Inject bot instance vào handoff module
  handoff.init(bot);

  // ==================== COMMANDS ====================

  // /start — staff đăng ký / kiểm tra trạng thái
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id.toString();
    if (msg.chat.type !== 'private') return;

    try {
      const prisma = getPrisma();
      const staff = await prisma.staff.findUnique({ where: { telegramChatId: chatId } });

      if (staff) {
        bot.sendMessage(chatId,
          `👋 Chào ${staff.name}!\n\n` +
          `Trạng thái: ${staff.isOnDuty ? '🟢 Đang trực' : '🔴 Không trực'}\n\n` +
          `Dùng /duty để bật/tắt trực ban.`
        );
      } else {
        bot.sendMessage(chatId,
          `👋 Xin chào!\n\n` +
          `Chat ID của bạn là: \`${chatId}\`\n\n` +
          `Gửi ID này cho admin để được thêm vào hệ thống.`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (e) {
      bot.sendMessage(chatId, 'Lỗi kết nối hệ thống. Thử lại sau.');
    }
  });

  // /myid — lấy chat ID (để admin cấu hình)
  bot.onText(/\/myid/, (msg) => {
    if (msg.chat.type !== 'private') return;
    bot.sendMessage(msg.chat.id,
      `Chat ID của bạn: \`${msg.chat.id}\``,
      { parse_mode: 'Markdown' }
    );
  });

  // /duty — bật/tắt trực ban ngay trong Telegram
  bot.onText(/\/duty/, async (msg) => {
    const chatId = msg.chat.id.toString();
    if (msg.chat.type !== 'private') return;

    try {
      const prisma = getPrisma();
      const staff = await prisma.staff.findUnique({ where: { telegramChatId: chatId } });

      if (!staff) {
        return bot.sendMessage(chatId, '❌ Bạn chưa được đăng ký. Liên hệ admin.');
      }

      const newStatus = !staff.isOnDuty;
      await prisma.staff.update({ where: { id: staff.id }, data: { isOnDuty: newStatus } });

      bot.sendMessage(chatId,
        newStatus
          ? '🟢 Bạn đang *bật trực ban* — sẽ nhận thông báo khách hàng mới.'
          : '🔴 Bạn đã *tắt trực ban* — không nhận thêm thông báo.',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      bot.sendMessage(chatId, 'Lỗi kỹ thuật. Thử lại sau.');
    }
  });

  // /xong — kết thúc phiên handoff hiện tại
  bot.onText(/\/xong/, async (msg) => {
    if (msg.chat.type !== 'private') return;
    await handoff.endSessionByStaff(msg.chat.id.toString());
  });

  // /nhan [conversationId] — nhận conversation (fallback nếu không dùng button)
  bot.onText(/\/nhan(?:\s+(\S+))?/, async (msg, match) => {
    if (msg.chat.type !== 'private') return;
    const chatId = msg.chat.id.toString();
    const conversationId = match[1];

    if (!conversationId) {
      bot.sendMessage(chatId, 'Dùng nút ✋ trong thông báo để nhận cuộc trò chuyện.');
      return;
    }

    await handoff.claimConversation(chatId, conversationId);
  });

  // ==================== INLINE BUTTON CALLBACKS ====================

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    // Luôn answer callback để tắt loading
    bot.answerCallbackQuery(query.id).catch(() => {});

    // Owner handoff callbacks
    if (data.startsWith('claim_')) {
      await handoff.claimConversation(chatId, data.replace('claim_', ''), query);
    } else if (data.startsWith('takeover_')) {
      await handoff.takeoverConversation(chatId, data.replace('takeover_', ''));
    } else if (data.startsWith('end_')) {
      await handoff.endHumanSession(data.replace('end_', ''), 'staff_ended');

    // Tenant handoff callbacks (prefix: t)
    } else if (data.startsWith('tclaim_')) {
      await tenantHandoff.claimConversation(chatId, data.replace('tclaim_', ''), query);
    } else if (data.startsWith('ttakeover_')) {
      await tenantHandoff.takeoverConversation(chatId, data.replace('ttakeover_', ''));
    } else if (data.startsWith('tend_')) {
      await tenantHandoff.endSessionByStaff(chatId);
    }
  });

  // ==================== MESSAGE RELAY ====================

  // Tin nhắn thường từ staff trong DM → relay sang khách
  // Ưu tiên: kiểm tra tenant staff trước, sau đó owner staff
  bot.on('message', async (msg) => {
    if (msg.chat.type !== 'private') return;
    if (!msg.text) return;
    if (msg.text.startsWith('/')) return;

    const chatId = msg.chat.id.toString();
    const prisma = getPrisma();

    // Kiểm tra có phải TenantStaff không
    const isTenantStaff = await prisma.tenantStaff.findFirst({
      where: { telegramChatId: chatId, isActive: true },
    }).catch(() => null);

    if (isTenantStaff) {
      await tenantHandoff.relayStaffMessage(chatId, msg.text);
    } else {
      await handoff.relayStaffMessage(chatId, msg.text);
    }
  });

  // ==================== ERROR HANDLING ====================

  bot.on('polling_error', (error) => {
    console.error('[Telegram] Polling error:', error.message);
  });

  bot.on('error', (error) => {
    console.error('[Telegram] Bot error:', error.message);
  });

  console.log('✅ Telegram bot started (polling)');
  return bot;
}

function getBot() {
  return bot;
}

module.exports = { init, getBot };
