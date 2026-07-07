/**
 * Bot Engine — thin routing layer
 *
 * Text messages → agent.processMessage() (LLM tool-calling agent)
 * Postbacks     → handled here for non-conversational actions (handoff, menus)
 *               → conversational postbacks forwarded as text to agent
 */

const agent = require('./agent');
const getPrisma = require('../db');
const prisma = getPrisma();

class BotEngine {
  /**
   * Process an incoming text message via the AI agent.
   */
  async processMessage(senderId, messageText, options = {}) {
    return agent.processMessage(senderId, messageText, options);
  }

  /**
   * Handle postback events (button / quick-reply clicks).
   * Non-conversational payloads (content browsing) are still handled directly.
   * Conversational payloads (BOOK_APPOINTMENT, confirm, etc.) are forwarded as
   * natural text to the agent so it can handle them in context.
   */
  async processPostback(senderId, payload, options = {}) {
    try {
      const { tenantId = null } = options;
      const conversation = await agent.getOrCreateConversation(senderId, tenantId);

      console.log(`🔘 Postback: ${payload} from ${senderId}`);

      // ContentPackage browsing — no LLM needed
      if (payload.startsWith('PKG_')) {
        return this.handleContentPackageItems(payload.replace('PKG_', ''), senderId);
      }
      if (payload.startsWith('ITEM_')) {
        return this.handleContentPackageItemDetail(payload.replace('ITEM_', ''));
      }

      // Map postback payloads → natural language the agent understands
      const payloadToText = {
        BOOK_APPOINTMENT:    'Tôi muốn đặt lịch tư vấn',
        CONFIRM_APPOINTMENT: 'Xác nhận đặt lịch',
        CANCEL_APPOINTMENT:  'Hủy đặt lịch',
        LIST_SERVICES:       'Cho tôi xem danh sách dịch vụ',
        COMPANY_INFO:        'Thông tin về công ty',
        CAMPAIGN_DETAILS:    'Xem các gói nội dung',
        CONTENT_PACKAGES:    'Xem các gói nội dung',
        REQUEST_DOCS:        'Tôi cần tài liệu',
        REQUEST_PROMPT:      'Tôi cần prompt hình ảnh',
      };

      if (payload.startsWith('DATE_')) {
        const date = payload.replace('DATE_', '');
        return agent.processMessage(senderId, `Tôi chọn ngày ${date}`, { skipSaveInbound: false, tenantId });
      }
      if (payload.startsWith('TIME_')) {
        const time = payload.replace('TIME_', '');
        return agent.processMessage(senderId, `Tôi chọn giờ ${time}`, { skipSaveInbound: false, tenantId });
      }

      const naturalText = payloadToText[payload];
      if (naturalText) {
        return agent.processMessage(senderId, naturalText, { skipSaveInbound: false, tenantId });
      }

      // Unknown postback → treat as text
      return agent.processMessage(senderId, payload, { skipSaveInbound: false, tenantId });
    } catch (error) {
      console.error('Postback error:', error);
      return 'Xin lỗi, có lỗi xảy ra. Bạn thử lại nhé!';
    }
  }

  // ── Kept for backward-compat: used by webhook/handler.js ──────────────────

  async getOrCreateConversation(senderId, tenantId = null, pageAccessToken = null) {
    return agent.getOrCreateConversation(senderId, tenantId, pageAccessToken);
  }

  async saveMessage(conversationId, direction, content) {
    return agent.saveMessage(conversationId, direction, content);
  }

  // ── ContentPackage browsing (pure DB, no LLM) ─────────────────────────────

  async handleContentPackageItems(packageId) {
    try {
      const pkg = await prisma.contentPackage.findFirst({
        where: { id: packageId, isActive: true, isPublic: true },
        include: { items: { orderBy: { order: 'asc' } } },
      });

      if (!pkg) return 'Không tìm thấy gói nội dung này.';
      if (pkg.items.length === 0) {
        return `📦 Gói "${pkg.name}" hiện chưa có nội dung chi tiết.\n\nBạn cần hỗ trợ gì thêm không ạ?`;
      }

      const quickReplies = pkg.items.slice(0, 10).map((item) => ({
        content_type: 'text',
        title: `${this._itemEmoji(item.type)} ${item.title.substring(0, 16)}`,
        payload: `ITEM_${item.id}`,
      }));

      const lines = pkg.items
        .map((item) => `• ${this._itemEmoji(item.type)} ${item.title}`)
        .join('\n');

      return {
        text: `📦 ${pkg.name}\n${pkg.description || ''}\n\n${lines}\n\nBạn muốn xem mục nào?`,
        quick_replies: quickReplies,
      };
    } catch (e) {
      return 'Có lỗi khi hiển thị gói nội dung.';
    }
  }

  async handleContentPackageItemDetail(itemId) {
    try {
      const item = await prisma.contentPackageItem.findUnique({
        where: { id: itemId },
        include: { package: true },
      });

      if (!item || !item.package?.isActive || !item.package?.isPublic) {
        return 'Nội dung này hiện không khả dụng.';
      }

      let response = `📌 ${item.title}\n`;
      if (item.description) response += `📝 ${item.description}\n`;
      if (item.type === 'image_prompt') response += `\n🎨 Prompt:\n\`\`\`\n${item.content || ''}\n\`\`\``;
      else if (item.type === 'link') response += `\n🔗 Link: ${item.url || item.content || ''}`;
      else if (item.content) response += `\n📄 ${item.content}`;
      if (item.fileUrl) response += `\n📎 File: ${item.fileUrl}`;
      if (item.tags?.length) response += `\n\n🏷 Tags: ${item.tags.join(', ')}`;
      response += `\n\n(Nguồn: gói "${item.package.name}")\n\nBạn cần hỗ trợ gì thêm không ạ?`;

      return response;
    } catch (e) {
      return 'Có lỗi khi hiển thị nội dung.';
    }
  }

  _itemEmoji(type) {
    return { image_prompt: '🎨', skill: '🛠', link: '🔗', document: '📄' }[type] || '📌';
  }
}

const instance = new BotEngine();

module.exports = instance;
module.exports.getOrCreateConversation = instance.getOrCreateConversation.bind(instance);
module.exports.saveMessage = instance.saveMessage.bind(instance);
