/**
 * Channel Adapter — Chatwoot
 *
 * Chuẩn hóa Chatwoot webhook event → UnifiedMessage:
 * {
 *   tenantId        : string | null   — null = owner
 *   tenantSlug      : string | null
 *   channel         : 'facebook'|'web'|'whatsapp'|'telegram'|'email'|'unknown'
 *   chatwootConversationId : number
 *   userId          : string          — scoped: "slug::originalId" cho tenant, plain cho owner
 *   senderName      : string
 *   content         : string
 *   inboxId         : number
 *   chatwootContactId : number | null
 *   pageContext     : { currentUrl, pageTitle } | null
 *   rawEvent        : object          — original Chatwoot event (cho debugging)
 * }
 */

const CHANNEL_TYPE_MAP = {
  'Channel::FacebookPage': 'facebook',
  'Channel::WebWidget':    'web',
  'Channel::Whatsapp':     'whatsapp',
  'Channel::Email':        'email',
  'Channel::Instagram':    'facebook',
  'Channel::Line':         'web',
  'Channel::Telegram':     'telegram',
  'Channel::Sms':          'whatsapp',
  'Channel::Api':          'web',
};

function mapChannelType(chatwootChannelType) {
  return CHANNEL_TYPE_MAP[chatwootChannelType] || 'unknown';
}

function extractPageContext(event) {
  const attrs = event.conversation?.additional_attributes
    || event.conversation?.meta?.additional_attributes
    || {};
  const currentUrl = attrs.currentUrl || attrs.current_url || null;
  const pageTitle  = attrs.pageTitle  || attrs.page_title  || null;
  if (!currentUrl) return null;
  return { currentUrl, pageTitle };
}

/**
 * Kiểm tra event có phải tin nhắn đến từ khách không.
 * Trả về lý do skip nếu không phải, null nếu hợp lệ.
 */
function shouldSkip(event) {
  if (event.event !== 'message_created') return 'not_message_created';
  if (event.message_type !== 'incoming')  return 'not_incoming';
  if (event.private === true)             return 'private_note';
  if (!event.content?.trim())             return 'empty_content';
  // Chỉ xử lý tin từ contact (người dùng) — bỏ qua agent/bot/system messages.
  // Quan trọng cho web widget: Chatwoot có thể gửi webhook cho cả bot reply.
  const senderType = event.sender?.type;
  if (senderType && senderType !== 'contact') return `sender_type_${senderType}`;
  return null;
}

/**
 * Chuyển đổi Chatwoot event → UnifiedMessage.
 *
 * @param {object} event        — raw Chatwoot webhook payload
 * @param {object|null} tenant  — Tenant record (null = owner webhook)
 * @param {object|null} channelConfig — ChannelConfig hoặc TenantChannelConfig
 * @param {string|null} resolvedUserId — đã resolve từ Chatwoot API nếu cần
 */
function adaptMessage(event, tenant, channelConfig, resolvedUserId = null) {
  const tenantId   = tenant?.id   || null;
  const tenantSlug = tenant?.slug || null;

  const inboxId           = event.conversation?.inbox_id;
  const chatwootContactId = event.sender?.id || null;
  const senderName        = event.conversation?.meta?.sender?.name
    || event.sender?.name
    || 'Khách';

  // Channel type: từ channelConfig nếu đã biết, fallback detect từ event
  let channel = channelConfig?.channelType || 'unknown';
  if (channel === 'unknown') {
    const cwType = event.conversation?.channel;
    channel = cwType ? mapChannelType(cwType) : 'unknown';
  }

  // userId: lấy từ identifier (PSID cho Facebook) hoặc resolved từ API
  const rawUserId = event.conversation?.meta?.sender?.identifier
    || event.sender?.identifier
    || resolvedUserId
    || (chatwootContactId ? `chatwoot_contact_${chatwootContactId}` : null);

  // Prefix với tenantSlug để giữ uniqueness trong bảng conversations
  const userId = tenantSlug && rawUserId
    ? `${tenantSlug}::${rawUserId}`
    : rawUserId;

  return {
    tenantId,
    tenantSlug,
    channel,
    chatwootConversationId: event.conversation?.id != null ? String(event.conversation.id) : null,
    userId,
    senderName,
    content:    event.content.trim(),
    inboxId,
    chatwootContactId,
    pageContext: extractPageContext(event),
    rawEvent:   event,
  };
}

module.exports = { adaptMessage, shouldSkip, mapChannelType };
