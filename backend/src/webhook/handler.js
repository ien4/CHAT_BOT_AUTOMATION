const crypto = require('crypto');
const axios = require('axios');
const botEngine = require('../bot/engine');
const handoff = require('../telegram/handoff');
const facebookIngress = require('./facebookIngress');
const { createWebhookEventReceiptRepository } = require('./webhookEventReceiptRepository');

const FB_GRAPH_URL = 'https://graph.facebook.com/v19.0';
const getPrisma = require('../db');
const prisma = getPrisma();

// Durable event receipt repository — lazily created, only used in enforce mode.
let eventReceiptRepo = null;
function getEventReceiptRepo() {
  if (!eventReceiptRepo) eventReceiptRepo = createWebhookEventReceiptRepository({ client: prisma });
  return eventReceiptRepo;
}

// Cache FacebookPage lookup để tránh query DB mỗi event
const pageCache = new Map();
const PAGE_CACHE_TTL = 60 * 1000; // 60 giây

// In-memory anti-spam guard per Facebook sender.
const rateLimitState = new Map();
const RATE_LIMIT_WINDOW_MS = Number(process.env.MESSAGE_RATE_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_MESSAGES = Number(process.env.MESSAGE_RATE_MAX || 10);
const RATE_LIMIT_BURST_WINDOW_MS = Number(process.env.MESSAGE_BURST_WINDOW_MS || 10_000);
const RATE_LIMIT_BURST_MAX = Number(process.env.MESSAGE_BURST_MAX || 5);
const RATE_LIMIT_BLOCK_MS = Number(process.env.MESSAGE_RATE_BLOCK_MS || 120_000);
const RATE_LIMIT_WARNING_COOLDOWN_MS = Number(process.env.MESSAGE_RATE_WARNING_COOLDOWN_MS || 60_000);

function maskId(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.length <= 4) return '***';
  return `***${raw.slice(-4)}`;
}

function safeError(error) {
  return {
    name: error?.name || 'Error',
    status: error?.response?.status || null,
    code: error?.code || null,
  };
}

function summarizeMessagingEvent(event) {
  const text = event?.message?.text;
  const attachments = event?.message?.attachments;
  const postbackPayload = event?.postback?.payload;
  const quickReplyPayload = event?.message?.quick_reply?.payload;

  return {
    senderId: maskId(event?.sender?.id),
    recipientId: maskId(event?.recipient?.id),
    pageId: maskId(event?._pageContext?.pageId),
    hasText: typeof text === 'string',
    textLength: typeof text === 'string' ? text.length : 0,
    hasAttachments: Array.isArray(attachments) && attachments.length > 0,
    attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
    hasPostback: Boolean(postbackPayload),
    hasQuickReply: Boolean(quickReplyPayload),
    payloadLength: postbackPayload ? String(postbackPayload).length : quickReplyPayload ? String(quickReplyPayload).length : 0,
    isEcho: Boolean(event?.message?.is_echo),
  };
}

function logWebhookInfo(label, meta = {}) {
  console.log(`[Webhook] ${label}`, meta);
}

function logWebhookWarn(label, meta = {}) {
  console.warn(`[Webhook] ${label}`, meta);
}

function logWebhookError(label, error, meta = {}) {
  console.error(`[Webhook] ${label}`, { ...meta, error: safeError(error) });
}

setInterval(() => {
  const now = Date.now();
  for (const [senderId, state] of rateLimitState.entries()) {
    const lastSeen = state.timestamps?.[state.timestamps.length - 1] || state.blockedUntil || 0;
    if (now - lastSeen > RATE_LIMIT_BLOCK_MS * 2) {
      rateLimitState.delete(senderId);
    }
  }
}, 5 * 60 * 1000);

async function lookupPage(pageEntryId) {
  const cacheKey = String(pageEntryId);
  const cached = pageCache.get(cacheKey);
  if (cached && cached.ts > Date.now() - PAGE_CACHE_TTL) {
    return cached.data;
  }
  // pageId là @unique. Lấy cả isActive + tenantId để resolver phân loại chính xác.
  // Chỉ select field cần thiết — không kéo full record xuống tầng sâu, không log record.
  const page = await prisma.facebookPage.findUnique({
    where: { pageId: String(pageEntryId) },
    select: {
      pageId: true, accessToken: true, tenantId: true,
      botPersona: true, knowledgeFilter: true, isActive: true,
    },
  });
  pageCache.set(cacheKey, { data: page, ts: Date.now() });
  return page;
}

