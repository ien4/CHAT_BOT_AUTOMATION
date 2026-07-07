const getPrisma = require('../db');
const manager = require('./telegramManager');
const formatters = require('./formatters');

const REPORT_HOUR = 10; // 10:00 AM

function msUntilNext10AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(REPORT_HOUR, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next - now;
}

async function sendReport() {
  const prisma = getPrisma();
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Conversations có tin nhắn hôm nay
    const activeConvIds = await prisma.message.findMany({
      where: { createdAt: { gte: today, lt: tomorrow } },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
    const totalConvs = activeConvIds.length;

    // Conversations có nhân viên tham gia hôm nay
    const handoffConvs = await prisma.message.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
        direction: 'staff_outbound',
      },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
    const handoffCount = handoffConvs.length;

    const handoffConvIdSet = new Set(handoffConvs.map(m => m.conversationId));
    const botHandled = activeConvIds.filter(m => !handoffConvIdSet.has(m.conversationId)).length;

    // Lịch hẹn hôm nay
    const appointmentCount = await prisma.appointment.count({
      where: { createdAt: { gte: today, lt: tomorrow } },
    });

    await manager.send(formatters.dailyReport({
      totalConvs,
      botHandled,
      handoffCount,
      appointmentCount,
    }));

    console.log('[DailyReport] Sent successfully');
  } catch (err) {
    console.error('[DailyReport] Failed to send report:', err.message);
  }
}

function scheduleNext() {
  const delay = msUntilNext10AM();
  const hhmm = new Date(Date.now() + delay).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  console.log(`[DailyReport] Next report scheduled at ${hhmm} (in ${Math.round(delay / 60000)} min)`);

  setTimeout(async () => {
    await sendReport();
    scheduleNext(); // lên lịch cho ngày hôm sau
  }, delay);
}

function start() {
  scheduleNext();
  console.log('✅ DailyReport scheduler started (10:00 AM daily)');
}

module.exports = { start, sendReport };
