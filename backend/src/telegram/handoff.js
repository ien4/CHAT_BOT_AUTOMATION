const axios = require('axios');
const fs = require('fs');
const path = require('path');
const getPrisma = require('../db');
const prisma = getPrisma();
const FB_GRAPH_URL = 'https://graph.facebook.com/v19.0';
const manager = require('../notifications/telegramManager');
const alertQueue = require('../notifications/alertQueue');
const formatters = require('../notifications/formatters');
const telegramDestinations = require('../notifications/telegramDestinations');

const DEBUG_LOG = path.join(__dirname, '../../../handoff-debug.log');
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(DEBUG_LOG, line);
}

// Cache page token lookup
const pageTokenCache = new Map();
const PAGE_TOKEN_TTL = 60 * 1000;

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pageTokenCache.entries()) {
    if (now - value.ts > PAGE_TOKEN_TTL * 2) {
      pageTokenCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

async function getPageAccessToken(pageId) {
  const cacheKey = String(pageId);
  const cached = pageTokenCache.get(cacheKey);
  if (cached && cached.ts > Date.now() - PAGE_TOKEN_TTL) {
    return cached.token;
  }
  const page = await prisma.facebookPage.findFirst({
    where: { pageId: String(pageId), isActive: true },
    select: { accessToken: true, pageId: true },
  });
  const token = page?.accessToken || process.env.FB_PAGE_ACCESS_TOKEN;
  pageTokenCache.set(cacheKey, { token, ts: Date.now() });
  return token;
}

// In-memory timers (acceptable for dev; survive until server restart)
const pendingTimers = new Map();  // conversationId → timer handle
const sessionTimers = new Map();  // conversationId → timer handle

// staffChatId → Set<conversationId> (all pending notifications for this staff)
const staffPendingMap = new Map();

let _bot = null;

function init(botInstance) {
  _bot = botInstance;
}

function esc(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bot() {
  if (!_bot) throw new Error('Telegram bot not initialized. Call handoff.init(bot) first.');
  return _bot;
}

function clearDialogState(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return context;
  const { dialogState, ...rest } = context;
  return rest;
}

// ==================== SETTINGS ====================

async function getSettings() {
  let settings = await prisma.handoffSetting.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = { pendingTimeoutSeconds: 30, sessionTimeoutSeconds: 30, offHoursPendingTimeout: 10, workHoursStart: 8, workHoursEnd: 22, botGracePeriodSeconds: 300 };
  }
  return settings;
}

function getPendingTimeout(settings) {
  if (settings.workHoursStart == null || settings.workHoursEnd == null) {
    return settings.pendingTimeoutSeconds;
  }
  const hour = new Date().getHours();
  const inWorkHours = hour >= settings.workHoursStart && hour < settings.workHoursEnd;
  return inWorkHours ? settings.pendingTimeoutSeconds : settings.offHoursPendingTimeout;
}

// ==================== MAIN ENTRY POINT ====================

/**
 * Khi user nhắn FB message mới (conversation.handoffStatus === 'bot'):
 * - Nếu có staff on duty → broadcast DM, bắt đầu timer, return true
 * - Nếu không có staff → return false (bot xử lý như bình thường)
 */
async function initiateHandoff(conversation, messageText) {
  // Bot grace period: sau khi staff kết thúc phiên, bot chăm sóc trong X giây trước khi notify staff lại
  if (conversation.botGraceUntil && new Date() < new Date(conversation.botGraceUntil)) {
    const remaining = Math.ceil((new Date(conversation.botGraceUntil) - Date.now()) / 1000);
    debugLog(`[initiateHandoff] Grace period active (${remaining}s remaining) → BOT handles`);
    return false;
  }

  const onDutyStaff = await prisma.staff.findMany({
    where: { isOnDuty: true, isActive: true },
  });

  debugLog(`[initiateHandoff] sender=${conversation.fbUserId} msg="${messageText.substring(0,40)}"`);
  debugLog(`[initiateHandoff] onDutyStaff=${onDutyStaff.length} (${onDutyStaff.map(s => s.name).join(', ') || 'none'})`);

  if (onDutyStaff.length === 0) {
    debugLog('[initiateHandoff] → No staff on duty → BOT handles');
    const displayName = conversation.fbUserName || 'Khách hàng';
    await alertQueue.alert('no_staff_online', formatters.noStaffOnline(displayName));
    return false;
  }

  const settings = await getSettings();
  const timeout = getPendingTimeout(settings);

  // Phân loại staff: rảnh vs đang có human_active session
  const staffIds = onDutyStaff.map(s => s.id);
  const busyAssignments = await prisma.conversation.findMany({
    where: { handoffStatus: 'human_active', assignedStaffId: { in: staffIds } },
    select: { assignedStaffId: true },
  });
  const busyStaffIdSet = new Set(busyAssignments.map(c => c.assignedStaffId));
  const freeStaff = onDutyStaff.filter(s => !busyStaffIdSet.has(s.id));
  const allStaffBusy = freeStaff.length === 0;

  debugLog(`[initiateHandoff] busyStaff=${busyAssignments.length} freeStaff=${freeStaff.length} (${freeStaff.map(s => s.name).join(', ') || 'NONE'}) allBusy=${allStaffBusy}`);

  const displayName = conversation.fbUserName || 'Khách hàng';
  const notifiedChatIds = [];

  if (allStaffBusy) {
    // Tất cả staff đang bận → bot xử lý ngay, staff được notify để tiếp quản nếu muốn
    // Không set pending_human — status giữ nguyên 'bot', bot xử lý bình thường
    for (const staff of onDutyStaff) {
      try {
        await bot().sendMessage(
          staff.telegramChatId,
          `🤖 <b>Bot đang trả lời khách</b>\n\n👤 ${esc(displayName)}\n💬 <i>"${esc(messageText.substring(0,200))}"</i>\n\n<i>Bạn đang bận, bot đã tự động trả lời. Bấm để tiếp quản nếu muốn.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✋ Tiếp quản từ bot', callback_data: `takeover_${conversation.id}` },
              ]],
            },
          }
        );
      } catch (e) {
        console.error(`[Handoff] Failed to DM staff ${staff.name}:`, e.message);
      }
    }
    debugLog('[initiateHandoff] → allStaffBusy=true, bot notified for takeover → return false');
    return false;
  }

  // Có staff rảnh → set pending_human TRƯỚC khi gửi DM
  // Dùng updateMany với điều kiện handoffStatus='bot' để atomic check-and-set
  // Ngăn race condition khi nhiều webhook cùng xử lý 1 message
  const updateResult = await prisma.conversation.updateMany({
    where: { id: conversation.id, handoffStatus: 'bot' },
    data: { handoffStatus: 'pending_human', humanSessionExpiresAt: null },
  });

  if (updateResult.count === 0) {
    // Concurrent call đã set pending_human trước rồi — bỏ qua, không gửi DM thêm
    debugLog('[initiateHandoff] → Already initiated by concurrent call (race guard), skip DM');
    return true;
  }

  for (const staff of freeStaff) {
    try {
      await bot().sendMessage(
        staff.telegramChatId,
        `🔔 <b>Tin nhắn mới</b>\n\n👤 ${esc(displayName)}\n💬 <i>"${esc(messageText.substring(0,200))}"</i>\n\n⏱ Còn <b>${timeout}s</b> để tiếp nhận`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✋ Nhận cuộc trò chuyện', callback_data: `claim_${conversation.id}` },
            ]],
          },
        }
      );
      const existing = staffPendingMap.get(staff.telegramChatId) || new Set();
      existing.add(conversation.id);
      staffPendingMap.set(staff.telegramChatId, existing);
      notifiedChatIds.push(staff.telegramChatId);
    } catch (e) {
      const errDetail = typeof e.response?.body === 'object' ? JSON.stringify(e.response.body) : (e.response?.body || e.message);
      debugLog(`[initiateHandoff] DM FAILED for ${staff.name} (chatId=${staff.telegramChatId}): ${errDetail}`);
      console.error(`[Handoff] Failed to DM staff ${staff.name}:`, e.message);
    }
  }

  if (notifiedChatIds.length === 0) {
    // Tất cả DM thất bại → revert về bot
    debugLog('[initiateHandoff] → All DMs failed (notifiedChatIds=0) → revert to bot');
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { handoffStatus: 'bot' },
    });
    return false;
  }

  // Thông báo quản lý: có handoff mới
  await manager.send(formatters.handoffTriggered(
    conversation.fbUserName || 'Khách hàng',
    messageText,
    notifiedChatIds.length
  ));

  const timer = setTimeout(
    () => handlePendingTimeout(conversation.id, messageText, notifiedChatIds),
    timeout * 1000
  );
  pendingTimers.set(conversation.id, timer);

  return true;
}

/**
 * Khi user nhắn thêm trong lúc đang PENDING_HUMAN:
 * Forward thêm context cho staff đã được notify (không restart timer)
 */
async function appendPendingMessage(conversation, messageText) {
  const displayName = conversation.fbUserName || 'Khách hàng';
  const convId = conversation.id;

  // Tìm staff đang được notify về conversation này
  for (const [chatId, pendingConvIds] of staffPendingMap.entries()) {
    if (pendingConvIds.has(convId)) {
      try {
        await bot().sendMessage(chatId, `💬 ${esc(displayName)} nhắn thêm: <i>"${esc(messageText.substring(0,200))}"</i>`, {
          parse_mode: 'HTML',
        });
      } catch (e) {
        // ignore
      }
    }
  }
}

// ==================== CLAIM ====================

/**
 * Staff bấm nút hoặc gõ /nhan → nhận conversation
 * Dùng updateMany với where để tránh race condition (chỉ 1 staff thắng)
 */
async function claimConversation(telegramChatId, conversationId, callbackQuery = null) {
  const staff = await prisma.staff.findUnique({ where: { telegramChatId } });
  if (!staff) {
    await bot().sendMessage(telegramChatId, '❌ Bạn chưa được đăng ký trong hệ thống. Liên hệ admin.');
    return false;
  }

  // Transaction: chỉ update nếu vẫn còn pending (tránh race condition)
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || conv.handoffStatus !== 'pending_human') return null;

      const pendingStartedAt = conv.updatedAt;
      const settings = await getSettings();
      const sessionExpiry = new Date(Date.now() + settings.sessionTimeoutSeconds * 1000);

      const result = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          handoffStatus: 'human_active',
          assignedStaffId: staff.id,
          humanSessionExpiresAt: sessionExpiry,
        },
      });
      return { ...result, _pendingStartedAt: pendingStartedAt };
    });
  } catch (e) {
    console.error('[Handoff] Claim transaction error:', e.message);
    await bot().sendMessage(telegramChatId, '❌ Lỗi kỹ thuật. Thử lại.');
    return false;
  }

  if (!updated) {
    // Kiểm tra nguyên nhân thất bại: do bấm nút 2 lần (self-claim) hay đã có người khác nhận
    const existingConv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handoffStatus: true, assignedStaffId: true },
    });
    if (existingConv?.handoffStatus === 'human_active' && existingConv?.assignedStaffId === staff.id) {
      // Bấm nút 2 lần — bản thân đã nhận rồi, không cần báo lỗi
      return false;
    }
    await bot().sendMessage(telegramChatId, 'ℹ️ Cuộc trò chuyện này đã được người khác tiếp nhận rồi.');
    return false;
  }

  // Xóa pending timer
  if (pendingTimers.has(conversationId)) {
    clearTimeout(pendingTimers.get(conversationId));
    pendingTimers.delete(conversationId);
  }

  const settings = await getSettings();
  const displayName = updated.fbUserName || 'Khách hàng';

  // Xóa nút "Nhận cuộc trò chuyện" khỏi tin nhắn gốc để tránh bấm lại
  if (callbackQuery?.message?.message_id) {
    bot().editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: telegramChatId, message_id: callbackQuery.message.message_id }
    ).catch(() => {});
  }

  // Notify staff đã nhận
  await bot().sendMessage(
    telegramChatId,
    `✅ <b>Bạn đang phụ trách ${esc(displayName)}</b>\n\nNhắn bất kỳ để trả lời khách.\n⏱ Phiên tự kết thúc sau ${settings.sessionTimeoutSeconds}s không hoạt động.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔴 Kết thúc phiên', callback_data: `end_${conversationId}` },
        ]],
      },
    }
  );

  // Notify các staff khác đã được DM và xóa khỏi pending set
  for (const [chatId, pendingConvIds] of staffPendingMap.entries()) {
    if (pendingConvIds.has(conversationId)) {
      if (chatId !== telegramChatId) {
        try {
          await bot().sendMessage(chatId, `ℹ️ <b>${esc(staff.name)}</b> đã tiếp nhận — không cần xử lý.`, {
            parse_mode: 'HTML',
          });
        } catch (e) { /* ignore */ }
      }
      pendingConvIds.delete(conversationId);
      if (pendingConvIds.size === 0) staffPendingMap.delete(chatId);
    }
  }

  // Broadcast status group
  broadcastToGroup(`✅ ${staff.name} tiếp nhận → ${displayName}`);

  // Thông báo quản lý
  const pendingMs = Date.now() - (updated._pendingStartedAt?.getTime() || Date.now());
  const waitSeconds = Math.round(Math.abs(pendingMs) / 1000);
  await manager.send(formatters.handoffClaimed(staff.name, displayName, waitSeconds));

  // Thông báo khách đang được kết nối (hoạt động với mọi channel)
  await sendToCustomer(updated, 'Bạn đang được kết nối với tư vấn viên. Vui lòng chờ trong giây lát... 💬').catch(() => {});

  // Bắt đầu session inactivity timer
  resetSessionTimer(conversationId, updated.fbUserId, displayName, settings.sessionTimeoutSeconds);

  return true;
}

/**
 * Staff bấm "Tiếp quản từ bot" — nhận conversation đang ở trạng thái bot
 * Khác claimConversation: cho phép nhận từ handoffStatus = 'bot' (không phải pending_human)
 */
async function takeoverConversation(telegramChatId, conversationId) {
  const staff = await prisma.staff.findUnique({ where: { telegramChatId } });
  if (!staff) {
    await bot().sendMessage(telegramChatId, '❌ Bạn chưa được đăng ký trong hệ thống. Liên hệ admin.');
    return false;
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      // Chỉ cho takeover khi đang ở bot mode (chưa ai nhận)
      if (!conv || conv.handoffStatus !== 'bot') return null;

      const settings = await getSettings();
      const sessionExpiry = new Date(Date.now() + settings.sessionTimeoutSeconds * 1000);

      return tx.conversation.update({
        where: { id: conversationId },
        data: {
          handoffStatus: 'human_active',
          assignedStaffId: staff.id,
          humanSessionExpiresAt: sessionExpiry,
        },
      });
    });
  } catch (e) {
    console.error('[Handoff] Takeover transaction error:', e.message);
    await bot().sendMessage(telegramChatId, '❌ Lỗi kỹ thuật. Thử lại.');
    return false;
  }

  if (!updated) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Không thể tiếp quản — conversation này đã có người xử lý rồi.');
    return false;
  }

  const settings = await getSettings();
  const displayName = updated.fbUserName || 'Khách hàng';

  await bot().sendMessage(
    telegramChatId,
    `✅ <b>Bạn đang tiếp quản ${esc(displayName)}</b>\n\nNhắn bất kỳ để trả lời khách.\n⏱ Phiên tự kết thúc sau ${settings.sessionTimeoutSeconds}s không hoạt động.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔴 Kết thúc phiên', callback_data: `end_${conversationId}` },
        ]],
      },
    }
  );

  broadcastToGroup(`✋ ${staff.name} tiếp quản (từ bot) → ${displayName}`);
  await sendToCustomer(updated, 'Tư vấn viên vừa tham gia để hỗ trợ bạn trực tiếp! 💬').catch(() => {});
  resetSessionTimer(conversationId, updated.fbUserId, displayName, settings.sessionTimeoutSeconds);

  return true;
}

// ==================== RELAY ====================

/**
 * Staff reply trong Telegram DM → gửi tới khách
 *
 * Gửi thẳng qua Facebook API bằng page token đã cấu hình.
 */
async function relayStaffMessage(telegramChatId, text) {
  const staff = await prisma.staff.findUnique({ where: { telegramChatId } });
  if (!staff) return;

  const conversation = await prisma.conversation.findFirst({
    where: { assignedStaffId: staff.id, handoffStatus: 'human_active' },
  });

  if (!conversation) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Bạn không có cuộc hội thoại đang mở.');
    return;
  }

  const sent = await sendFBMessage(conversation.fbUserId, text, getConversationPageId(conversation));
  if (!sent) {
    await bot().sendMessage(telegramChatId, '❌ Gửi tin nhắn thất bại. Kiểm tra cấu hình Facebook Page trong Dashboard > Cài đặt.');
    return;
  }
  if (sent.error) {
    const fbErr = sent.error;
    await bot().sendMessage(telegramChatId, `❌ Gửi tin nhắn thất bại (lỗi ${fbErr.code}): ${fbErr.message.substring(0, 100)}`);
    console.error('[Handoff] relayStaffMessage: FB error detail:', JSON.stringify(sent.error));
    return;
  }

  // Lưu vào DB
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'staff_outbound',
      content: text,
      metadata: { staffId: staff.id, staffName: staff.name },
    },
  });

  // Reset inactivity timer
  const settings = await getSettings();
  resetSessionTimer(conversation.id, conversation.fbUserId, conversation.fbUserName || 'Khách', settings.sessionTimeoutSeconds);
}

/**
 * Reset session inactivity timer từ một caller bên ngoài module.
 */
async function resetSessionTimerExternal(conversationId, fbUserId, displayName) {
  const settings = await getSettings();
  resetSessionTimer(conversationId, fbUserId, displayName, settings.sessionTimeoutSeconds);
}

/**
 * FB user nhắn trong lúc HUMAN_ACTIVE → forward sang Telegram DM của staff
 */
async function relayFBMessageToStaff(conversation, messageText) {
  if (!conversation.assignedStaffId) return;

  const staff = await prisma.staff.findUnique({ where: { id: conversation.assignedStaffId } });
  if (!staff) return;

  const displayName = conversation.fbUserName || 'Khách hàng';

  try {
    await bot().sendMessage(
      staff.telegramChatId,
      `👤 <b>${esc(displayName)}:</b>\n<i>"${esc(messageText.substring(0,200))}"</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    console.error('[Handoff] Failed to relay FB message to staff:', e.message);
  }

  // Reset session timer (có activity từ phía user)
  const settings = await getSettings();
  resetSessionTimer(conversation.id, conversation.fbUserId, displayName, settings.sessionTimeoutSeconds);
}