/**
 * Invalidate the cached security authority for a single Facebook Page after a
 * management mutation (disable, tenant reassignment, access token rotation).
 * The next event re-reads the DB, so a disabled/reassigned Page is never accepted
 * from stale cache. No token/PII is logged.
 * @param {string} pageId
 */
function invalidateFacebookPageCache(pageId) {
  if (pageId === undefined || pageId === null) return false;
  return pageCache.delete(String(pageId));
}

/**
 * Invalidate every cached Page whose resolved tenant is the given tenantId (e.g.
 * when a Tenant is disabled). Fail-safe: on any doubt the entry is dropped.
 * @param {string} tenantId
 */
function invalidateFacebookTenantCache(tenantId) {
  if (!tenantId) return 0;
  let removed = 0;
  for (const [key, entry] of pageCache.entries()) {
    if (entry && entry.data && entry.data.tenantId === tenantId) {
      pageCache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Resolve tenant context cho một Facebook Page ID (entry.id).
 * Fail-closed: KHÔNG default tenant, KHÔNG fallback global token, KHÔNG dùng channel-config mapping.
 * Nguồn tenant DUY NHẤT cho Facebook direct là FacebookPage.tenantId.
 * @returns {{ ok: true, pageId, tenantId, accessToken, botPersona, knowledgeFilter }
 *          | { ok: false, reason: 'PAGE_NOT_REGISTERED'|'PAGE_DISABLED'|'PAGE_TENANT_MISSING' }}
 */
async function resolveFacebookPageContext(entryId) {
  const page = await lookupPage(entryId);
  if (!page) return { ok: false, reason: 'PAGE_NOT_REGISTERED' };
  if (page.isActive === false) return { ok: false, reason: 'PAGE_DISABLED' };
  if (!page.tenantId) return { ok: false, reason: 'PAGE_TENANT_MISSING' };
  return {
    ok: true,
    pageId: page.pageId,
    tenantId: page.tenantId,
    accessToken: page.accessToken,
    botPersona: page.botPersona,
    knowledgeFilter: page.knowledgeFilter || [],
  };
}

// Chỉ warn một lần khi FB_APP_SECRET chưa cấu hình (dev/local), tránh spam log.
let appSecretWarningLogged = false;

/**
 * Lấy FB_APP_SECRET nếu đã cấu hình thật (không rỗng/khoảng trắng).
 * Không log giá trị.
 * @returns {string|null}
 */
function getWebhookAppSecret() {
  const secret = process.env.FB_APP_SECRET;
  if (typeof secret === 'string' && secret.trim().length > 0) {
    return secret;
  }
  return null;
}

/**
 * So sánh hai chuỗi chữ ký theo constant-time. Fail an toàn nếu khác độ dài
 * hoặc input không hợp lệ. Không log giá trị chữ ký.
 * @returns {boolean}
 */
function safeCompareSignatures(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string') return false;
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (_) {
    return false;
  }
}

/**
 * Xác thực header `x-hub-signature-256` = `sha256=<hex>` của
 * HMAC-SHA256(req.rawBody, FB_APP_SECRET).
 * KHÔNG log rawBody / appSecret / giá trị chữ ký.
 * @returns {{ configured: boolean, hasSignature: boolean, valid: boolean }}
 */
function verifyWebhookSignature(req) {
  const appSecret = getWebhookAppSecret();
  if (!appSecret) {
    return { configured: false, hasSignature: false, valid: false };
  }

  const header = typeof req.get === 'function'
    ? req.get('x-hub-signature-256')
    : req.headers?.['x-hub-signature-256'];
  const hasSignature = typeof header === 'string' && header.length > 0;
  if (!hasSignature) {
    return { configured: true, hasSignature: false, valid: false };
  }

  const rawBody = req.rawBody;
  if (!(Buffer.isBuffer(rawBody) || typeof rawBody === 'string')) {
    return { configured: true, hasSignature: true, valid: false };
  }

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const valid = safeCompareSignatures(expected, header);
  return { configured: true, hasSignature: true, valid };
}

/**
 * Verify Facebook webhook (GET request)
 */
async function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    logWebhookInfo('verify_success');
    return res.status(200).send(challenge);
  }

  logWebhookWarn('verify_failed', { hasMode: Boolean(mode), hasToken: Boolean(token), hasChallenge: Boolean(challenge) });
  return res.sendStatus(403);
}

/**
 * Handle incoming Facebook messages (POST request)
 */
async function handleMessage(req, res) {
  // Xác thực chữ ký X-Hub-Signature-256 TRƯỚC khi ack 200 và trước khi xử lý event.
  const signature = verifyWebhookSignature(req);
  if (signature.configured) {
    if (!signature.valid) {
      logWebhookWarn('signature_rejected', {
        hasSecret: true,
        hasSignature: signature.hasSignature,
        valid: false,
      });
      return res.sendStatus(403);
    }
  } else if (!appSecretWarningLogged) {
    // Dev/local không có FB_APP_SECRET: giữ behavior cũ, chỉ warn một lần (không lộ secret).
    appSecretWarningLogged = true;
    logWebhookWarn('signature_skipped_no_secret', { hasSecret: false });
  }

  const { body } = req;

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  // Runtime canonical mode (default off). off/shadow keep the legacy early-ACK
  // path below; enforce reserves each event durably BEFORE acknowledging.
  const runtimeMode = facebookIngress.resolveRuntimeMode();
  if (runtimeMode === 'enforce') {
    return handleMessageEnforce(req, res, body);
  }

  // Always respond 200 immediately (Facebook requires this within 20s)
  res.status(200).send('EVENT_RECEIVED');

  // Process each entry asynchronously — multi-page aware
  const entries = body.entry || [];
  logWebhookInfo('page_event_received', { entryCount: entries.length });
  for (const entry of entries) {
    const pageEntryId = entry.id; // Facebook Page ID
    const pageContext = await resolveFacebookPageContext(pageEntryId);

    const messaging = entry.messaging || [];
    logWebhookInfo('entry_processing', {
      pageId: maskId(pageEntryId),
      messagingCount: messaging.length,
      resolved: pageContext.ok,
      reason: pageContext.ok ? undefined : pageContext.reason,
    });

    // Fail-closed ở event-level: page chưa đăng ký / thiếu tenant / disabled →
    // không gọi Bot, không tạo Conversation, không fallback global token.
    // Request vẫn đã ack 200 ở trên để tránh Facebook retry storm.
    if (!pageContext.ok) {
      logWebhookWarn('page_context_unresolved', { pageId: maskId(pageEntryId), reason: pageContext.reason });
      continue;
    }

    for (const event of messaging) {
      // Gắn tenant + page context (đã resolve) vào event để downstream dùng đúng tenant/token
      event._pageContext = pageContext;
      logWebhookInfo('messaging_event_received', summarizeMessagingEvent(event));
      // Shadow mode: build/validate canonical envelope for parity only. Best-effort,
      // never blocks, never double-processes; no raw payload/secret logged.
      if (runtimeMode === 'shadow') {
        try { facebookIngress.observeVerifiedIngress(event, pageContext, { mode: 'shadow' }); } catch (_) {}
      }
      await processEvent(event);
    }
  }
}

/**
 * Enforce-mode ingress: durably RESERVE each verified, tenant-resolved event
 * BEFORE acknowledging (NO_SUCCESS_ACK_BEFORE_DURABLE_ACCEPTANCE). Duplicates do
 * not process; missing event identity fails closed; a DB failure before durable
 * acceptance answers retryable (503) so Meta re-delivers. AI/tool processing runs
 * only AFTER durable acceptance.
 */
async function handleMessageEnforce(req, res, body) {
  const entries = body.entry || [];
  const accepted = [];
  let repo;
  try {
    repo = getEventReceiptRepo();
    for (const entry of entries) {
      const pageContext = await resolveFacebookPageContext(entry.id);
      if (!pageContext.ok) {
        logWebhookWarn('enforce_page_unresolved', { pageId: maskId(entry.id), reason: pageContext.reason });
        continue;
      }
      const tokenAuth = facebookIngress.checkPageTokenAuthority(pageContext, 'enforce');
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        event._pageContext = pageContext;
        let envelope;
        try {
          envelope = facebookIngress.buildVerifiedCanonical(event, pageContext, {});
        } catch (identityErr) {
          // Missing trustworthy event identity → fail-closed, no processing.
          logWebhookWarn('enforce_event_identity_unavailable', { pageId: maskId(pageContext.pageId), code: identityErr && identityErr.code });
          continue;
        }
        if (!tokenAuth.ok) {
          logWebhookWarn('enforce_token_authority_ambiguous', { pageId: maskId(pageContext.pageId) });
          continue;
        }
        const { reservation, ack } = await facebookIngress.acceptEventDurably({ repo, envelope });
        logWebhookInfo('enforce_reservation', { pageId: maskId(pageContext.pageId), result: reservation.result });
        if (ack.process) accepted.push({ event, key: envelope.idempotencyKey });
      }
    }
    // Durable acceptance succeeded → acknowledge.
    if (!res.headersSent) res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    // DB/repository failure before durable acceptance → retryable so Meta retries.
    logWebhookError('enforce_durable_acceptance_failed', err);
    if (!res.headersSent) res.sendStatus(503);
    return;
  }

  // Process ONLY durably-accepted events, after ACK.
  for (const item of accepted) {
    try {
      await processEvent(item.event);
      await repo.markCompleted(item.key);
    } catch (procErr) {
      logWebhookError('enforce_processing_failed', procErr);
      try { await repo.markRetryableFailure(item.key, 'PROCESSING_FAILED'); } catch (_) {}
    }
  }
}

