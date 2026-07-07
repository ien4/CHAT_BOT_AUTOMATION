const intentClassifier = require('./intents');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastAssistantAskedForContentPackageFollowUp(messages) {
  const lastAssistant = [...(messages || [])].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) return false;

  const text = normalizeText(lastAssistant.content);
  const hasContentContext = text.includes('prompt') || text.includes('tai lieu') || text.includes('goi noi dung');
  const offeredFollowUp = text.includes('gui') || text.includes('xem') || text.includes('chi tiet');
  return hasContentContext && offeredFollowUp;
}

function isContentPackageFollowUp(messageText, messages) {
  const text = normalizeText(messageText);
  if (!text) return false;

  const sendFollowUpRequest = [
    'gui di',
    'gui cho toi',
    'minh xem',
    'cho xem',
    'xem di',
  ].some((keyword) => text.includes(keyword));

  const shortAckFollowUp = ['uhm', 'um', 'ok', 'oke', 'duoc', 'dong y'].includes(text);
  return (sendFollowUpRequest || shortAckFollowUp)
    && lastAssistantAskedForContentPackageFollowUp(messages);
}

function isAppointmentStatusText(messageText) {
  const text = normalizeText(messageText);
  return [
    'lich hen',
    'lich cua toi',
    'xac nhan lich',
    'kiem tra lich',
    'check lich',
    'check lich hen',
    'lich da dat',
    'thoi gian hen',
    'khi nao gap',
    'lich tu van',
    'xem lich',
    'lich hen cua minh',
  ].some((keyword) => text.includes(keyword));
}

async function routeMessage(messageText, dbHistory = [], llmMessages = []) {
  const classification = await intentClassifier.classify(messageText, dbHistory);
  return { intent: classification.intent, confidence: classification.confidence, directTool: null };
}

function formatToolResult(toolName, result) {
  if (toolName === 'get_content_package') {
    return result?.content || null;
  }

  if (toolName === 'check_appointment') {
    if (result?.found && result.appointment) {
      const appointment = result.appointment;
      const statusLabel = appointment.status === 'confirmed' ? 'đã xác nhận' : 'đang chờ xác nhận';
      return [
        `Mình tìm thấy lịch hẹn của bạn: ${appointment.date} lúc ${appointment.time}.`,
        appointment.name ? `Tên: ${appointment.name}.` : null,
        appointment.phone ? `SĐT: ${appointment.phone}.` : null,
        `Trạng thái: ${statusLabel}.`,
      ].filter(Boolean).join('\n');
    }

    return result?.message || 'Mình chưa tìm thấy lịch hẹn nào trong hệ thống.';
  }

  return result?.message || result?.content || null;
}

module.exports = {
  routeMessage,
  formatToolResult,
  normalizeText,
  isContentPackageFollowUp,
  isAppointmentStatusText,
};