// ==================== END SESSION ====================

/**
 * Staff gõ /xong hoặc bấm nút "Kết thúc phiên"
 */
async function endSessionByStaff(telegramChatId) {
  const staff = await prisma.staff.findUnique({ where: { telegramChatId } });
  if (!staff) return;

  const conversation = await prisma.conversation.findFirst({
    where: { assignedStaffId: staff.id, handoffStatus: 'human_active' },
  });

  if (!conversation) {
    await bot().sendMessage(telegramChatId, 'ℹ️ Không có phiên nào đang mở.');
    return;
  }

  await endHumanSession(conversation.id, 'staff_ended');
}

async function endHumanSession(conversationId, reason = 'timeout') {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { assignedStaff: true },
  });

  if (!conversation || conversation.handoffStatus !== 'human_active') return;

  // Xóa timers
  if (sessionTimers.has(conversationId)) {
    clearTimeout(sessionTimers.get(conversationId));
    sessionTimers.delete(conversationId);
  }

  // Cập nhật DB — set botGraceUntil để bot chăm sóc trước khi notify staff lại
  const settings = await getSettings();
  const graceUntil = new Date(Date.now() + (settings.botGracePeriodSeconds || 300) * 1000);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { handoffStatus: 'bot', assignedStaffId: null, humanSessionExpiresAt: null, botGraceUntil: graceUntil, context: clearDialogState(conversation.context) },
  });

  const staffName = conversation.assignedStaff?.name || 'Nhân viên';
  const displayName = conversation.fbUserName || 'Khách hàng';

  // Notify staff
  if (conversation.assignedStaff) {
    const staffMsg = reason === 'timeout'
      ? `⏰ Phiên tự động kết thúc do không hoạt động.\n🤖 Bot đã tiếp quản ${displayName}.`
      : `🔚 Phiên kết thúc.\n🤖 Bot đã tiếp quản ${displayName}.`;
    try {
      await bot().sendMessage(conversation.assignedStaff.telegramChatId, staffMsg);
    } catch (e) { /* ignore */ }
  }

  // Broadcast group
  const groupMsg = reason === 'timeout'
    ? `⏰ Phiên ${staffName} ↔ ${displayName} kết thúc (timeout) — Bot tiếp quản`
    : `🔚 ${staffName} kết thúc phiên với ${displayName} — Bot tiếp quản`;
  broadcastToGroup(groupMsg);

  // Thông báo quản lý
  await manager.send(formatters.handoffEnded(staffName, displayName, reason));

  console.log(`[Handoff] Kết thúc phiên (${reason}): gọi bot xử lý tin nhắn cuối của ${displayName}...`);
  const handled = await handleTimedOutHumanSession(conversation);
  if (handled) return;
  console.log(`[Handoff] Bot không xử lý được tin nhắn cuối (handled=false) — gửi thông báo fallback cho ${displayName}`);

  // Bot không xử lý được tin nhắn cuối — gửi thông báo nhờ khách gửi lại (hoạt động với mọi channel)
  await sendToCustomer(
    conversation,
    'Tư vấn viên vừa kết thúc phiên. 🤖 Bot sẽ tiếp tục hỗ trợ bạn — bạn vui lòng gửi lại câu hỏi để mình xử lý nhé!'
  ).catch(() => {});

  // Sau khi staff rảnh, re-notify về các khách hàng đang pending_human
  if (conversation.assignedStaff) {
    await notifyStaffAboutPendingQueue(conversation.assignedStaff.telegramChatId);
  }
}