/**
 * Process individual messaging event
 */
async function processEvent(event) {
  try {
    // Handle text messages
    if (event.message && event.message.text && !event.message.is_echo) {
      const quickReplyPayload = event.message.quick_reply?.payload;
      if (quickReplyPayload) {
        // Quick reply buttons send message events, but carry a payload — route like postback
        await handlePostback({ sender: event.sender, postback: { payload: quickReplyPayload }, _pageContext: event._pageContext });
      } else {
        await handleTextMessage(event);
      }
    }

    // Handle postback (button clicks)
    if (event.postback) {
      await handlePostback(event);
    }

    // Handle attachments (images, files)
    if (event.message && event.message.attachments) {
      await handleAttachment(event);
    }
  } catch (error) {
    logWebhookError('event_processing_failed', error, summarizeMessagingEvent(event));
  }
}

/**
 * Handle text messages — với handoff routing
 */
async function handleTextMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message.text;
  const pageCtx = event._pageContext;
  const tenantId = pageCtx?.tenantId;

  logWebhookInfo('text_event_processing', summarizeMessagingEvent(event));

  // Defensive fail-closed: entry chưa resolve tenant đã bị skip ở handleMessage,
  // nhưng vẫn chặn ở đây để không bao giờ gọi Bot/tạo Conversation thiếu tenant.
  if (!tenantId) {
    logWebhookWarn('text_skipped_no_tenant', { senderId: maskId(senderId), pageId: maskId(pageCtx?.pageId) });
    return;
  }

  const rateLimit = checkSenderRateLimit(senderId);
  if (!rateLimit.allowed) {
    logWebhookWarn('rate_limited', { senderId: maskId(senderId), reason: rateLimit.reason });
    if (rateLimit.shouldWarn) {
      await sendMessage(
        senderId,
        'Bạn đang gửi tin nhắn hơi nhanh. Mình tạm dừng xử lý trong ít phút để tránh quá tải, bạn gửi lại sau nhé.',
        event._pageContext
      );
    }
    return;
  }

  // Đảm bảo conversation tồn tại (tạo mới nếu chưa có) — SCOPED theo tenantId.
  // Query { fbUserId, tenantId } nên không bao giờ reuse/ghi đè conversation của tenant khác,
  // và không backfill mù conversation legacy tenantId=null.
  let conversation = await botEngine.getOrCreateConversation(senderId, tenantId, pageCtx?.accessToken);
  conversation = await rememberConversationPage(conversation, pageCtx);

  // Lưu tin nhắn vào DB
  await botEngine.saveMessage(conversation.id, 'inbound', messageText);

  // --- HUMAN_ACTIVE: relay sang staff Telegram, không gọi bot ---
  if (conversation.handoffStatus === 'human_active') {
    logWebhookInfo('handoff_relay_to_staff', { senderId: maskId(senderId), conversationId: maskId(conversation.id) });
    await handoff.relayFBMessageToStaff(conversation, messageText);
    return;
  }

  // --- PENDING_HUMAN: đang chờ staff nhận, thêm context, không gọi bot ---
  if (conversation.handoffStatus === 'pending_human') {
    logWebhookInfo('handoff_pending_append', { senderId: maskId(senderId), conversationId: maskId(conversation.id) });
    await handoff.appendPendingMessage(conversation, messageText);
    return;
  }

  // --- BOT mode: thử handoff trước, nếu không có staff thì bot xử lý ---
  // Bỏ qua handoff khi đang trong dialog flow (đặt lịch, ...) để không làm gián đoạn
  const hasActiveDialog = !!(conversation.context?.dialogState);
  if (hasActiveDialog) {
    logWebhookInfo('handoff_skipped_active_dialog', {
      senderId: maskId(senderId),
      conversationId: maskId(conversation.id),
      dialogState: conversation.context.dialogState,
    });
  }
  if (!hasActiveDialog) {
    const handoffInitiated = await handoff.initiateHandoff(conversation, messageText);

    if (handoffInitiated) {
      logWebhookInfo('handoff_initiated', { senderId: maskId(senderId), conversationId: maskId(conversation.id) });
      return;
    }
  }

    // Không có staff on duty → bot xử lý bình thường
  // skipSaveInbound=true vì đã lưu ở trên
  const response = await botEngine.processMessage(senderId, messageText, {
    skipSaveInbound: true,
    channel: 'facebook',
    knowledgeFilter: pageCtx?.knowledgeFilter || [],
    botPersonaOverride: pageCtx?.botPersona || null,
    pageAccessToken: pageCtx?.accessToken || null,
    tenantId,
  });
  if (response) {
    await sendMessage(senderId, response, event._pageContext);
  }
}

