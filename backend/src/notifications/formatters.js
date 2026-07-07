function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function now() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function today() {
  return new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const formatters = {
  // ==================== ALERTS ====================

  botError(errorMessage, context = '') {
    return (
      `🚨 <b>CẢNH BÁO — Bot lỗi</b>\n\n` +
      `📋 ${esc(errorMessage.substring(0, 200))}\n` +
      (context ? `🔍 Context: ${esc(context)}\n` : '') +
      `⏰ ${now()}`
    );
  },

  llmAllProvidersFailed() {
    return (
      `🚨 <b>CẢNH BÁO — Tất cả LLM provider lỗi</b>\n\n` +
      `Bot đang trả lời bằng tin nhắn mặc định (không có AI).\n` +
      `⚠️ Kiểm tra API key trong Dashboard > LLM Providers\n` +
      `⏰ ${now()}`
    );
  },

  llmProviderFallback(failedProvider, usedProvider) {
    return (
      `⚠️ <b>LLM Fallback</b>\n\n` +
      `❌ ${esc(failedProvider)} không phản hồi\n` +
      `✅ Đang dùng: ${esc(usedProvider)}\n` +
      `⏰ ${now()}`
    );
  },

  noStaffOnline(customerName) {
    return (
      `⚠️ <b>Không có nhân viên online</b>\n\n` +
      `👤 ${esc(customerName)} cần hỗ trợ nhưng không ai đang trực.\n` +
      `🤖 Bot đã tự động trả lời.\n` +
      `⏰ ${now()}`
    );
  },

  handoffTimeout(customerName) {
    return (
      `⏰ <b>Hết thời gian chờ handoff</b>\n\n` +
      `👤 ${esc(customerName)} đã chờ nhưng không ai nhận.\n` +
      `🤖 Bot đã tự động tiếp quản.\n` +
      `⏰ ${now()}`
    );
  },

  ragMissStreak(customerName, count) {
    return (
      `⚠️ <b>Bot liên tục không tìm được thông tin</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `📊 ${count} lần liên tiếp không có kết quả RAG\n` +
      `💡 Có thể cần bổ sung knowledge base\n` +
      `⏰ ${now()}`
    );
  },

  dbError(errorMessage) {
    return (
      `🚨 <b>CẢNH BÁO — Lỗi kết nối Database</b>\n\n` +
      `📋 ${esc(errorMessage.substring(0, 200))}\n` +
      `⏰ ${now()}`
    );
  },

  dbRecovered() {
    return `✅ <b>Database đã kết nối lại</b> — ${now()}`;
  },

  uncaughtException(errorMessage) {
    return (
      `🚨 <b>CẢNH BÁO — Lỗi nghiêm trọng (Uncaught Exception)</b>\n\n` +
      `📋 ${esc(errorMessage.substring(0, 200))}\n` +
      `⏰ ${now()}`
    );
  },

  // ==================== PER-EVENT ====================

  handoffTriggered(customerName, messagePreview, staffCount) {
    return (
      `📋 <b>Handoff mới</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `💬 <i>"${esc(messagePreview.substring(0, 100))}"</i>\n` +
      `👥 Đang thông báo ${staffCount} nhân viên\n` +
      `⏰ ${now()}`
    );
  },

  handoffClaimed(staffName, customerName, waitSeconds) {
    return (
      `✅ <b>Handoff được nhận</b>\n\n` +
      `👤 Khách: ${esc(customerName)}\n` +
      `🧑‍💼 Nhân viên: ${esc(staffName)}\n` +
      `⏱ Thời gian chờ: ${waitSeconds}s\n` +
      `⏰ ${now()}`
    );
  },

  handoffEnded(staffName, customerName, reason) {
    const reasonText = reason === 'timeout' ? 'Hết thời gian' : 'Nhân viên kết thúc';
    return (
      `🔚 <b>Phiên handoff kết thúc</b>\n\n` +
      `👤 Khách: ${esc(customerName)}\n` +
      `🧑‍💼 Nhân viên: ${esc(staffName)}\n` +
      `📌 Lý do: ${reasonText}\n` +
      `⏰ ${now()}`
    );
  },

  appointmentBooked(customerName, date, time, link = '') {
    return (
      `📅 <b>Lịch hẹn mới</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `📆 ${esc(date)} lúc ${esc(time)}\n` +
      (link ? `🔗 <a href="${esc(link)}">Xem lịch</a>\n` : '') +
      `⏰ ${now()}`
    );
  },

  appointmentRescheduled(customerName, oldDate, oldTime, newDate, newTime, link = '') {
    return (
      `📅 <b>Dời lịch hẹn</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `⏮ Cũ: ${esc(oldDate)} lúc ${esc(oldTime)}\n` +
      `⏭ Mới: ${esc(newDate)} lúc ${esc(newTime)}\n` +
      (link ? `🔗 <a href="${esc(link)}">Xem lịch</a>\n` : '') +
      `⏰ ${now()}`
    );
  },

  appointmentCancelled(customerName, date, time, reason = '', link = '') {
    return (
      `📅 <b>Hủy lịch hẹn</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `📆 ${esc(date)} lúc ${esc(time)}\n` +
      (reason ? `📝 Lý do: ${esc(reason)}\n` : '') +
      (link ? `🔗 <a href="${esc(link)}">Xem lịch</a>\n` : '') +
      `⏰ ${now()}`
    );
  },

  appointmentUpdated(customerName, date, time, changes = [], link = '') {
    return (
      `📅 <b>Cập nhật thông tin lịch hẹn</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `📆 ${esc(date)} lúc ${esc(time)}\n` +
      (changes.length ? `📝 ${changes.map(esc).join('\n📝 ')}\n` : '') +
      (link ? `🔗 <a href="${esc(link)}">Xem lịch</a>\n` : '') +
      `⏰ ${now()}`
    );
  },

  appointmentStatusChanged(customerName, date, time, oldStatus, newStatus, link = '') {
    const labels = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      cancelled: 'Đã hủy',
    };
    return (
      `📅 <b>Đổi trạng thái lịch hẹn</b>\n\n` +
      `👤 ${esc(customerName)}\n` +
      `📆 ${esc(date)} lúc ${esc(time)}\n` +
      `📌 ${esc(labels[oldStatus] || oldStatus || 'N/A')} → ${esc(labels[newStatus] || newStatus || 'N/A')}\n` +
      (link ? `🔗 <a href="${esc(link)}">Xem lịch</a>\n` : '') +
      `⏰ ${now()}`
    );
  },

  // ==================== DAILY REPORT ====================

  dailyReport({ totalConvs, botHandled, handoffCount, appointmentCount }) {
    const botRate = totalConvs > 0 ? Math.round((botHandled / totalConvs) * 100) : 0;

    let rating;
    if (totalConvs === 0) {
      rating = '📭 Không có hội thoại';
    } else if (botRate >= 80) {
      rating = '✅ Tốt';
    } else if (botRate >= 50) {
      rating = '⚠️ Trung bình';
    } else {
      rating = '❌ Cần xem lại knowledge base';
    }

    return (
      `📊 <b>Báo cáo ngày ${today()}</b>\n\n` +
      `💬 Hội thoại: <b>${totalConvs}</b>\n` +
      `🤖 Bot tự xử lý: <b>${botHandled}</b> (${botRate}%)\n` +
      `🧑‍💼 Handoff: <b>${handoffCount}</b>\n` +
      `📅 Lịch hẹn: <b>${appointmentCount}</b>\n\n` +
      `Đánh giá: ${rating}`
    );
  },
};

module.exports = formatters;
