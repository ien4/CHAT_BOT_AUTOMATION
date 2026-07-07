const llmFactory = require('../llm/factory');

/**
 * Intent Classification
 * Determines what the user wants:
 * - company_info: Questions about the company
 * - service_inquiry: Questions about services/products/pricing
 * - content_package: Questions about campaigns, marketing materials, documents, prompts
 * - general: General chat, greetings
 * - fallback: Cannot determine
 */
class IntentClassifier {
  constructor() {
    this.classificationPrompt = `Bạn là bộ phân loại ý định cho chatbot.
Phân loại tin nhắn của người dùng vào MỘT trong các loại sau:

1. "company_info" - Hỏi về thông tin công ty: địa chỉ, liên hệ, lịch sử, đội ngũ, giờ làm việc.
2. "service_inquiry" - Hỏi về dịch vụ, sản phẩm, báo giá, chi phí, tư vấn dịch vụ, đặt lịch mới.
3. "content_package" - Hỏi về gói nội dung, chiến dịch truyền thông, tài liệu marketing, prompt hình ảnh, mẫu content, poster, banner, kịch bản.
4. "appointment_status" - Hỏi về lịch hẹn đã đặt: xác nhận lại, kiểm tra, xem thông tin lịch hẹn hiện tại.
5. "general" - Chào hỏi, cảm ơn, hỏi thăm, chat bình thường.
6. "fallback" - Không xác định được hoặc không liên quan.

QUAN TRỌNG: Chỉ trả lời duy nhất một từ trong danh sách trên. Không thêm gì khác.`;
  }

  /**
   * Classify user intent
   * @param {string} message - User message
   * @param {Array} history - Conversation history
   * @returns {Promise<{intent: string, confidence: number}>}
   */
  async classify(message, history = []) {
    try {
      const keywordResult = this.keywordClassify(message);
      if (keywordResult.confidence >= 0.75) {
        return keywordResult;
      }

      const recentHistory = history.slice(-4);
      const historyText = recentHistory
        .map((m) => `${m.direction === 'inbound' ? 'Khách' : 'Bot'}: ${m.content}`)
        .join('\n');

      const userPrompt = `Lịch sử hội thoại gần đây (nếu có):
${historyText || 'Không có'}

Tin nhắn hiện tại: "${message}"

Hãy phân loại ý định của tin nhắn này. Chỉ trả lời 1 từ.`;

      const result = await llmFactory.classify(this.classificationPrompt, userPrompt);
      const normalized = result.trim().toLowerCase();

      const validIntents = ['company_info', 'service_inquiry', 'content_package', 'appointment_status', 'general', 'fallback'];
      const intent = normalized === 'campaign'
        ? 'content_package'
        : (validIntents.includes(normalized) ? normalized : 'fallback');

      let confidence = 0.5;
      if (intent === normalized || (normalized === 'campaign' && intent === 'content_package')) confidence = 0.9;
      if (intent === 'fallback' && normalized !== 'fallback') confidence = 0.3;

      return { intent, confidence };
    } catch (error) {
      console.error('Intent classification error:', error.message);
      return this.keywordClassify(message);
    }
  }

  normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .toLowerCase();
  }

  /**
   * Fallback keyword-based classification.
   * Uses normalized Vietnamese text so it still works without LLM.
   */
  keywordClassify(message) {
    const normalized = this.normalizeText(message);

    const companyKeywords = [
      'cong ty', 'dia chi', 'lien he', 'so dien thoai',
      'email', 'website', 'gio lam', 'doi ngu', 'thanh lap',
      'giam doc', 'nhan vien', 'van phong', 'chi nhanh',
      'tuyen dung', 'viec lam',
    ];
    if (companyKeywords.some((k) => normalized.includes(k))) {
      return { intent: 'company_info', confidence: 0.8 };
    }

    const appointmentStatusKeywords = [
      'lich hen', 'lich cua toi', 'xac nhan lich', 'kiem tra lich',
      'check lich', 'check lich hen',
      'lich da dat', 'thoi gian hen', 'khi nao gap', 'lich tu van',
      'biet lich', 'xem lich', 'lich hom nay', 'lich ngay mai',
      'con lich khong', 'lich hen cua minh',
    ];
    if (appointmentStatusKeywords.some((k) => normalized.includes(k))) {
      return { intent: 'appointment_status', confidence: 0.9 };
    }

    const contentPackageKeywords = [
      'goi noi dung', 'chien dich', 'prompt', 'hinh anh', 'quang cao',
      'marketing', 'truyen thong', 'content', 'noi dung mau',
      'tai lieu', 'template', 'mau content', 'poster', 'banner',
      'video', 'kich ban', 'script', 'creative', 'brief',
      't?i li?u',
    ];
    if (contentPackageKeywords.some((k) => normalized.includes(k))) {
      return { intent: 'content_package', confidence: 0.85 };
    }

    const serviceKeywords = [
      'dich vu', 'bao gia', 'gia bao nhieu', 'chi phi', 'tu van',
      'dat lich', 'hen', 'san pham', 'combo',
      'khuyen mai', 'uu dai', 'mua', 'dat hang',
      'd?ch v?',
    ];
    if (serviceKeywords.some((k) => normalized.includes(k))) {
      return { intent: 'service_inquiry', confidence: 0.8 };
    }

    const generalKeywords = [
      'xin chao', 'hello', 'hi', 'chao', 'cam on', 'thanks',
      'bye', 'tam biet', 'goodbye', 'ok', 'okay',
    ];
    if (generalKeywords.some((k) => normalized.includes(k))) {
      return { intent: 'general', confidence: 0.8 };
    }

    return { intent: 'fallback', confidence: 0.4 };
  }
}

module.exports = new IntentClassifier();