/**
 * Khi staff vừa kết thúc phiên → kiểm tra xem có khách nào đang pending_human không
 * Nếu có, nhắc staff để họ có thể claim
 */
async function notifyStaffAboutPendingQueue(telegramChatId) {
  try {
    const pending = await prisma.conversation.findMany({
      where: { handoffStatus: 'pending_human' },
      orderBy: { updatedAt: 'asc' },
    });

    if (pending.length === 0) return;

    const settings = await getSettings();
    const timeout = getPendingTimeout(settings);

    for (const conv of pending) {
      try {
        const lastMsg = await prisma.message.findFirst({
          where: { conversationId: conv.id, direction: 'inbound' },
          orderBy: { createdAt: 'desc' },
        });
        const preview = lastMsg?.content || '(không có nội dung)';
        const displayName = conv.fbUserName || 'Khách hàng';

        await bot().sendMessage(
          telegramChatId,
          `🔔 <b>Khách hàng đang chờ</b>\n\n👤 ${esc(displayName)}\n💬 <i>"${esc(String(preview).substring(0,200))}"</i>\n\n⏱ Còn <b>${timeout}s</b> để tiếp nhận`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✋ Nhận cuộc trò chuyện', callback_data: `claim_${conv.id}` },
              ]],
            },
          }
        );

        // Cập nhật map để appendPendingMessage hoạt động đúng
        const existing = staffPendingMap.get(telegramChatId) || new Set();
        existing.add(conv.id);
        staffPendingMap.set(telegramChatId, existing);

        // Reset pending timer
        if (pendingTimers.has(conv.id)) {
          clearTimeout(pendingTimers.get(conv.id));
        }
        const timer = setTimeout(
          () => handlePendingTimeout(conv.id, preview, [telegramChatId]),
          timeout * 1000
        );
        pendingTimers.set(conv.id, timer);
      } catch (e) {
        console.error('[Handoff] Failed to re-notify staff about pending conv:', e.message);
      }
    }
  } catch (e) {
    console.error('[Handoff] notifyStaffAboutPendingQueue error:', e.message);
  }
}

