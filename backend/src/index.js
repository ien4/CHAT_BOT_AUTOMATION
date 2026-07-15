require('dotenv').config();
const { createApp } = require('./app');
const tenantHandoff = require('./tenants/handoff');
const facebookMenu = require('./facebook/menu');
const telegramBot = require('./telegram/bot');
const healthChecker = require('./notifications/healthChecker');
const dailyReport = require('./notifications/dailyReport');
const alertQueue = require('./notifications/alertQueue');
const formatters = require('./notifications/formatters');

const getPrisma = require('./db');
const { isProduction, isPlaceholderSecret } = require('./infrastructure/services/config');
const { seedDefaults } = require('./bootstrap/seedDefaults');
const prisma = getPrisma();

/**
 * Safe bootstrap flag: khi `BOOTSTRAP_SKIP_EXTERNAL=true`, server vẫn start để
 * smoke route nhưng KHÔNG gọi Facebook/Telegram/notification startup. Mặc định
 * (không đặt flag) giữ nguyên behavior runtime cũ.
 */
function shouldSkipExternalBootstrap() {
  return process.env.BOOTSTRAP_SKIP_EXTERNAL === 'true';
}

// App creation is side-effect free (see ./app). Startup side effects (DB connect,
// seed, Facebook/Telegram/notification startup, listen) live in start() below and
// only run when this file is the runtime entrypoint (require.main === module).
const app = createApp();

// Production auth safety: từ chối khởi động nếu secret auth yếu/thiếu.
// Local/dev không bị ảnh hưởng (chỉ enforce khi NODE_ENV=production).
function assertProductionAuthEnv() {
  if (!isProduction()) return;
  const weak = ['JWT_SECRET', 'ADMIN_PASSWORD'].filter((name) => isPlaceholderSecret(process.env[name]));
  if (weak.length > 0) {
    console.error(`FATAL: production yêu cầu ${weak.join(', ')} đặt giá trị mạnh (không để trống/placeholder/mặc định yếu). Dừng khởi động.`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    assertProductionAuthEnv();

    await prisma.$connect();
    console.log('✅ Database connected');

    // Reset stale handoff states từ lần chạy trước (in-memory timers đã mất)
    const staleCount = await prisma.conversation.updateMany({
      where: { handoffStatus: { in: ['human_active', 'pending_human'] } },
      data: { handoffStatus: 'bot', assignedStaffId: null, humanSessionExpiresAt: null },
    });
    if (staleCount.count > 0) {
      console.log(`🔄 Reset ${staleCount.count} stale handoff conversation(s) to bot mode`);
    }

    // Seed default data if needed
    await seedDefaults(prisma);

    const skipExternal = shouldSkipExternalBootstrap();

    // Setup Facebook Messenger Profile (menu + get_started + greeting) trong 1 call.
    // Bỏ qua khi BOOTSTRAP_SKIP_EXTERNAL=true (smoke an toàn, không gọi Facebook).
    if (skipExternal) {
      console.log('⏭️  BOOTSTRAP_SKIP_EXTERNAL=true → bỏ qua Facebook Messenger Profile setup');
    } else {
      const defaultGreeting = 'Xin chào! 👋 Mình là trợ lý ảo. Bạn cần hỗ trợ:\n• Thông tin công ty\n• Dịch vụ & báo giá\n• Đặt lịch tư vấn\n• Tài liệu chiến dịch';
      await facebookMenu.setupAllPages(defaultGreeting);
    }

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`🖥️  Dashboard API: http://localhost:${PORT}/api`);

      // Telegram/notification startup: bỏ qua khi BOOTSTRAP_SKIP_EXTERNAL=true.
      if (skipExternal) {
        console.log('⏭️  BOOTSTRAP_SKIP_EXTERNAL=true → bỏ qua Telegram/notification startup');
        return;
      }

      // Chỉ process bind được port backend mới được polling Telegram.
      // Tránh instance thừa gây lỗi 409 Conflict từ getUpdates.
      const tgBotInstance = telegramBot.init();
      if (tgBotInstance) tenantHandoff.init(tgBotInstance);

      // Khởi động notification services sau khi bot đã init
      setTimeout(() => {
        healthChecker.start();
        dailyReport.start();
      }, 3000);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Skip starting duplicate backend instance.`);
      } else {
        console.error('Server listen error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers — alert quản lý khi có lỗi nghiêm trọng.
// Chỉ đăng ký khi chạy như runtime entrypoint để import test/smoke không gắn
// process handler global ngoài ý muốn.
function registerProcessHandlers() {
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught Exception:', err);
    try {
      await alertQueue.alert('uncaught_exception', formatters.uncaughtException(err.message));
    } catch (_) {}
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    console.error('Unhandled Rejection:', reason);
    try {
      await alertQueue.alert('unhandled_rejection', formatters.uncaughtException(`UnhandledRejection: ${msg}`));
    } catch (_) {}
  });
}

// Runtime entrypoint: chỉ start server + side effects khi file được chạy trực tiếp
// (`node src/index.js`), không khi bị require trong test/smoke.
if (require.main === module) {
  registerProcessHandlers();
  start();
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.start = start;
