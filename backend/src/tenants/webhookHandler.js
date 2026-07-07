/**
 * Tenant Webhook Handler
 *
 * Nhận POST /chatwoot-webhook/:slug
 * Flow: resolve tenant → validate HMAC → adapt message → bot/handoff
 */

const getPrisma = require('../db');
const prisma = getPrisma();
const registry  = require('./registry');
const { validateWebhookSignature } = require('../chatwoot/crypto');
const { adaptMessage, shouldSkip }  = require('../adapters/chatwootAdapter');
const { createClientFromTenant }    = require('../chatwoot/api');
const botEngine  = require('../bot/engine');
const handoff    = require('./handoff');

// Dedup cache: Chatwoot có thể gửi lại cùng message_id sau khi conversation status thay đổi
// Giữ trong 5 phút — đủ để ngăn loop nhưng không block tin nhắn mới
const _processedMsgIds = new Map();
function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  if (_processedMsgIds.has(msgId)) return true;
  _processedMsgIds.set(msgId, Date.now());
  setTimeout(() => _processedMsgIds.delete(msgId), 5 * 60 * 1000);
  return false;
}

// ==================== MAIN HANDLER ====================

async function handleTenantWebhook(req, res) {
  // 1. Resolve tenant từ slug
  const { slug } = req.params;
  const tenant = await registry.getBySlug(slug);

  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found or inactive' });
  }

  // 2. Validate HMAC signature (nếu tenant cấu hình webhookSecret)
  // Chatwoot ký với "timestamp.body" — cần truyền cả X-Chatwoot-Timestamp
  const signature = req.headers['x-chatwoot-signature'] || req.headers['x-hub-signature-256'] || '';
  const timestamp = req.headers['x-chatwoot-timestamp'] || '';
  const rawBody   = req.rawBody; // capture bởi rawBody middleware trong index.js

  if (tenant._webhookSecret) {
    if (!rawBody) {
      console.error(`[TenantWebhook:${slug}] rawBody không có — cần rawBody middleware`);
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!validateWebhookSignature(rawBody, signature, tenant._webhookSecret, timestamp)) {
      console.warn(`[TenantWebhook:${slug}] Invalid webhook signature — request rejected`);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  }

  // 3. Trả 200 ngay (Chatwoot không retry nếu timeout)
  res.sendStatus(200);

  const event = req.body;
  const chatwootMsgId = event.id;

  // 4. Kiểm tra có phải tin nhắn incoming hợp lệ không
  const skipReason = shouldSkip(event);
  console.log(`[TenantWebhook:${slug}] msg_type=${event.message_type} sender_type=${event.sender?.type} private=${event.private} msgId=${chatwootMsgId} convId=${event.conversation?.id} → ${skipReason || 'PROCESS'}`);
  if (skipReason) return;

  // 5a. Dedup: Chatwoot gửi lại cùng message_id khi conversation status thay đổi (web widget loop)
  if (isDuplicateMessage(chatwootMsgId)) {
    console.log(`[TenantWebhook:${slug}] DUPLICATE msgId=${chatwootMsgId} — bỏ qua`);
    return;
  }

  // 5b. Resolve channelConfig cho inbox này
  const inboxId = event.conversation?.inbox_id;
  const channelConfig = registry.resolveChannelConfig(tenant, inboxId);

  // 6. Resolve userId từ webhook payload (identifier = Facebook PSID / source_id)
  // Với dedicated Chatwoot, dùng Agent Bot token — token này không được phép gọi /contacts API.
  // Với shared model, dùng user token (full access) nên có thể gọi getContactSourceId.
  const cwClient = createClientFromTenant(tenant);
  let resolvedUserId = null;
  const chatwootContactId = event.sender?.id;
  const rawIdentifier = event.conversation?.meta?.sender?.identifier || event.sender?.identifier;

  if (!rawIdentifier && chatwootContactId && tenant.chatwootModel === 'shared') {
    try {
      resolvedUserId = await cwClient.getContactSourceId(chatwootContactId, inboxId);
    } catch (e) {
      console.error(`[TenantWebhook:${slug}] getContactSourceId error:`, e.message);
    }
  }

  // 7. Adapt message → unified format
  const msg = adaptMessage(event, tenant, channelConfig, resolvedUserId);

  if (!msg.userId || !msg.chatwootConversationId) {
    console.warn(`[TenantWebhook:${slug}] Không xác định được userId hoặc conversationId`);
    return;
  }

  try {
    await processUnifiedMessage(msg, tenant, cwClient, channelConfig);
  } catch (err) {
    console.error(`[TenantWebhook:${slug}] Error:`, err.message);
  }
}

// ==================== PROCESS ====================

async function processUnifiedMessage(msg, tenant, cwClient, channelConfig) {
  const { tenantId, chatwootConversationId, userId, senderName, content, channel, pageContext } = msg;

  // Tìm hoặc tạo conversation
  let conversation = await prisma.conversation.findFirst({
    where: { chatwootConversationId, tenantId },
  });

  if (!conversation) {
    // Fallback tìm theo prefixed userId
    conversation = await prisma.conversation.findFirst({
      where: { fbUserId: userId, tenantId },
    });
  }

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        fbUserId:              userId,
        fbUserName:            senderName,
        handoffStatus:         'bot',
        chatwootConversationId,
        channel,
        tenantId,
        pageContext,
      },
    });
  } else {
    const needsUpdate = !conversation.chatwootConversationId
      || (conversation.channel === 'unknown' && channel !== 'unknown')
      || (pageContext && JSON.stringify(conversation.pageContext) !== JSON.stringify(pageContext));

    if (needsUpdate) {
      const updateData = { chatwootConversationId, channel };
      if (pageContext) updateData.pageContext = pageContext;
      await prisma.conversation.update({ where: { id: conversation.id }, data: updateData });
      conversation = { ...conversation, chatwootConversationId, channel, pageContext: pageContext || conversation.pageContext };
    }
  }

  // Lưu tin nhắn inbound
  await botEngine.saveMessage(conversation.id, 'inbound', content);

  // HUMAN_ACTIVE: forward cho staff
  if (conversation.handoffStatus === 'human_active') {
    await handoff.relayToStaff(conversation, tenant, content);
    return;
  }

  // PENDING_HUMAN: thêm context vào Telegram
  if (conversation.handoffStatus === 'pending_human') {
    await handoff.appendPendingMessage(conversation, tenant, content);
    return;
  }

  // BOT mode: thử handoff nếu không có dialog đang active
  const hasActiveDialog = !!(conversation.context?.dialogState);
  if (!hasActiveDialog) {
    const didHandoff = await handoff.initiateHandoff(conversation, tenant, content);
    if (didHandoff) return;
  }

  // Bot xử lý
  const knowledgeFilter = channelConfig?.knowledgeFilter || [];
  const botPersonaOverride = channelConfig ? null : tenant.defaultPersona;

  const reply = await botEngine.processMessage(conversation.fbUserId, content, {
    skipSaveInbound: true,
    channel,
    pageContext: conversation.pageContext,
    knowledgeFilter,
    botPersonaOverride: botPersonaOverride || tenant.defaultPersona,
    tenantId,
  });

  if (reply) {
    await cwClient.sendMessage(chatwootConversationId, reply);
  }
}

module.exports = { handleTenantWebhook };