async function handleTimedOutHumanSession(conversation) {
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    select: { direction: true, content: true },
  });

  if (!lastMessage) return false;

  if (lastMessage.direction !== 'inbound') {
    console.log(`[Handoff] Human session timeout: last message was ${lastMessage.direction}; sending takeover notice only.`);
    return false;
  }

  try {
    const botEngine = require('../bot/engine');
    console.log(`[Handoff] Bot tiếp quản: xử lý tin nhắn cuối của khách "${lastMessage.content.substring(0, 50)}..."`);
    const response = await botEngine.processMessage(conversation.fbUserId, lastMessage.content, {
      skipSaveInbound: true,
      channel: conversation.channel || 'unknown',
      pageContext: conversation.pageContext || null,
    });
    if (!response) {
      console.warn('[Handoff] ⚠️ Bot engine trả về response rỗng sau khi kết thúc phiên');
      return false;
    }

    try {
      await sendToCustomer(conversation, response);
    } catch (e) {
      console.error('[Handoff] ❌ Gửi bot response thất bại sau khi kết thúc phiên:', e.message);
      return false;
    }
    console.log(`[Handoff] ✅ Bot đã trả lời khách sau khi staff kết thúc phiên`);
    return true;
  } catch (e) {
    console.error('[Handoff] ❌ Lỗi bot engine sau khi kết thúc phiên:', e.message);
    console.error('[Handoff]    → Stack:', e.stack);
    return false;
  }
}

