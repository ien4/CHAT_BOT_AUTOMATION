/**
 * Tenant Handoff
 *
 * Giống owner handoff.js nhưng dùng TenantStaff thay vì Staff,
 * và broadcast vào telegramGroupChatId của tenant thay vì TelegramDestination.
 *
 * Cùng Telegram bot platform — không cần bot token riêng.
 */

const getPrisma = require('../db');
const prisma = getPrisma();

let _bot = null;
function init(botInstance) { _bot = botInstance; }
function bot() {
  if (!_bot) throw new Error('[TenantHandoff] Telegram bot chưa được init');
  return _bot;
}

function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clearDialogState(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return context;
  const { dialogState, ...rest } = context;
  return rest;
}

// ==================== HANDOFF EVENTS RECORDING ====================

async function recordHandoffEvent({
  tenantId,
  conversationId,
  staffId = null,
  staffName = null,
  customerName = null,
  customerId,
  eventType,
  durationMs = null,
  metadata = null,
}) {
  try {
    await prisma.handoffEvent.create({
      data: {
        tenantId: tenantId || null,
        conversationId,
        staffId,
        staffName,
        customerName,
        customerId,
        eventType,
        durationMs,
        metadata: metadata || undefined,
      },
    });
  } catch (e) {
    console.error('[TenantHandoff] recordHandoffEvent error:', e.message);
  }
}

// ==================== STATS HELPERS ====================

async function getHandoffAnalytics(tenantId, period = '7d') {
  const now = new Date();
  let since;
  switch (period) {
    case '24h': since = new Date(now - 24 * 60 * 60 * 1000); break;
    case '7d':  since = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
    case '30d': since = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    default:    since = new Date(now - 7 * 24 * 60 * 60 * 1000);
  }

  const where = { tenantId, createdAt: { gte: since } };

  const [events, byType, byStaff, byDay] = await Promise.all([
    prisma.handoffEvent.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.handoffEvent.groupBy({ by: ['eventType'], where, _count: true, orderBy: { _count: { eventType: 'desc' } } }),
    prisma.handoffEvent.groupBy({
      by: ['staffId', 'staffName', 'eventType'], where,
      _count: true,
    }),
    // Group by day — tagged template parameterize tenantId + since (Date)
    prisma.$queryRaw`
      SELECT DATE(created_at) as day, event_type, COUNT(*)::int as count
      FROM handoff_events
      WHERE tenant_id = ${tenantId} AND created_at >= ${since}
      GROUP BY day, event_type
      ORDER BY day ASC
    `,
  ]);

  // Parse the raw query result
  let dailyStats = [];
  if (Array.isArray(byDay)) {
    dailyStats = byDay.map(function(r) {
      return {
        day: typeof r.day === 'object' && r.day ? r.day.toISOString().split('T')[0] : String(r.day || '').split('T')[0],
        eventType: r.event_type,
        count: typeof r.count === 'bigint' ? Number(r.count) : (r.count || 0),
      };
    });
  }

  // Staff performance
  const staffPerformance = {};
  for (const e of events) {
    if (!e.staffId) continue;
    const key = e.staffId;
    if (!staffPerformance[key]) {
      staffPerformance[key] = { name: e.staffName || '', claimed: 0, ended: 0, timeout: 0, totalDurationMs: 0, avgResponseMs: 0, counts: 0 };
    }
    if (e.eventType === 'claimed') staffPerformance[key].claimed++;
    if (e.eventType === 'staff_ended') staffPerformance[key].ended++;
    if (e.eventType === 'timeout') staffPerformance[key].timeout++;
    if (e.durationMs) {
      staffPerformance[key].totalDurationMs += e.durationMs;
      staffPerformance[key].counts++;
      staffPerformance[key].avgResponseMs = Math.round(staffPerformance[key].totalDurationMs / staffPerformance[key].counts);
    }
  }

  // Tính toán thêm từ event đầu tiên đến event claim/takeover
  // Đo thời gian chờ (pending duration)
  let totalWaitMs = 0;
  let waitCount = 0;
  const initiatedEvents = events.filter(e => e.eventType === 'initiated');
  for (const initEvent of initiatedEvents) {
    const claimEvent = events.find(e =>
      e.conversationId === initEvent.conversationId &&
      (e.eventType === 'claimed' || e.eventType === 'takeover') &&
      e.createdAt > initEvent.createdAt
    );
    if (claimEvent) {
      totalWaitMs += claimEvent.createdAt.getTime() - initEvent.createdAt.getTime();
      waitCount++;
    }
  }

  const typeCounts = {};
  for (const t of byType) {
    typeCounts[t.eventType] = t._count;
  }

  return {
    total: events.length,
    period,
    since: since.toISOString(),
    byType: typeCounts,
    dailyStats,
    waitTime: {
      avgMs: waitCount > 0 ? Math.round(totalWaitMs / waitCount) : 0,
      count: waitCount,
    },
    staffPerformance: Object.entries(staffPerformance).map(([id, perf]) => ({ staffId: id, ...perf })),
    recentEvents: events.slice(0, 20),
  };
}

