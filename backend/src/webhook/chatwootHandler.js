const botEngine = require('../bot/engine');
const { saveMessage } = botEngine;
const chatwootApi = require('../chatwoot/api');
const handoff = require('../telegram/handoff');
const getPrisma = require('../db');
const prisma = getPrisma();

// Dedup cache chống Chatwoot gửi lại cùng message_id (web widget loop)
const _processedMsgIds = new Map();
function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  if (_processedMsgIds.has(msgId)) return true;
  _processedMsgIds.set(msgId, Date.now());
  setTimeout(() => _processedMsgIds.delete(msgId), 5 * 60 * 1000);
  return false;
}

// Lookup ChannelConfig theo inbox_id, cache trong memory để tránh query mỗi message
const channelConfigCache = new Map();
async function getChannelConfig(inboxId) {
  if (!inboxId) return null;
  if (channelConfigCache.has(inboxId)) return channelConfigCache.get(inboxId);
  const config = await prisma.channelConfig.findUnique({ where: { inboxId: String(inboxId) } });
  // Cache 5 phút
  channelConfigCache.set(inboxId, config);
  setTimeout(() => channelConfigCache.delete(inboxId), 5 * 60 * 1000);
  return config;
}

// Đọc URL context mà Chatwoot widget gửi lên qua custom_attributes
function extractPageContext(event) {
  const attrs = event.conversation?.additional_attributes
    || event.conversation?.meta?.additional_attributes
    || {};
  const currentUrl = attrs.currentUrl || attrs.current_url || null;
  const pageTitle = attrs.pageTitle || attrs.page_title || null;
  if (!currentUrl) return null;
  return { currentUrl, pageTitle };
}

async function handleChatwootWebhook(req, res) {
  res.sendStatus(200);

  const event = req.body;
  if (event.event !== 'message_created') return;

  const chatwootConversationId = event.conversation?.id != null ? String(event.conversation.id) : null;
  const messageType = event.message_type;
  const isPrivate = event.private === true;

  // Chỉ xử lý tin nhắn đến từ khách — outgoing bỏ qua hoàn toàn
  const senderType = event.sender?.type;
  const chatwootMsgId = event.id;
  console.log(`[ChatwootWebhook] convId=${chatwootConversationId} msg_type=${messageType} sender_type=${senderType} private=${isPrivate} msgId=${chatwootMsgId}`);
  if (messageType !== 'incoming') return;
  if (!event.content?.trim()) return;
  if (senderType && senderType !== 'contact') return;
  if (isDuplicateMessage(chatwootMsgId)) {
    console.log(`[ChatwootWebhook] DUPLICATE msgId=${chatwootMsgId} — bỏ qua`);
    return;
  }

  const senderName = event.conversation?.meta?.sender?.name || event.sender?.name || 'Khách';
  const messageText = event.content;
  const chatwootContactId = event.sender?.id;
  const inboxId = event.conversation?.inbox_id;

  if (!chatwootConversationId) {
    console.warn('[ChatwootWebhook] Thiếu chatwootConversationId', { chatwootContactId });
    return;
  }

  // Resolve channel type từ ChannelConfig
  const channelConfig = await getChannelConfig(inboxId);
  const channel = channelConfig?.channelType || 'unknown';
  const pageContext = extractPageContext(event);

  // Lấy source_id: Facebook PSID hoặc UUID của web visitor
  // Chatwoot lưu ở source_id (contact_inboxes), không phải identifier
  let userSourceId = event.conversation?.meta?.sender?.identifier || event.sender?.identifier;
  if (!userSourceId && chatwootContactId) {
    try {
      userSourceId = await chatwootApi.getContactSourceId(chatwootContactId, inboxId);
    } catch (e) {
      console.error('[ChatwootWebhook] Không lấy được source_id từ Chatwoot API:', e.message);
    }
  }
  // Fallback cho website/WhatsApp/Line: dùng chatwoot_contact_<id>
  const userId = userSourceId || (chatwootContactId ? `chatwoot_contact_${chatwootContactId}` : null);

  if (!userId) {
    console.warn('[ChatwootWebhook] Không xác định được user ID', { chatwootConversationId, chatwootContactId });
    return;
  }

  try {
    // Tìm bằng chatwootConversationId trước (hoạt động với mọi channel)
    let conversation = await prisma.conversation.findFirst({
      where: { chatwootConversationId }
    });

    // Fallback: tìm bằng userId (hữu ích khi conversation được tạo qua Facebook webhook trực tiếp)
    if (!conversation) {
      conversation = await prisma.conversation.findFirst({
        where: { fbUserId: userId }
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          fbUserId: userId,
          fbUserName: senderName,
          handoffStatus: 'bot',
          chatwootConversationId,
          channel,
          pageContext
        }
      });
    } else {
      // Cập nhật channel + pageContext nếu chưa có hoặc pageContext thay đổi
      const needsUpdate =
        !conversation.chatwootConversationId ||
        (conversation.channel === 'unknown' && channel !== 'unknown') ||
        (pageContext && JSON.stringify(conversation.pageContext) !== JSON.stringify(pageContext));

      if (needsUpdate) {
        const updateData = { chatwootConversationId, channel };
        if (pageContext) updateData.pageContext = pageContext;
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: updateData
        });
        conversation = { ...conversation, chatwootConversationId, channel, pageContext: pageContext || conversation.pageContext };
      }
    }

    // Lưu tin nhắn inbound vào DB trước khi routing
    await saveMessage(conversation.id, 'inbound', messageText);

    // HUMAN_ACTIVE: notify staff qua Telegram (staff có thể reply từ Chatwoot hoặc Telegram)
    if (conversation.handoffStatus === 'human_active') {
      await handoff.relayFBMessageToStaff(conversation, messageText);
      return;
    }

    // PENDING_HUMAN: đang chờ staff nhận, gửi context thêm vào Telegram
    if (conversation.handoffStatus === 'pending_human') {
      await handoff.appendPendingMessage(conversation, messageText);
      return;
    }

    // BOT mode: bỏ qua handoff khi đang trong dialog flow (đặt lịch, ...)
    const hasActiveDialog = !!(conversation.context?.dialogState);
    if (!hasActiveDialog) {
      const shouldHandoff = await handoff.initiateHandoff(conversation, messageText);
      if (shouldHandoff) return;
    }

    // Truyền channel + pageContext + knowledgeFilter + tenantId vào bot engine
    const reply = await botEngine.processMessage(conversation.fbUserId, messageText, {
      skipSaveInbound: true,
      channel,
      pageContext: conversation.pageContext,
      knowledgeFilter: channelConfig?.knowledgeFilter || [],
      botPersonaOverride: channelConfig?.botPersonaOverride || null,
      tenantId: conversation.tenantId || null
    });
    if (reply) {
      await chatwootApi.sendMessage(chatwootConversationId, reply);
    }

  } catch (err) {
    console.error('[ChatwootWebhook] Error:', err.message);
  }
}

module.exports = { handleChatwootWebhook };