// ==================== TIMEOUT HANDLERS ====================

async function handlePendingTimeout(conversationId, originalMessage, notifiedChatIds) {
  pendingTimers.delete(conversationId);

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.handoffStatus !== 'pending_human') return;

  // Trả về bot mode — set botGraceUntil để tránh notify staff ngay sau khi bot tự xử lý
  const settings = await getSettings();
  const graceUntil = new Date(Date.now() + (settings.botGracePeriodSeconds || 300) * 1000);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { handoffStatus: 'bot', botGraceUntil: graceUntil, context: clearDialogState(conversation.context) },
  });

  // Notify staff đã nhận DM và clear staffPendingMap
  for (const chatId of notifiedChatIds) {
    try {
      await bot().sendMessage(chatId, `⏰ Không có ai tiếp nhận — bot đã tự động trả lời ${conversation.fbUserName || 'khách hàng'}.`);
    } catch (e) { /* ignore */ }
    const pendingConvIds = staffPendingMap.get(chatId);
    if (pendingConvIds) {
      pendingConvIds.delete(conversationId);
      if (pendingConvIds.size === 0) staffPendingMap.delete(chatId);
    }
  }

  // Clean up any remaining entries in staffPendingMap for this conversation
  for (const [chatId, pendingConvIds] of staffPendingMap.entries()) {
    pendingConvIds.delete(conversationId);
    if (pendingConvIds.size === 0) staffPendingMap.delete(chatId);
  }

  broadcastToGroup(`⏰ Timeout — bot tự xử lý ${conversation.fbUserName || 'khách hàng'}`);
  await alertQueue.alert(
    `handoff_timeout_${conversationId}`,
    formatters.handoffTimeout(conversation.fbUserName || 'Khách hàng')
  );

  // Bot xử lý message ban đầu
  try {
    const botEngine = require('../bot/engine');
    console.log(`[Handoff] 🤖 Bot processing original message after timeout: "${originalMessage.substring(0, 50)}..."`);
    const response = await botEngine.processMessage(conversation.fbUserId, originalMessage, {
      skipSaveInbound: true,
      channel: conversation.channel || 'unknown',
      pageContext: conversation.pageContext || null,
    });
    if (response) {
      const text = typeof response === 'string' ? response : response.text;
      console.log(`[Handoff] 🤖 Bot response: "${(text || '').substring(0, 50)}..."`);
      await sendToCustomer(conversation, response);
    } else {
      console.warn('[Handoff] ⚠️ Bot returned empty response');
    }
  } catch (e) {
    console.error('[Handoff] ❌ Bot engine error after timeout:', e.message);
    console.error('[Handoff]    → Stack:', e.stack);
  }
}