function checkSenderRateLimit(senderId) {
  const now = Date.now();
  const state = rateLimitState.get(senderId) || {
    timestamps: [],
    violations: 0,
    blockedUntil: 0,
    lastWarningAt: 0,
  };

  if (state.blockedUntil && state.blockedUntil > now) {
    const shouldWarn = now - state.lastWarningAt > RATE_LIMIT_WARNING_COOLDOWN_MS;
    if (shouldWarn) state.lastWarningAt = now;
    rateLimitState.set(senderId, state);
    return { allowed: false, shouldWarn, reason: 'blocked' };
  }

  state.timestamps = state.timestamps.filter(ts => now - ts <= RATE_LIMIT_WINDOW_MS);
  state.timestamps.push(now);
  const burstCount = state.timestamps.filter(ts => now - ts <= RATE_LIMIT_BURST_WINDOW_MS).length;

  if (state.timestamps.length > RATE_LIMIT_MAX_MESSAGES || burstCount > RATE_LIMIT_BURST_MAX) {
    state.timestamps.pop(); // không tính tin bị block vào lịch sử
    state.violations += 1;
    state.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    const shouldWarn = now - state.lastWarningAt > RATE_LIMIT_WARNING_COOLDOWN_MS;
    if (shouldWarn) state.lastWarningAt = now;
    rateLimitState.set(senderId, state);
    return { allowed: false, shouldWarn, reason: 'rate_limited' };
  }

  rateLimitState.set(senderId, state);
  return { allowed: true };
}