// conversationId → timer
const pendingTimers = new Map();
const sessionTimers = new Map();
// staffChatId → Set<conversationId>
const staffPendingMap = new Map();

// ==================== SETTINGS ====================

function getTenantSettings(tenant) {
  return {
    pendingTimeoutSeconds:  tenant.pendingTimeoutSeconds  || 30,
    sessionTimeoutSeconds:  tenant.sessionTimeoutSeconds  || 30,
    offHoursPendingTimeout: tenant.offHoursPendingTimeout || 10,
    workHoursStart:         tenant.workHoursStart         ?? null,
    workHoursEnd:           tenant.workHoursEnd           ?? null,
  };
}

function getPendingTimeout(settings) {
  if (settings.workHoursStart == null || settings.workHoursEnd == null) {
    return settings.pendingTimeoutSeconds;
  }
  const hour = new Date().getHours();
  const inWorkHours = hour >= settings.workHoursStart && hour < settings.workHoursEnd;
  return inWorkHours ? settings.pendingTimeoutSeconds : settings.offHoursPendingTimeout;
}

// ==================== BROADCAST ====================

async function broadcastToGroup(tenant, text) {
  if (!tenant?.telegramGroupChatId) return;
  try {
    await bot().sendMessage(tenant.telegramGroupChatId, text);
  } catch (e) {
    console.error('[TenantHandoff] broadcastToGroup error:', e.message);
  }
}

// ==================== INITIATE ====================

/**
 * Khi bot nhận tin khách mới → thử handoff sang TenantStaff.
 * @returns {boolean} true nếu handoff đã kích hoạt, false nếu bot tiếp tục xử lý.
 */