function resetSessionTimer(conversationId, fbUserId, displayName, timeoutSeconds) {
  if (sessionTimers.has(conversationId)) {
    clearTimeout(sessionTimers.get(conversationId));
  }

  const timer = setTimeout(
    () => endHumanSession(conversationId, 'timeout'),
    timeoutSeconds * 1000
  );
  sessionTimers.set(conversationId, timer);
}

// ==================== HELPERS ====================

function getConversationPageId(conversation) {
  const context = conversation?.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  return context.facebookPageId || context.pageId || null;
}

/**
 * Gửi message tới Facebook user
 * Dùng page token động từ FacebookPage table nếu có, fallback về global token
 * @param {string} fbUserId - Facebook user PSID
 * @param {string} text - Nội dung tin nhắn
 * @param {string} [pageId] - ID của Facebook Page (bắt buộc để gửi đúng page)
 */
/**
 * Gửi tin nhắn hệ thống tới khách qua Facebook Graph API trực tiếp.
 */
async function sendToCustomer(conversation, text) {
  await sendFBMessage(conversation.fbUserId, text, getConversationPageId(conversation));
}

/**
 * Gửi message tới Facebook user
 * @param {string} fbUserId - Facebook user PSID
 * @param {string} text - Nội dung tin nhắn
 * @param {string} [pageId] - ID của Facebook Page
 * @returns {object|undefined} - Kết quả gửi hoặc undefined nếu thất bại
 */
