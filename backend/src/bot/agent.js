const getPrisma = require('../db');
const prisma = getPrisma();
const llmFactory = require('../llm/factory');
const { CLAUDE_TOOLS, OPENAI_TOOLS, executeTool } = require('./tools');
const { routeMessage, formatToolResult } = require('./router');
const alertQueue = require('../notifications/alertQueue');
const formatters = require('../notifications/formatters');

const TOOL_DEFS = { claudeTools: CLAUDE_TOOLS, openaiTools: OPENAI_TOOLS };

/**
 * AI Agent
 * LLM acts as the decision-maker: reads conversation, decides which tools to call,
 * executes them, and generates the final reply — no hardcoded dialog flow needed.
 */
class BotAgent {
  /**
   * Process an incoming message through the agent loop.
   *
   * @param {string} senderId   - Facebook PSID
   * @param {string} messageText
   * @param {object} options    - {
   *   skipSaveInbound: bool,
   *   channel: string,            // facebook | web | whatsapp | unknown
   *   pageContext: object|null,   // { currentUrl, pageTitle } — web only
   *   knowledgeFilter: string[],  // filter RAG theo tags của channel
   *   botPersonaOverride: string  // override identity prompt cho channel này
   * }
   * @returns {Promise<string>} - final text response
   */
  async processMessage(senderId, messageText, options = {}) {
    const {
      channel = 'unknown',
      pageContext = null,
      knowledgeFilter = [],
      botPersonaOverride = null,
      tenantId = null,
      pageAccessToken = null,
    } = options;

    try {
      // 1. Get or create conversation
      const conversation = await this.getOrCreateConversation(senderId, tenantId);

      // 2. Save inbound message
      if (!options.skipSaveInbound) {
        await this.saveMessage(conversation.id, 'inbound', messageText);
      }

      // 2.5. Rate limit: max 30 messages per hour per user
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await prisma.message.count({
        where: { conversationId: conversation.id, direction: 'inbound', createdAt: { gte: oneHourAgo } },
      });
      if (recentCount > 30) {
        return 'Bạn đã gửi quá nhiều tin nhắn trong giờ qua. Vui lòng thử lại sau ít phút nhé! 😊';
      }

      // 3. Typing indicator (fire-and-forget, chỉ FB)
      if (channel === 'facebook' || channel === 'unknown') {
        this._sendTyping(senderId, pageAccessToken).catch(() => {});
      }

      // 4. Build message history and route deterministic tool intents.
      const dbHistory = await this.buildHistory(conversation.id);
      const messages = this.toLlmMessages(dbHistory);
      const context = { conversation, knowledgeFilter, tenantId };
      const route = await routeMessage(messageText, dbHistory, messages);

      if (route.directTool) {
        const directInput = route.directTool === 'get_content_package'
          ? { query: messageText }
          : {};
        const directResult = await executeTool(route.directTool, directInput, context);
        const directText = formatToolResult(route.directTool, directResult);

        if (directText) {
          await this.saveMessage(conversation.id, 'outbound', directText);
          await this.updateCustomerMemory(conversation, messageText, directText);
          return directText;
        }
      }

      // 5. Build system prompt (với channel context + pageContext)
      const systemPrompt = await this.buildSystemPrompt(conversation, {
        channel,
        pageContext: pageContext || conversation.pageContext,
        botPersonaOverride,
        tenantId,
      });

      // 6. Run agent loop
      const boundExecute = (name, input) => executeTool(name, input, context);

      const response = await llmFactory.generateWithTools(
        systemPrompt,
        messages,
        boundExecute,
        TOOL_DEFS
      );

      const finalText = response?.trim() ||
        'Xin lỗi, mình chưa hiểu ý bạn. Bạn có thể nói rõ hơn được không ạ?';

      // 7. Save outbound message
      await this.saveMessage(conversation.id, 'outbound', finalText);

      // 8. Update customer memory
      await this.updateCustomerMemory(conversation, messageText, finalText);

      return finalText;
    } catch (error) {
      console.error('Agent error:', error);
      await alertQueue.alert('agent_error', formatters.botError(error.message, `sender: ${senderId}`));
      return 'Xin lỗi, mình gặp chút sự cố kỹ thuật. Bạn vui lòng thử lại sau ít phút nhé!';
    }
  }

  /**
   * Convert DB message history to LLM messages array.
   * Uses a provider-neutral format: [{ role: 'user'|'assistant', content: string }]
   * Both Claude and DeepSeek accept this format.
   */
  async buildMessages(conversationId) {
    const dbMessages = await this.buildHistory(conversationId);
    return this.toLlmMessages(dbMessages);
  }