async function rememberConversationPage(conversation, pageContext) {
  const pageId = pageContext?.pageId;
  if (!pageId) return conversation;

  const currentContext =
    conversation.context && typeof conversation.context === 'object' && !Array.isArray(conversation.context)
      ? conversation.context
      : {};

  const alreadyHasPage = currentContext.facebookPageId === pageId;
  const alreadyHasChannel = conversation.channel === 'facebook';
  if (alreadyHasPage && alreadyHasChannel) return conversation;

  return prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      channel: 'facebook',
      context: {
        ...currentContext,
        facebookPageId: pageId,
      },
    },
  });
}

/**
 * Handle postback events (quick reply / button clicks)
 */
async function handlePostback(event) {
  const senderId = event.sender.id;
  const payload = event.postback.payload;
  const pageCtx = event._pageContext;
  const tenantId = pageCtx?.tenantId;

  logWebhookInfo('postback_event_processing', summarizeMessagingEvent(event));

  // Đồng nhất message path: postback thiếu tenant → fail-closed, không gọi Bot/tạo Conversation.
  if (!tenantId) {
    logWebhookWarn('postback_skipped_no_tenant', { senderId: maskId(senderId), pageId: maskId(pageCtx?.pageId) });
    return;
  }

  const conversation = await botEngine.getOrCreateConversation(senderId, tenantId, pageCtx?.accessToken);
  await botEngine.saveMessage(conversation.id, 'inbound', `[postback:${payload}]`);

  if (conversation.handoffStatus === 'human_active') {
    logWebhookInfo('handoff_relay_postback_to_staff', { senderId: maskId(senderId), conversationId: maskId(conversation.id) });
    await handoff.relayFBMessageToStaff(conversation, `[Button: ${payload}]`);
    return;
  }

  if (conversation.handoffStatus === 'pending_human') {
    logWebhookInfo('handoff_pending_append_postback', { senderId: maskId(senderId), conversationId: maskId(conversation.id) });
    await handoff.appendPendingMessage(conversation, `[Button: ${payload}]`);
    return;
  }

  const response = await botEngine.processPostback(senderId, payload, { tenantId });
  if (response) {
    await sendMessage(senderId, response, event._pageContext);
  }
}