async function sendFBMessage(fbUserId, message, pageId) {
  try {
    const accessToken = pageId ? await getPageAccessToken(pageId) : process.env.FB_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('[Handoff] ❌ No Facebook page access token configured');
      console.error('[Handoff]   → Kiểm tra FB_PAGE_ACCESS_TOKEN trong .env');
      return;
    }

    const messageData = typeof message === 'string'
      ? { text: message }
      : (message?.text ? message : { text: String(message || '') });
    const logText = messageData.text || '[rich message]';

    const response = await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      { recipient: { id: fbUserId }, message: messageData },
      { params: { access_token: accessToken } }
    );
    console.log(`[Handoff] ✅ FB message sent to ${fbUserId}: "${logText.substring(0, 50)}..."`);
    return response.data;
  } catch (e) {
    const fbError = e.response?.data?.error;
    const errMsg = fbError ? `code=${fbError.code} message=${fbError.message}` : e.message;
    console.error('[Handoff] ❌ FB send error:', errMsg);
    
    // Trả về object chứa lỗi (không phải undefined) để relayStaffMessage biết lỗi cụ thể
    if (fbError) {
      return { error: fbError };
    }
  }
}

function broadcastToGroup(text) {
  telegramDestinations.sendStatus(text).catch(() => {});
}