  async buildHistory(conversationId) {
    const dbMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { direction: true, content: true },
    });
    dbMessages.reverse(); // restore chronological order for LLM
    return dbMessages;
  }

  toLlmMessages(dbMessages) {
    const messages = [];
    for (const m of dbMessages) {
      const role = m.direction === 'inbound' ? 'user' : 'assistant';
      // Merge consecutive same-role messages (e.g., multiple outbound in a row)
      if (messages.length > 0 && messages[messages.length - 1].role === role) {
        messages[messages.length - 1].content += '\n' + m.content;
      } else {
        messages.push({ role, content: m.content });
      }
    }

    return messages;
  }

  /**
   * Build the agent system prompt.
   * Loads identity prompt from DB and appends tool-use instructions + channel context.
   *
   * @param {object} conversation
   * @param {object} opts - { channel, pageContext, botPersonaOverride }
   */
  async buildSystemPrompt(conversation, opts = {}) {
    const { channel = 'unknown', pageContext = null, botPersonaOverride = null, tenantId = null } = opts;

    // Identity: override của channel → tenant-specific → global
    let identity;
    if (botPersonaOverride) {
      identity = botPersonaOverride;
    } else {
      let identityTemplate = null;
      if (tenantId) {
        identityTemplate = await prisma.promptTemplate.findFirst({
          where: { layer: 'identity', isActive: true, tenantId },
        });
      }
      if (!identityTemplate) {
        identityTemplate = await prisma.promptTemplate.findFirst({
          where: { layer: 'identity', isActive: true, tenantId: null },
        });
      }
      identity = identityTemplate?.systemPrompt ||
        'Bạn là trợ lý ảo thân thiện. Hãy trả lời bằng tiếng Việt.';
    }

    // Guardrails: tenant-specific → global (quản lý từ dashboard)
    let guardrailsTemplate = null;
    if (tenantId) {
      guardrailsTemplate = await prisma.promptTemplate.findFirst({
        where: { layer: 'guardrails', isActive: true, tenantId },
      });
    }
    if (!guardrailsTemplate) {
      guardrailsTemplate = await prisma.promptTemplate.findFirst({
        where: { layer: 'guardrails', isActive: true, tenantId: null },
      });
    }
    const guardrailsSection = guardrailsTemplate
      ? '\n\n' + guardrailsTemplate.systemPrompt
      : '';

    const today = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit',
    });

    // Customer memory
    const memory = conversation.context?.customerMemory?.summary;
    const memorySection = memory
      ? `\n\nGhi nhớ về khách hàng này:\n${memory}`
      : '';

    // Channel context — giúp bot biết mình đang phục vụ trên kênh nào
    const channelLabels = {
      facebook: 'Facebook Messenger',
      web: 'Website Live Chat',
      whatsapp: 'WhatsApp',
      email: 'Email',
    };
    const channelLabel = channelLabels[channel] || 'không xác định';
    const channelSection = `\nKênh hiện tại: ${channelLabel}`;

    // Page context — chỉ có khi khách chat từ website
    const pageSection = pageContext?.currentUrl
      ? `\nKhách đang xem trang: ${pageContext.currentUrl}${pageContext.pageTitle ? ` (${pageContext.pageTitle})` : ''}\n→ Ưu tiên trả lời liên quan đến nội dung trang này.`
      : '';

    const toolInstructions = `

---

## Hướng dẫn sử dụng tools

Hôm nay: ${today}

Bạn có các tools sau — chỉ gọi khi thực sự cần, không gọi khi chưa chắc chắn nhu cầu:

- **search_knowledge**: tìm thông tin dịch vụ, giá, công ty trong kho kiến thức
- **get_content_package**: lấy prompt, template, tài liệu, nội dung marketing từ kho
- **create_appointment**: tạo lịch hẹn tư vấn — cần đủ tên, SĐT, ngày, giờ
- **check_appointment**: xem lịch hẹn hiện tại của khách
- **cancel_appointment**: hủy lịch hẹn
- **reschedule_appointment**: dời lịch sang ngày/giờ mới
- **update_appointment**: sửa tên hoặc SĐT trên lịch hẹn

**Nguyên tắc xử lý:**

Quyết định gọi tool:
- Câu hỏi đủ rõ → gọi tool ngay, không hỏi thêm
- Câu hỏi quá mơ hồ ("có gì không", "cho xem đi") → hỏi 1 câu ngắn duy nhất để làm rõ

Sau khi có kết quả tool:
- search_knowledge: tự soạn câu trả lời ngắn gọn; không paste nguyên văn
- get_content_package: 1 kết quả → cung cấp luôn; nhiều kết quả → liệt kê tên và hỏi 1 câu để khách chọn
- check/cancel/reschedule/update appointment: xác nhận lại với khách sau khi thực hiện

**Đặt lịch hẹn:**
- Thu thập lần lượt từng thông tin còn thiếu (tên → SĐT → ngày → giờ), KHÔNG hỏi hàng loạt
- Xác nhận 1 lần trước khi gọi create_appointment; khách đồng ý thì tạo ngay
- "sửa lịch / đổi ngày / dời lịch" → reschedule_appointment (KHÔNG hủy rồi đặt lại)
- "hủy lịch" → cancel_appointment

**Về ngày giờ:** tự quy đổi "thứ 6 / tuần sau / ngày mai / 8h sáng / 2 giờ chiều" sang YYYY-MM-DD / HH:MM

Trả lời ngắn gọn, tự nhiên, thân thiện bằng tiếng Việt${guardrailsSection}${memorySection}`;

    return identity + channelSection + pageSection + toolInstructions;
  }

  async getOrCreateConversation(senderId, tenantId = null, pageAccessToken = null) {
    let conversation = await prisma.conversation.findFirst({
      where: { fbUserId: senderId, tenantId: tenantId ?? null },
    });

    if (!conversation) {
      let userName = null;
      try {
        const axios = require('axios');
        const res = await axios.get(`https://graph.facebook.com/v19.0/${senderId}`, {
          params: { fields: 'first_name,last_name', access_token: pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN },
        });
        const p = res.data;
        userName = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : null;
      } catch (_) {
        userName = `User_${senderId.substring(0, 8)}`;
      }

      conversation = await prisma.conversation.create({
        data: { fbUserId: senderId, fbUserName: userName || 'Unknown', status: 'active', context: {}, tenantId: tenantId ?? null },
      });
      console.log(`👤 New conversation: ${senderId} (${userName || 'Unknown'})${tenantId ? ` [tenant:${tenantId}]` : ''}`);
    }

    return conversation;
  }

  async saveMessage(conversationId, direction, content) {
    return prisma.message.create({
      data: { conversationId, direction, content },
    });
  }

  async updateCustomerMemory(conversation, userMessage, botResponse) {
    // Only update every 5 inbound messages to reduce LLM calls by ~80%
    const msgCount = await prisma.message.count({
      where: { conversationId: conversation.id, direction: 'inbound' },
    });
    if (msgCount % 5 !== 0) return;

    const existing = conversation.context?.customerMemory || null;
    const previous = existing?.summary || '';

    try {
      const systemPrompt = [
        'Bạn là bộ ghi nhớ CRM cho chatbot.',
        'Cập nhật bản tóm tắt ngắn về khách hàng dựa trên lượt trao đổi mới.',
        'Chỉ lưu thông tin hữu ích: nhu cầu, dịch vụ quan tâm, tên/SĐT/email nếu khách cung cấp, trạng thái lịch hẹn.',
        'Trả về tiếng Việt, tối đa 100 từ, dạng gạch đầu dòng ngắn.',
      ].join('\n');

      const userPrompt = [
        `Ghi nhớ cũ:\n${previous || '(chưa có)'}`,
        `Khách vừa nói:\n${userMessage}`,
        `Bot vừa trả lời:\n${botResponse}`,
        'Hãy trả về ghi nhớ đã cập nhật.',
      ].join('\n\n');

      const summary = await llmFactory.generate(systemPrompt, userPrompt, null);
      const cleaned = String(summary || '').trim();
      if (!cleaned || cleaned.startsWith('Xin lỗi')) return;

      const mergedContext = {
        ...(conversation.context || {}),
        customerMemory: { summary: cleaned.slice(0, 1000), updatedAt: new Date().toISOString() },
      };

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { context: mergedContext },
      });
    } catch (err) {
      console.warn('Customer memory update failed:', err.message);
    }
  }

  async _sendTyping(senderId, accessToken = null) {
    const axios = require('axios');
    await axios.post(
      'https://graph.facebook.com/v19.0/me/messages',
      { recipient: { id: senderId }, sender_action: 'typing_on' },
      { params: { access_token: accessToken || process.env.FB_PAGE_ACCESS_TOKEN } }
    );
  }
}

const instance = new BotAgent();

module.exports = instance;
module.exports.getOrCreateConversation = instance.getOrCreateConversation.bind(instance);
module.exports.saveMessage = instance.saveMessage.bind(instance);
