/**
 * AI Dynamic Suggestions Engine
 * Tự động sinh Quick Reply buttons dựa trên ngữ cảnh hội thoại
 * Bot sẽ phân tích intent + knowledge base để gợi ý:
 * - Tài liệu liên quan (từ ContentPackages)
 * - Prompt mẫu (từ ContentPackage Items)
 * - Câu hỏi follow-up thông minh
 * - Dịch vụ liên quan
 */
const { PrismaClient } = require('@prisma/client');
const llmFactory = require('../llm/factory');
const ragPipeline = require('../rag/pipeline');
const getPrisma = require('../db');
const prisma = getPrisma();

class SuggestionEngine {
  /**
   * Sinh Quick Reply buttons dựa trên intent và user message
   * @returns {Array} [{title, payload}] hoặc null nếu không phù hợp
   */
  /**
   * Load fixed Quick Reply Menu từ database (nếu có) → fallback sang LLM/dynamic
   */
  async generateSuggestions(intent, userMessage, conversationHistory = [], pageId = null) {
    // 1. Ưu tiên fixed menu từ QuickReplyMenu table
    if (intent !== 'fallback') {
      const fixedMenu = await this.getFixedMenu(intent, pageId);
      if (fixedMenu) {
        return fixedMenu;
      }
    }

    // 2. Fallback: dynamic suggestions cũ
    switch (intent) {
      case 'service_inquiry':
        return this.serviceSuggestions(userMessage);
      case 'content_package':
      case 'campaign': // Legacy support
        return this.contentPackageSuggestions(userMessage);
      case 'company_info':
        return this.companySuggestions(userMessage);
      case 'general':
        return this.generalSuggestions();
      default:
        return null;
    }
  }

  /**
   * Load fixed Quick Reply Menu từ database
   */
  async getFixedMenu(intentType, pageId = null) {
    try {
      // Tìm menu theo intentType + pageId (null = global)
      let menu = await prisma.quickReplyMenu.findFirst({
        where: { intentType, pageId: pageId || null, isActive: true },
      });

      // Nếu không có menu specific cho page, dùng global menu
      if (!menu && pageId) {
        menu = await prisma.quickReplyMenu.findFirst({
          where: { intentType, pageId: null, isActive: true },
        });
      }

      if (menu && menu.items && Array.isArray(menu.items) && menu.items.length > 0) {
        return menu.items.map(item => ({
          title: item.title.substring(0, 20),
          payload: item.payload || item.title.toUpperCase().replace(/ /g, '_'),
        }));
      }

      return null;
    } catch (e) {
      console.log('Fixed menu lookup failed:', e.message);
      return null;
    }
  }

  /**
   * Gợi ý cho intent "dịch vụ"
   * Dựa vào knowledge base để tạo các nút dịch vụ cụ thể
   */
  async serviceSuggestions(userMessage) {
    try {
      const services = await prisma.knowledgeBase.findMany({
        where: { category: 'service', isActive: true },
        select: { title: true, id: true },
        take: 5,
      });

      if (services.length > 0) {
        return services.map(s => ({
          title: s.title.length > 20 ? s.title.substring(0, 18) + '...' : s.title,
          payload: `SERVICE_${s.id}`,
        }));
      }

      // Fallback mặc định
      return [
        { title: '📅 Đặt lịch tư vấn', payload: 'BOOK_APPOINTMENT' },
        { title: '📋 Tất cả dịch vụ', payload: 'LIST_SERVICES' },
        { title: '💰 Nhận báo giá', payload: 'GET_QUOTE' },
      ];
    } catch (e) {
      return [
        { title: '📅 Đặt lịch tư vấn', payload: 'BOOK_APPOINTMENT' },
        { title: '📋 Xem dịch vụ', payload: 'LIST_SERVICES' },
      ];
    }
  }

  /**
   * Gợi ý cho intent "content_package"
   * Liệt kê các ContentPackage + Quick Reply buttons
   */
  async contentPackageSuggestions(userMessage) {
    try {
      const packages = await prisma.contentPackage.findMany({
        where: { isActive: true, isPublic: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      if (packages.length === 0) {
        return [
          { title: '📦 Gói nội dung mới nhất', payload: 'CONTENT_PACKAGES' },
          { title: '📝 Nhận tài liệu mẫu', payload: 'REQUEST_DOCS' },
        ];
      }

      const buttons = packages.map(p => ({
        title: `📦 ${p.name.substring(0, 16)}`,
        payload: `PKG_${p.id}`,
      }));

      // Thêm nút "Xem tất cả"
      if (buttons.length < 5) {
        buttons.push({ title: '📂 Tất cả gói', payload: 'CONTENT_PACKAGES' });
      }

      return buttons.slice(0, 5);
    } catch (e) {
      return [
        { title: '📦 Xem gói nội dung', payload: 'CONTENT_PACKAGES' },
        { title: '🎨 Xin prompt mẫu', payload: 'REQUEST_PROMPT' },
      ];
    }
  }

  /**
   * Gợi ý cho intent "thông tin công ty"
   */
  async companySuggestions(userMessage) {
    return [
      { title: '📍 Địa chỉ & liên hệ', payload: 'COMPANY_CONTACT' },
      { title: '👥 Về chúng tôi', payload: 'COMPANY_INFO' },
      { title: '📋 Dịch vụ', payload: 'LIST_SERVICES' },
    ];
  }

  /**
   * Gợi ý chung cho chat thông thường
   */
  generalSuggestions() {
    return [
      { title: '📋 Dịch vụ của chúng tôi', payload: 'LIST_SERVICES' },
      { title: '📅 Đặt lịch tư vấn', payload: 'BOOK_APPOINTMENT' },
      { title: 'ℹ️ Về công ty', payload: 'COMPANY_INFO' },
      { title: '📦 Gói nội dung', payload: 'CONTENT_PACKAGES' },
    ];
  }

  /**
   * 🔥 AI-Powered Suggestion — Sử dụng LLM để tạo nút thông minh
   * Dựa trên toàn bộ ngữ cảnh hội thoại
   */
  async aiSuggestions(intent, userMessage, conversationHistory = [], knowledgeContext = '') {
    const prompt = `Bạn là trợ lý tư vấn. Dựa vào hội thoại sau, hãy đề xuất 2-4 nút bấm (Quick Replies) để người dùng có thể tiếp tục hội thoại.

Loại câu hỏi: ${intent}
Tin nhắn: "${userMessage}"

Lịch sử:
${conversationHistory.slice(-3).map(m => `${m.direction === 'inbound' ? '👤' : '🤖'}: ${m.content}`).join('\n')}

Kiến thức liên quan:
${knowledgeContext || 'Không có'}

QUAN TRỌNG:
- Mỗi nút có title (tối đa 20 ký tự) và payload (tối đa 30 ký tự)
- Trả về CHỈ một JSON array, không thêm text gì khác
- Ví dụ: [{"title":"📅 Đặt lịch ngay","payload":"BOOK_APPOINTMENT"},{"title":"💰 Xem báo giá","payload":"GET_QUOTE"}]`;

    try {
      const response = await llmFactory.generate(
        'Bạn là AI tạo Quick Reply buttons. Chỉ trả về JSON.',
        prompt,
        null // use default provider
      );

      // Parse JSON từ response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const buttons = JSON.parse(jsonMatch[0]);
        return buttons.slice(0, 5);
      }
    } catch (e) {
      console.log('AI suggestion failed, using static:', e.message);
    }

    return null;
  }
}

module.exports = new SuggestionEngine();