/**
 * Dashboard phân công thủ công: gán conversation cho staff cụ thể
 * Gọi từ API endpoint, không cần staff nhấn nút Telegram
 */
async function notifyStaffAssignment(telegramChatId, conversation) {
  try {
    const displayName = conversation.fbUserName || 'Khách hàng';
    const settings = await getSettings();

    await bot().sendMessage(
      telegramChatId,
      `📋 <b>Admin đã phân công cho bạn</b>\n\n👤 ${esc(displayName)}\n\nNhắn bất kỳ để trả lời khách.\n⏱ Phiên tự kết thúc sau ${settings.sessionTimeoutSeconds}s không hoạt động.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔴 Kết thúc phiên', callback_data: `end_${conversation.id}` },
          ]],
        },
      }
    );

    await sendToCustomer(conversation, 'Tư vấn viên đã sẵn sàng hỗ trợ bạn! 💬').catch(() => {});

    resetSessionTimer(conversation.id, conversation.fbUserId, displayName, settings.sessionTimeoutSeconds);
  } catch (e) {
    console.error('[Handoff] notifyStaffAssignment error:', e.message);
  }
}

module.exports = {
  init,
  initiateHandoff,
  appendPendingMessage,
  claimConversation,
  takeoverConversation,
  notifyStaffAssignment,
  relayStaffMessage,
  relayFBMessageToStaff,
  endSessionByStaff,
  endHumanSession,
  resetSessionTimerExternal,
};
