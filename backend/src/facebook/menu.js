


const axios = require('axios');
const getPrisma = require('../db');
const prisma = getPrisma();
const { safeError } = require('../infrastructure/services/redaction');

/**
 * Facebook Persistent Menu & Get Started Button
 * Cấu hình menu cố định cho Facebook Page
 */
class FacebookMenu {
  constructor() {
    this.graphUrl = 'https://graph.facebook.com/v19.0';
  }

    /**
   * Thiết lập toàn bộ Messenger Profile (menu, get_started, greeting) trong 1 call
   * SỬA LỖI: Facebook API yêu cầu gửi đồng thời tất cả params
   * Không gửi riêng lẻ greeting / get_started / persistent_menu
   */
  async setupMessengerProfile(pageId = null, options = {}) {
    const pageToken = options.pageToken || process.env.FB_PAGE_ACCESS_TOKEN;
    if (!pageToken || pageToken.includes('your_')) {
      console.log('⚠️ Chưa cấu hình Page Access Token, bỏ qua setup');
      return { success: false, error: 'Chưa cấu hình Page Access Token' };
    }

    const actualPageId = pageId || 'me';

    const payload = {
      get_started: { payload: 'GET_STARTED' },
      greeting: [
        {
          locale: 'default',
          text: options.greetingText || 'Xin chào! 👋 Mình là trợ lý ảo. Bạn cần hỗ trợ gì ạ?',
        },
      ],
      persistent_menu: [
        {
          locale: 'default',
          composer_input_disabled: false,
          call_to_actions: [
            { type: 'postback', title: '🏠 Trang chủ', payload: 'COMPANY_INFO' },
            { type: 'postback', title: '📋 Dịch vụ', payload: 'LIST_SERVICES' },
            { type: 'postback', title: '📅 Đặt lịch tư vấn', payload: 'BOOK_APPOINTMENT' },
            { type: 'postback', title: '📦 Gói nội dung', payload: 'CONTENT_PACKAGES' },
            { type: 'web_url', title: '🌐 Website', url: 'https://bbotech.vn', webview_height_ratio: 'full' },
          ],
        },
      ],
    };

    try {
      const response = await axios.post(
        `${this.graphUrl}/${actualPageId}/messenger_profile`,
        payload,
        { params: { access_token: pageToken } }
      );
      console.log(`✅ Messenger Profile đã được cài đặt (page: ${actualPageId})`);
      return { success: true, result: response.data };
    } catch (error) {
      console.error('❌ Lỗi cài đặt Messenger Profile:', safeError(error));
      return { success: false, error: error.response?.data || error.message };
    }
  }

  /**
   * Helper: setup cho tất cả các page trong DB
   */
  async setupAllPages(greetingText) {
    // Startup guard: external Messenger Profile setup KHÔNG được làm crash server.
    // Lỗi token invalid/hết hạn/`me` not found/DB lookup fail → log warn redacted, không token,
    // và trả về gracefully để index.js tiếp tục app.listen.
    try {
      const pages = await prisma.facebookPage.findMany({
        where: { isActive: true },
        select: { pageId: true, pageName: true, accessToken: true },
      });

      const results = [];

      // Luôn setup cho page mặc định (global token)
      const defaultResult = await this.setupMessengerProfile('me', {
        greetingText,
        pageToken: process.env.FB_PAGE_ACCESS_TOKEN,
      });
      results.push({ pageId: 'default', name: 'Default', success: defaultResult.success });

      // Setup cho từng page trong DB
      for (const page of pages) {
        if (!page.accessToken) continue;
        const result = await this.setupMessengerProfile(page.pageId, {
          greetingText,
          pageToken: page.accessToken,
        });
        results.push({ pageId: page.pageId, name: page.pageName, success: result.success });
      }

      return results;
    } catch (error) {
      // safeError: không log access token / response body raw.
      console.warn('⚠️ Bỏ qua Messenger Profile setup do lỗi external (server vẫn khởi động):', safeError(error));
      return [];
    }
  }

  // === GIỮ LẠI CÁC METHOD CŨ NHƯNG GỘP VÀO setupMessengerProfile ===

  async setupPersistentMenu() {
    return this.setupMessengerProfile();
  }

  async setupGetStarted() {
    return this.setupMessengerProfile();
  }

  async setupGreeting(greetingText) {
    return this.setupMessengerProfile('me', { greetingText });
  }

  /**
   * Xóa tất cả cài đặt Messenger Profile (reset)
   */
  async resetProfile() {
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_')) {
      return { success: false, error: 'Chưa cấu hình Page Access Token' };
    }

    try {
      const response = await axios.delete(
        `${this.graphUrl}/me/messenger_profile`,
        {
          params: { access_token: accessToken },
          data: {
            fields: ['persistent_menu', 'get_started', 'greeting'],
          },
        }
      );
      console.log('✅ Messenger Profile đã được reset');
      return { success: true, result: response.data };
    } catch (error) {
      console.error('❌ Lỗi reset profile:', safeError(error));
      return { success: false, error: error.response?.data || error.message };
    }
  }

  /**
   * Lấy thông tin Messenger Profile hiện tại
   */
  async getProfile() {
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('your_')) {
      return { success: false, error: 'Chưa cấu hình Page Access Token' };
    }

    try {
      const response = await axios.get(
        `${this.graphUrl}/me/messenger_profile`,
        {
          params: {
            access_token: accessToken,
            fields: 'persistent_menu,get_started,greeting',
          },
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Lỗi lấy profile:', safeError(error));
      return { success: false, error: error.response?.data || error.message };
    }
  }
}

module.exports = new FacebookMenu();