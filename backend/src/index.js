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
const prisma = getPrisma();

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
    await seedDefaults();

        // Setup Facebook Messenger Profile (menu + get_started + greeting) trong 1 call
    const defaultGreeting = 'Xin chào! 👋 Mình là trợ lý ảo. Bạn cần hỗ trợ:\n• Thông tin công ty\n• Dịch vụ & báo giá\n• Đặt lịch tư vấn\n• Tài liệu chiến dịch';
    await facebookMenu.setupAllPages(defaultGreeting);

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`🖥️  Dashboard API: http://localhost:${PORT}/api`);

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

async function seedDefaults() {
  const bcrypt = require('bcryptjs');

  // Seed/sync admin user
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const existingAdmin = await prisma.adminUser.findUnique({ where: { username: adminUsername } });

  if (!existingAdmin) {
    // Không seed bằng mật khẩu mẫu; local/staging/production đều phải cấu hình ADMIN_PASSWORD.
    const seedPassword = process.env.ADMIN_PASSWORD;
    if (!seedPassword) {
      console.error('FATAL: thiếu ADMIN_PASSWORD để tạo admin ban đầu.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(seedPassword, 10);
    await prisma.adminUser.create({
      data: { username: adminUsername, passwordHash: hash, role: 'admin' },
    });
    console.log('✅ Admin user created');
  } else if (!isProduction() && process.env.ADMIN_PASSWORD) {
    // Local/dev self-heal: nếu ADMIN_PASSWORD env đã đổi và không khớp hash cũ,
    // đồng bộ lại để login local hoạt động. KHÔNG bao giờ tự reset ở production.
    const matches = await bcrypt.compare(process.env.ADMIN_PASSWORD, existingAdmin.passwordHash);
    if (!matches) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await prisma.adminUser.update({ where: { id: existingAdmin.id }, data: { passwordHash: hash } });
      console.log('🔄 Local admin password re-synced from ADMIN_PASSWORD (dev only)');
    }
  }

  // Seed default LLM providers
  const providerCount = await prisma.llmProvider.count();
  if (providerCount === 0) {
    const defaultProviders = [
      {
        name: 'Google Gemini',
        apiKeyEncrypted: process.env.GEMINI_API_KEY || 'placeholder',
        modelName: 'gemini-2.0-flash',
        maxTokens: 2048,
        temperature: 0.7,
        isEnabled: true,
        priority: 1,
      },
      {
        name: 'DeepSeek',
        apiKeyEncrypted: process.env.DEEPSEEK_API_KEY || 'placeholder',
        modelName: 'deepseek-chat',
        maxTokens: 2048,
        temperature: 0.7,
        isEnabled: true,
        priority: 2,
      },
      {
        name: 'Claude',
        apiKeyEncrypted: process.env.CLAUDE_API_KEY || 'placeholder',
        modelName: 'claude-3-haiku-20240307',
        maxTokens: 2048,
        temperature: 0.7,
        isEnabled: false,
        priority: 3,
      },
    ];
    for (const provider of defaultProviders) {
      await prisma.llmProvider.create({ data: provider });
    }
    console.log('✅ Default LLM providers created');
  }

  // Seed default prompt templates
  const templateCount = await prisma.promptTemplate.count();
  if (templateCount === 0) {
    const defaultTemplates = [
      {
        name: 'Company Info',
        intentType: 'company_info',
        systemPrompt: `Bạn là trợ lý ảo thân thiện của công ty. Nhiệm vụ của bạn là trả lời các câu hỏi về thông tin công ty một cách chuyên nghiệp, chính xác.

Hãy sử dụng thông tin dưới đây để trả lời:

{{KNOWLEDGE_CONTEXT}}

Quy tắc:
- Trả lời ngắn gọn, thân thiện bằng tiếng Việt
- Nếu không có thông tin, hãy nói thật rằng bạn chưa có thông tin đó và đề nghị khách liên hệ trực tiếp
- Luôn giữ thái độ tích cực, chuyên nghiệp`,
        userPromptTemplate: `Người dùng hỏi: {{USER_MESSAGE}}

Hãy trả lời dựa trên thông tin công ty được cung cấp.`,
        isActive: true,
      },
      {
        name: 'Service Inquiry',
        intentType: 'service_inquiry',
        systemPrompt: `Bạn là trợ lý tư vấn thân thiện của công ty. Nhiệm vụ của bạn là tư vấn về dịch vụ và dẫn dắt khách hàng đến cuộc hẹn tư vấn.

Thông tin dịch vụ:
{{KNOWLEDGE_CONTEXT}}

Quy tắc quan trọng:
1. Trả lời tự nhiên, thân thiện bằng tiếng Việt
2. Hỏi thêm 1-2 câu để hiểu rõ nhu cầu của khách
3. KHÔNG đưa giá trực tiếp - hãy mời họ gặp chuyên viên tư vấn
4. Gợi ý đặt lịch hẹn tư vấn miễn phí một cách tự nhiên
5. Nếu khách quan tâm, hỏi thông tin: tên, số điện thoại, thời gian phù hợp`,
        userPromptTemplate: `Người dùng hỏi về dịch vụ: {{USER_MESSAGE}}

Lịch sử hội thoại gần đây:
{{CONVERSATION_HISTORY}}

Hãy tư vấn và dẫn dắt phù hợp.`,
        isActive: true,
      },
      {
        name: 'Campaign',
        intentType: 'campaign',
        systemPrompt: `Bạn là trợ lý hỗ trợ chiến dịch truyền thông. Người dùng đang hỏi về tài liệu, prompt, hoặc thông tin liên quan đến chiến dịch.

Thông tin chiến dịch:
{{CAMPAIGN_CONTEXT}}

Quy tắc:
1. Tương tác với người dùng để làm rõ họ đang cần thông tin gì
2. Hỏi cụ thể: họ cần prompt của hình ảnh nào? Đang ở giai đoạn nào của chiến dịch?
3. Cung cấp thông tin chính xác từ tài liệu chiến dịch
4. Nếu cần thêm thông tin, hãy hỏi lại để làm rõ`,
        userPromptTemplate: `Người dùng hỏi: {{USER_MESSAGE}}

Lịch sử hội thoại:
{{CONVERSATION_HISTORY}}

Hãy tương tác để làm rõ nhu cầu.`,
        isActive: true,
      },
      {
        name: 'Email B2B',
        intentType: 'email_b2b',
        systemPrompt: `Bạn là chuyên gia viết email B2B chuyên nghiệp, lịch sự và thuyết phục.

Dịch vụ cần chào bán:
- Thiết kế website khách sạn (đặt phòng online, giao diện đẹp, tốc độ nhanh, tích hợp OTA)
- Phòng công nghệ cho doanh nghiệp (setup hạ tầng IT, thiết bị, giải pháp văn phòng thông minh)

Thông tin website của khách hàng tôi cung cấp:
{{WEBSITE_ANALYSIS}}

Dựa vào phân tích trên, hãy viết 1 email với yêu cầu:
- Mở đầu: Đề cập cụ thể 1-2 điểm YẾU hoặc CƠ HỘI cải thiện quan sát được từ website của họ (không nói chung chung)
- Thân: Giới thiệu ngắn gọn dịch vụ phù hợp nhất với vấn đề đó
- Kết: Đề nghị cuộc gặp 15-20 phút, đưa ra 2 khung giờ cụ thể để họ chọn
- Tone: Chuyên nghiệp, không spam, không quá ca ngợi bản thân
- Độ dài: Tối đa 200 từ
- Ngôn ngữ: Tiếng Việt

Chỉ viết nội dung email, không giải thích thêm.`,
        userPromptTemplate: `Người dùng yêu cầu viết email với phân tích website: {{USER_MESSAGE}}

Hãy viết email B2B chuyên nghiệp theo đúng yêu cầu.`,
        isActive: true,
      },
      {
        name: 'Zalo B2B',
        intentType: 'zalo_b2b',
        systemPrompt: `Bạn là trợ lý viết tin nhắn Zalo B2B — ngắn, tự nhiên, không có mùi spam.

Dịch vụ cần chào bán:
- Thiết kế website khách sạn
- Phòng công nghệ cho doanh nghiệp

Thông tin website của khách hàng tôi cung cấp:
{{WEBSITE_ANALYSIS}}

Viết 1 tin nhắn Zalo cá nhân với yêu cầu:
- Mở đầu bằng tên/tên công ty họ (lấy từ phân tích website)
- Nhắc đúng 1 vấn đề cụ thể thấy trên website của họ — đừng nói chung chung
- Giới thiệu mình là ai, làm gì — 1 câu thôi
- Hỏi xin 10 phút nói chuyện, không ép
- Tone: Như người quen nhắn, không formal quá, không dùng "kính gửi", không dùng bullet point
- Độ dài: Tối đa 5-6 câu
- Ngôn ngữ: Tiếng Việt, thân thiện tự nhiên

Chỉ viết nội dung tin nhắn, không giải thích thêm.`,
        userPromptTemplate: `Người dùng yêu cầu viết tin nhắn Zalo với phân tích website: {{USER_MESSAGE}}

Hãy viết tin nhắn Zalo B2B ngắn gọn, tự nhiên theo đúng yêu cầu.`,
        isActive: true,
      },
      {
        name: 'General Fallback',
        intentType: 'fallback',
        systemPrompt: `Bạn là trợ lý ảo thân thiện. Hãy trả lời câu hỏi của người dùng một cách tự nhiên bằng tiếng Việt.

{{KNOWLEDGE_CONTEXT}}

Nếu câu hỏi nằm ngoài phạm vi kiến thức, hãy lịch sự cho biết và đề nghị họ liên hệ trực tiếp công ty.`,
        userPromptTemplate: `Người dùng nói: {{USER_MESSAGE}}`,
        isActive: true,
      },
    ];
    for (const template of defaultTemplates) {
      await prisma.promptTemplate.create({ data: template });
    }
    console.log('✅ Default prompt templates created');
  }

  // Seed Bot Identity prompt (layer = "identity")
  const identityCount = await prisma.promptTemplate.count({
    where: { layer: 'identity' },
  });
  if (identityCount === 0) {
    await prisma.promptTemplate.create({
      data: {
        name: 'Bot Identity',
        layer: 'identity',
        intentType: 'identity',
        systemPrompt: `Bạn là trợ lý ảo thân thiện của công ty.

Phong cách:
- Trả lời bằng tiếng Việt, thân thiện, tự nhiên
- Ngắn gọn — tối đa 3-4 câu mỗi lượt
- Không bịa thông tin không có trong tài liệu được cung cấp
- Khi không biết, lịch sự đề nghị khách liên hệ trực tiếp công ty

Kiến thức:
{{KNOWLEDGE_CONTEXT}}`,
        userPromptTemplate: `{{USER_MESSAGE}}`,
        isActive: true,
      },
    });
    console.log('✅ Bot Identity prompt created');
  }

  // Seed default HandoffSettings (singleton)
  const handoffExists = await prisma.handoffSetting.findUnique({
    where: { id: 'singleton' },
  });
  if (!handoffExists) {
    await prisma.handoffSetting.create({
      data: {
        id: 'singleton',
        pendingTimeoutSeconds: 30,
        sessionTimeoutSeconds: 30,
        offHoursPendingTimeout: 10,
        workHoursStart: 8,
        workHoursEnd: 22,
      },
    });
    console.log('✅ Default HandoffSettings created');
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