async function initiateHandoff(conversation, tenant, messageText) {
  // Bot grace period
  if (conversation.botGraceUntil && new Date() < new Date(conversation.botGraceUntil)) {
    return false;
  }

  const onDutyStaff = await prisma.tenantStaff.findMany({
    where: { tenantId: tenant.id, isOnDuty: true, isActive: true },
  });

  if (onDutyStaff.length === 0) return false;

  const settings = getTenantSettings(tenant);
  const timeout  = getPendingTimeout(settings);

  // Phân loại: staff rảnh vs bận
  const staffIds = onDutyStaff.map(s => s.id);
  const busyConvs = await prisma.conversation.findMany({
    where: { handoffStatus: 'human_active', tenantId: tenant.id },
    select: { assignedTenantStaffId: true },
  });
  const busyIdSet  = new Set(busyConvs.map(c => c.assignedTenantStaffId).filter(Boolean));
  const freeStaff  = onDutyStaff.filter(s => !busyIdSet.has(s.id));
  const allBusy    = freeStaff.length === 0;

  // Atomic check-and-set: chỉ update nếu vẫn còn 'bot' (tránh double-initiation)
  const updateResult = await prisma.conversation.updateMany({
    where: { id: conversation.id, handoffStatus: 'bot' },
    data:  { handoffStatus: 'pending_human', humanSessionExpiresAt: null },
  });

  if (updateResult.count === 0) {
    return true; // Concurrent call đã xử lý rồi
  }

  const displayName = conversation.fbUserName || 'Khách hàng';
  const notifiedChatIds = [];

  if (!allBusy) {
    for (const staff of freeStaff) {
      try {
        await bot().sendMessage(
          staff.telegramChatId,
          `🔔 <b>[${esc(tenant.name)}] Tin nhắn mới</b>\n\n👤 ${esc(displayName)}\n💬 <i>"${esc(messageText.substring(0, 200))}"</i>\n\n⏱ Còn <b>${timeout}s</b> để tiếp nhận`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✋ Nhận cuộc trò chuyện', callback_data: `tclaim_${conversation.id}` },
              ]],
            },
          }
        );
        const existing = staffPendingMap.get(staff.telegramChatId) || new Set();
        existing.add(conversation.id);
        staffPendingMap.set(staff.telegramChatId, existing);
        notifiedChatIds.push(staff.telegramChatId);
      } catch (e) {
        console.error(`[TenantHandoff] DM thất bại cho ${staff.name}:`, e.message);
      }
    }
  } else {
    // Tất cả bận → bot tự xử lý, notify staff để họ có thể takeover
    for (const staff of onDutyStaff) {
      try {
        await bot().sendMessage(
          staff.telegramChatId,
          `🤖 <b>[${esc(tenant.name)}] Bot đang trả lời</b>\n\n👤 ${esc(displayName)}\n💬 <i>"${esc(messageText.substring(0, 200))}"</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✋ Tiếp quản từ bot', callback_data: `ttakeover_${conversation.id}` },
              ]],
            },
          }
        );
      } catch (_) {}
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data:  { handoffStatus: 'bot' },
    });
    return false;
  }

  if (notifiedChatIds.length === 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data:  { handoffStatus: 'bot' },
    });
    return false;
  }

  broadcastToGroup(tenant, `🔔 Handoff mới: ${displayName}`);

  // Ghi event
  recordHandoffEvent({
    tenantId: tenant?.id,
    conversationId: conversation.id,
    customerName: displayName,
    customerId: conversation.fbUserId,
    eventType: 'initiated',
    metadata: { messageText: messageText?.substring(0, 200) },
  });

  const timer = setTimeout(
    () => handlePendingTimeout(conversation.id, messageText, notifiedChatIds, tenant),
    timeout * 1000
  );
  pendingTimers.set(conversation.id, timer);
  return true;
}

// ==================== APPEND PENDING ====================

async function appendPendingMessage(conversation, tenant, messageText) {
  const displayName = conversation.fbUserName || 'Khách hàng';
  for (const [chatId, convIds] of staffPendingMap.entries()) {
    if (convIds.has(conversation.id)) {
      try {
        await bot().sendMessage(
          chatId,
          `💬 [${esc(tenant.name)}] ${esc(displayName)} nhắn thêm: <i>"${esc(messageText.substring(0, 200))}"</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }
}

// ==================== RELAY ====================

/**
 * User nhắn trong lúc HUMAN_ACTIVE → forward sang Telegram của staff.
 */
async function relayToStaff(conversation, tenant, messageText) {
  if (!conversation.assignedTenantStaffId) return;

  const staff = await prisma.tenantStaff.findUnique({
    where: { id: conversation.assignedTenantStaffId },
  });
  if (!staff) return;

  const displayName = conversation.fbUserName || 'Khách hàng';
  try {
    await bot().sendMessage(
      staff.telegramChatId,
      `[${esc(tenant.name)}] 👤 <b>${esc(displayName)}:</b>\n<i>"${esc(messageText.substring(0, 200))}"</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error('[TenantHandoff] relayToStaff error:', e.message);
  }

  const settings = getTenantSettings(tenant);
  resetSessionTimer(conversation.id, conversation.fbUserId, displayName, settings.sessionTimeoutSeconds, tenant);
}

/**
 * Staff gõ tin nhắn trong Telegram.
 * Tenant outbound trực tiếp chưa có implementation an toàn trong Prompt 08B.
 */
async function relayStaffMessage(telegramChatId, text) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      handoffStatus: 'human_active',
      assignedTenantStaff: { is: { telegramChatId, isActive: true } },
    },
    include: { assignedTenantStaff: true },
  });
  if (!conversation) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Bạn không có cuộc hội thoại đang mở.');
    return;
  }
  await bot().sendMessage(
    telegramChatId,
    'ℹ️ Gửi trả lời tenant trực tiếp chưa được hỗ trợ trong backend hiện tại. Cần prompt riêng để nối outbound Facebook theo tenant.'
  );
  return false;
}

// ==================== CLAIM ====================

async function claimConversation(telegramChatId, conversationId, callbackQuery = null) {
  const currentConv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { tenantId: true, handoffStatus: true, assignedTenantStaffId: true },
  });
  if (!currentConv?.tenantId) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Không tìm thấy cuộc trò chuyện này.');
    return false;
  }

  const staff = await prisma.tenantStaff.findFirst({
    where: { telegramChatId, tenantId: currentConv.tenantId, isActive: true },
  });
  if (!staff) {
    await bot().sendMessage(telegramChatId, '❌ Bạn chưa được đăng ký làm nhân viên cho tenant của cuộc trò chuyện này.');
    return false;
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || conv.handoffStatus !== 'pending_human' || conv.tenantId !== staff.tenantId) return null;

      const tenant = await tx.tenant.findUnique({ where: { id: staff.tenantId } });
      const sessionExpiry = new Date(Date.now() + (tenant?.sessionTimeoutSeconds || 30) * 1000);

      return tx.conversation.update({
        where: { id: conversationId },
        data: {
          handoffStatus: 'human_active',
          assignedTenantStaffId: staff.id,
          humanSessionExpiresAt: sessionExpiry,
        },
      });
    });
  } catch (e) {
    console.error('[TenantHandoff] Claim transaction error:', e.message);
    await bot().sendMessage(telegramChatId, '❌ Lỗi kỹ thuật. Thử lại.');
    return false;
  }

  if (!updated) {
    const existingConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handoffStatus: true, assignedTenantStaffId: true },
    });
    if (existingConv?.handoffStatus === 'human_active' && existingConv?.assignedTenantStaffId === staff.id) {
      return false; // Bấm nút 2 lần — bản thân đã nhận rồi
    }
    if (existingConv?.handoffStatus === 'pending_human') {
      await bot().sendMessage(telegramChatId, 'ℹ️ Chưa thể tiếp nhận cuộc trò chuyện này. Vui lòng thử lại.');
      return false;
    }
    await bot().sendMessage(telegramChatId, 'ℹ️ Cuộc trò chuyện này đã được người khác tiếp nhận rồi.');
    return false;
  }

  // Xóa nút "Nhận cuộc trò chuyện" để tránh bấm lại
  if (callbackQuery?.message?.message_id) {
    bot().editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: telegramChatId, message_id: callbackQuery.message.message_id }
    ).catch(() => {});
  }

  if (pendingTimers.has(conversationId)) {
    clearTimeout(pendingTimers.get(conversationId));
    pendingTimers.delete(conversationId);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: staff.tenantId } });
  const settings = getTenantSettings(tenant);
  const displayName = updated.fbUserName || 'Khách hàng';

  await bot().sendMessage(
    telegramChatId,
    `✅ [${esc(tenant?.name)}] <b>Bạn đang phụ trách ${esc(displayName)}</b>\n\nNhắn bất kỳ để trả lời khách.\n⏱ Phiên tự kết thúc sau ${settings.sessionTimeoutSeconds}s không hoạt động.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔴 Kết thúc phiên', callback_data: `tend_${conversationId}` },
        ]],
      },
    }
  );

  // Notify các staff khác đang pending
  for (const [chatId, pendingConvIds] of staffPendingMap.entries()) {
    if (pendingConvIds.has(conversationId)) {
      if (chatId !== telegramChatId) {
        try {
          await bot().sendMessage(chatId, `ℹ️ <b>${esc(staff.name)}</b> đã tiếp nhận — không cần xử lý.`, { parse_mode: 'HTML' });
        } catch (_) {}
      }
      pendingConvIds.delete(conversationId);
      if (pendingConvIds.size === 0) staffPendingMap.delete(chatId);
    }
  }

  if (tenant) broadcastToGroup(tenant, `✅ ${staff.name} tiếp nhận → ${displayName}`);

  resetSessionTimer(conversationId, updated.fbUserId, displayName, settings.sessionTimeoutSeconds, tenant);

  // Ghi event claim
  const pendingMs = Date.now() - new Date(updated.updatedAt).getTime();
  recordHandoffEvent({
    tenantId: tenant?.id,
    conversationId,
    staffId: staff.id,
    staffName: staff.name,
    customerName: displayName,
    customerId: updated.fbUserId,
    eventType: 'claimed',
    durationMs: pendingMs,
  });

  return true;
}

