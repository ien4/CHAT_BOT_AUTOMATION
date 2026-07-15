'use strict';

/**
 * Log redaction helpers — dùng để giảm rủi ro rò PII/secret trong log backend.
 *
 * Nguyên tắc:
 * - Không bao giờ trả về nội dung message thô, full id, token/secret, hay
 *   provider response body.
 * - Chỉ trả về metadata an toàn (masked id, độ dài, sự hiện diện, mã lỗi).
 * - Thuần CommonJS, không import DB/Express/provider, không tự log.
 */

/**
 * Che một id, chỉ giữ `visible` ký tự cuối. Không log full sender/recipient/staff id.
 * @returns {string|null}
 */
function maskId(value, visible = 4) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value);
  if (raw.length <= visible) return '***';
  return `***${raw.slice(-visible)}`;
}

/**
 * Tóm tắt một chuỗi (message text/payload) mà không lộ nội dung.
 * @returns {{ present: boolean, length: number }}
 */
function summarizeText(value) {
  const present = typeof value === 'string' ? value.length > 0 : value !== undefined && value !== null;
  const length = typeof value === 'string' ? value.length : 0;
  return { present, length };
}

/**
 * Rút gọn error thành metadata an toàn: không trả response.data, không stack dài,
 * không token. `message` được cắt ngắn để tránh lộ payload/secret vô tình.
 * @returns {{ name: string, message: string|null, status: number|null, code: string|number|null }}
 */
function safeError(error) {
  if (!error || typeof error !== 'object') {
    return { name: 'Error', message: null, status: null, code: null };
  }
  const rawMessage = typeof error.message === 'string' ? error.message : null;
  return {
    name: error.name || 'Error',
    message: rawMessage ? rawMessage.slice(0, 200) : null,
    status: error.response?.status ?? error.status ?? null,
    code: error.code ?? null,
  };
}

/**
 * Trả về bản sao nông của object với các key nhạy cảm bị thay bằng '[redacted]'.
 * Dùng khi cần log một object cấu hình mà vẫn phải giấu token/secret.
 * @returns {object}
 */
function redactObjectKeys(obj, keys = []) {
  if (!obj || typeof obj !== 'object') return {};
  const redactSet = new Set(keys);
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = redactSet.has(key) ? '[redacted]' : obj[key];
  }
  return out;
}

/**
 * True nếu value có mặt (không undefined/null/chuỗi rỗng).
 * @returns {boolean}
 */
function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

module.exports = {
  maskId,
  summarizeText,
  safeError,
  redactObjectKeys,
  isPresent,
};