/**
 * Handle attachment messages
 */
async function handleAttachment(event) {
  const senderId = event.sender.id;
  const attachments = event.message.attachments;

  logWebhookInfo('attachment_event_processing', summarizeMessagingEvent(event));

    for (const attachment of attachments) {
    if (attachment.type === 'image') {
      await sendMessage(
        senderId,
        {
          text: 'Cảm ơn bạn đã gửi ảnh! Tuy nhiên mình chưa thể xử lý ảnh trực tiếp. Bạn có thể mô tả bằng văn bản được không?',
        },
        event._pageContext
      );
    }
  }
}

/**
 * Send message to Facebook user — multi-page aware
 * @param {string} recipientId - Facebook user PSID
 * @param {object|string} message - Message object or text string
 * @param {object} pageContext - { pageId, accessToken } from event._pageContext
 */
async function sendMessage(recipientId, message, pageContext) {
  try {
    let messageData;

    if (typeof message === 'string') {
      messageData = { text: message };
    } else if (message.text) {
      messageData = message;
    } else {
      messageData = message;
    }

    // Dùng page token từ context, fallback về global
    const accessToken = pageContext?.accessToken || process.env.FB_PAGE_ACCESS_TOKEN;

    const payload = {
      recipient: { id: recipientId },
      message: messageData,
    };

    const response = await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      payload,
      { params: { access_token: accessToken } }
    );

    logWebhookInfo('outbound_send_success', {
      recipientId: maskId(recipientId),
      pageId: maskId(pageContext?.pageId),
      hasText: typeof messageData.text === 'string',
      textLength: typeof messageData.text === 'string' ? messageData.text.length : 0,
      hasQuickReplies: Array.isArray(messageData.quick_replies) && messageData.quick_replies.length > 0,
    });
    return response.data;
  } catch (error) {
    logWebhookError('outbound_send_failed', error, {
      recipientId: maskId(recipientId),
      pageId: maskId(pageContext?.pageId),
    });
    return null;
  }
}

/**
 * Send a quick reply message with buttons
 */
async function sendQuickReply(recipientId, text, buttons) {
  const quickReplies = buttons.map(btn => ({
    content_type: 'text',
    title: btn.title,
    payload: btn.payload,
  }));

  return sendMessage(recipientId, {
    text,
    quick_replies: quickReplies,
  });
}

/**
 * Get user profile info from Facebook
 */
async function getUserProfile(psid) {
  try {
    const response = await axios.get(`${FB_GRAPH_URL}/${psid}`, {
      params: {
        fields: 'first_name,last_name,profile_pic',
        access_token: process.env.FB_PAGE_ACCESS_TOKEN,
      },
    });
    return response.data;
  } catch (error) {
    logWebhookError('user_profile_fetch_failed', error, { psid: maskId(psid) });
    return null;
  }
}

/**
 * Mark message as seen (typing indicator)
 */
async function markSeen(recipientId) {
  try {
    await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        sender_action: 'mark_seen',
      },
      {
        params: { access_token: process.env.FB_PAGE_ACCESS_TOKEN },
      }
    );
  } catch (error) {
    // Silently ignore
  }
}

/**
 * Send typing indicator
 */
async function sendTypingOn(recipientId) {
  try {
    await axios.post(
      `${FB_GRAPH_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        sender_action: 'typing_on',
      },
      {
        params: { access_token: process.env.FB_PAGE_ACCESS_TOKEN },
      }
    );
  } catch (error) {
    // Silently ignore
  }
}

module.exports = {
  verifyWebhook,
  handleMessage,
  sendMessage,
  sendQuickReply,
  getUserProfile,
  markSeen,
  sendTypingOn,
  invalidateFacebookPageCache,
  invalidateFacebookTenantCache,
};