async function takeoverConversation(telegramChatId, conversationId) {
  const staff = await prisma.tenantStaff.findFirst({ where: { telegramChatId } });
  if (!staff) return false;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || conv.handoffStatus !== 'bot' || conv.tenantId !== staff.tenantId) return null;

      const tenant = await tx.tenant.findUnique({ where: { id: staff.tenantId } });
      const sessionExpiry = new Date(Date.now() + (tenant?.sessionTimeoutSeconds || 30) * 1000);

      return tx.conversation.update({
        where: { id: conversationId },
        data: {
          handoffStatus: 'human_active',
          assignedTenantStaffId: staff.id,
          humanSessionExpiresAt: sessionExpiry,
        },
      });
    });
  } catch (e) {
    console.error('[TenantHandoff] Takeover transaction error:', e.message);
    await bot().sendMessage(telegramChatId, '❌ Lỗi kỹ thuật. Thử lại.');
    return false;
  }

  if (!updated) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Không thể tiếp quản — conversation này đã có người xử lý rồi.');
    return false;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: staff.tenantId } });
  const settings = getTenantSettings(tenant);
  const displayName = updated.fbUserName || 'Khách hàng';

  await bot().sendMessage(
    telegramChatId,
    `✅ [${esc(tenant?.name)}] <b>Bạn đang tiếp quản ${esc(displayName)}</b>\n\nNhắn bất kỳ để trả lời khách.\n⏱ Phiên tự kết thúc sau ${settings.sessionTimeoutSeconds}s không hoạt động.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔴 Kết thúc phiên', callback_data: `tend_${conversationId}` },
        ]],
      },
    }
  );

  if (tenant) broadcastToGroup(tenant, `✋ ${staff.name} tiếp quản từ bot → ${displayName}`);
  resetSessionTimer(conversationId, updated.fbUserId, displayName, settings.sessionTimeoutSeconds, tenant);

  // Ghi event takeover
  recordHandoffEvent({
    tenantId: tenant?.id,
    conversationId,
    staffId: staff.id,
    staffName: staff.name,
    customerName: displayName,
    customerId: updated.fbUserId,
    eventType: 'takeover',
  });

  return true;
}

// ==================== END SESSION ====================

async function endSession(conversationId, reason = 'timeout') {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { assignedTenantStaff: true },
  });

  if (!conversation || conversation.handoffStatus !== 'human_active') return;

  if (sessionTimers.has(conversationId)) {
    clearTimeout(sessionTimers.get(conversationId));
    sessionTimers.delete(conversationId);
  }

  const tenant = conversation.tenantId
    ? await prisma.tenant.findUnique({ where: { id: conversation.tenantId } })
    : null;

  const settings = getTenantSettings(tenant || {});
  const graceUntil = new Date(Date.now() + 300_000); // 5 min default grace

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      handoffStatus: 'bot',
      assignedTenantStaffId: null,
      humanSessionExpiresAt: null,
      botGraceUntil: graceUntil,
      context: clearDialogState(conversation.context),
    },
  });

  const staffName   = conversation.assignedTenantStaff?.name || 'Nhân viên';
  const displayName = conversation.fbUserName || 'Khách hàng';

  if (conversation.assignedTenantStaff) {
    const msg = reason === 'timeout'
      ? `⏰ [${tenant?.name}] Phiên tự động kết thúc do không hoạt động.\n🤖 Bot đã tiếp quản ${displayName}.`
      : `🔚 [${tenant?.name}] Phiên kết thúc.\n🤖 Bot đã tiếp quản ${displayName}.`;
    try {
      await bot().sendMessage(conversation.assignedTenantStaff.telegramChatId, msg);
    } catch (_) {}
  }

  if (tenant) {
    broadcastToGroup(tenant,
      reason === 'timeout'
        ? `⏰ Timeout — bot tiếp quản ${displayName}`
        : `🔚 ${staffName} kết thúc phiên với ${displayName}`
    );
  }

  console.log(`[TenantHandoff] Session ended (${reason}): ${displayName}`);

  // Ghi event end
  recordHandoffEvent({
    tenantId: tenant?.id,
    conversationId,
    staffId: conversation.assignedTenantStaff?.id || null,
    staffName: conversation.assignedTenantStaff?.name || null,
    customerName: displayName,
    customerId: conversation.fbUserId,
    eventType: reason, // 'timeout' | 'staff_ended' | 'admin_forced'
  });

  const handled = await handleEndedHumanSession(conversation, tenant);
  if (!handled) console.warn('[TenantHandoff] Tenant outbound fallback is not implemented.');
}

async function endSessionByStaff(telegramChatId) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      handoffStatus: 'human_active',
      assignedTenantStaff: { is: { telegramChatId, isActive: true } },
    },
  });
  if (!conversation) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Không có phiên nào đang mở.');
    return;
  }
  await endSession(conversation.id, 'staff_ended');
}

// ==================== SESSION TIMER ====================

function resetSessionTimer(conversationId, fbUserId, displayName, timeoutSeconds, tenant) {
  if (sessionTimers.has(conversationId)) {
    clearTimeout(sessionTimers.get(conversationId));
  }
  const timer = setTimeout(() => endSession(conversationId, 'timeout'), timeoutSeconds * 1000);
  sessionTimers.set(conversationId, timer);
}

function resetSessionTimerExternal(conversationId, fbUserId, displayName, tenant) {
  if (!tenant) return;
  const settings = getTenantSettings(tenant);
  resetSessionTimer(conversationId, fbUserId, displayName, settings.sessionTimeoutSeconds, tenant);
}

// ==================== PENDING TIMEOUT ====================

async function handlePendingTimeout(conversationId, originalMessage, notifiedChatIds, tenant) {
  pendingTimers.delete(conversationId);

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.handoffStatus !== 'pending_human') return;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      handoffStatus: 'bot',
      botGraceUntil: new Date(Date.now() + 300_000),
      context: clearDialogState(conversation.context),
    },
  });

  for (const chatId of notifiedChatIds) {
    try {
      await bot().sendMessage(chatId, `⏰ [${tenant?.name}] Không ai tiếp nhận — bot tự động trả lời ${conversation.fbUserName || 'khách hàng'}.`);
    } catch (_) {}
    const convIds = staffPendingMap.get(chatId);
    if (convIds) {
      convIds.delete(conversationId);
      if (convIds.size === 0) staffPendingMap.delete(chatId);
    }
  }

  if (tenant) broadcastToGroup(tenant, `⏰ Timeout — bot tự xử lý ${conversation.fbUserName || 'khách'}`);

  // Ghi event pending timeout
  recordHandoffEvent({
    tenantId: tenant?.id,
    conversationId,
    customerName: conversation.fbUserName || 'Khách hàng',
    customerId: conversation.fbUserId,
    eventType: 'pending_timeout',
  });

  await handleEndedHumanSession(conversation, tenant, originalMessage);
}

async function handleEndedHumanSession(conversation, tenant, originalMessage = null) {
  if (!conversation || !tenant) return false;

  const lastMessage = originalMessage
    ? { direction: 'inbound', content: originalMessage }
    : await prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, content: true },
      });

  if (!lastMessage || lastMessage.direction !== 'inbound') return false;

  try {
    const botEngine = require('../bot/engine');
    const reply = await botEngine.processMessage(conversation.fbUserId, lastMessage.content, {
      skipSaveInbound: true,
      channel: conversation.channel || 'unknown',
      pageContext: conversation.pageContext || null,
      tenantId: tenant.id,
      botPersonaOverride: tenant.defaultPersona,
    });
    if (!reply) return false;

    console.warn('[TenantHandoff] Bot generated tenant reply but outbound direct channel is not implemented yet.');
    return false;
  } catch (e) {
    console.error('[TenantHandoff] Bot takeover failed:', e.message);
    return false;
  }
}

module.exports = {
  init,
  initiateHandoff,
  appendPendingMessage,
  relayToStaff,
  relayStaffMessage,
  claimConversation,
  takeoverConversation,
  endSessionByStaff,
  endSession,
  resetSessionTimerExternal,
  recordHandoffEvent,
  getHandoffAnalytics,
};
