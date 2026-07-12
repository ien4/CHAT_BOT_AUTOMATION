const axios = require('axios');
const botEngine = require('../bot/engine');
const handoff = require('../telegram/handoff');

const FB_GRAPH_URL = 'https://graph.facebook.com/v19.0';
const getPrisma = require('../db');
const prisma = getPrisma();

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
  const page = await prisma.facebookPage.findFirst({
    where: { pageId: String(pageEntryId), isActive: true },
  });
  pageCache.set(cacheKey, { data: page, ts: Date.now() });
  return page;
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
  const { body } = req;

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  // Always respond 200 immediately (Facebook requires this within 20s)
  res.status(200).send('EVENT_RECEIVED');

  // Process each entry asynchronously — multi-page aware
  const entries = body.entry || [];
  logWebhookInfo('page_event_received', { entryCount: entries.length });
  for (const entry of entries) {
    const pageEntryId = entry.id; // Facebook Page ID
    const fbPage = await lookupPage(pageEntryId);

    const messaging = entry.messaging || [];
    logWebhookInfo('entry_processing', { pageId: maskId(pageEntryId), messagingCount: messaging.length });
    for (const event of messaging) {
      // Gắn page context vào event để sendMessage dùng đúng token
      event._pageContext = fbPage
        ? { pageId: fbPage.pageId, accessToken: fbPage.accessToken, botPersona: fbPage.botPersona, knowledgeFilter: fbPage.knowledgeFilter }
        : { pageId: pageEntryId, accessToken: process.env.FB_PAGE_ACCESS_TOKEN };
      logWebhookInfo('messaging_event_received', summarizeMessagingEvent(event));
      await processEvent(event);
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

  logWebhookInfo('text_event_processing', summarizeMessagingEvent(event));

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

  // Đảm bảo conversation tồn tại (tạo mới nếu chưa có)
  let conversation = await botEngine.getOrCreateConversation(senderId, null, event._pageContext?.accessToken);
  conversation = await rememberConversationPage(conversation, event._pageContext);

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
    knowledgeFilter: event._pageContext?.knowledgeFilter || [],
    botPersonaOverride: event._pageContext?.botPersona || null,
    pageAccessToken: event._pageContext?.accessToken || null,
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

  logWebhookInfo('postback_event_processing', summarizeMessagingEvent(event));

  const conversation = await botEngine.getOrCreateConversation(senderId);
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

  const response = await botEngine.processPostback(senderId, payload);
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
};
