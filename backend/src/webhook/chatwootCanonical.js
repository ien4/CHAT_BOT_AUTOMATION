'use strict';

// CHATWOOT-SIGNED-WEBHOOK-EDGE-IMPLEMENT-01
// Pure, side-effect-free Chatwoot (signed webhook) → Canonical (omni.msg.v1)
// adapter. Mirrors the LANDED oracle (backend/scripts/omni-channel-canonical-
// reference.js) serialization so idempotency keys match it byte-for-byte, and
// follows the LANDED facebookCanonical.js precedent (self-validating, no import
// of any scripts/offline module into runtime src).
//
// Boundaries (intentional):
//   - PURE: only node:crypto. No process.env, no filesystem, no database,
//     no network, no require of test/offline harness.
//   - tenantId + integrationId are ALWAYS server-resolved inputs; a tenantId
//     present in the provider payload is ignored.
//   - Envelope carries NO secret / raw payload / raw body / signature / API
//     token / full customer email or phone / fetchable attachment URL.
//   - Mechanism is an explicit input and is preserved as safe provider metadata;
//     it is never inferred from an ambiguous field.
//
// Provider-label note: the canonical envelope uses provider = 'CHATWOOT_WEBSITE'
// (website-chat variant) + channel = 'website_chat' per the edge contract. The
// oracle's coarse KNOWN_PROVIDERS token is 'chatwoot'; idempotency parity with
// the oracle is proven directly in smoke-chatwoot-webhook.js (both are fed the
// identical provider value), so keys are identical regardless of the label.

const crypto = require('node:crypto');

const CANONICAL_SCHEMA_VERSION = 'omni.msg.v1';
const PROVIDER = 'CHATWOOT_WEBSITE';
const CHANNEL = 'website_chat';
const CHATWOOT_EDGE = 'CHATWOOT_WEBSITE_EDGE';

const SUPPORTED_CHATWOOT_MECHANISMS = Object.freeze([
  'ACCOUNT_INTEGRATION_WEBHOOK',
  'API_CHANNEL_WEBHOOK',
  'AGENT_BOT_OUTGOING_URL',
]);

// Event allowlist (prompt §XXVI). message_created may enter message processing
// (subject to loop guard). conversation_status_changed feeds handoff/status
// policy only — never a direct AI reply.
const SUPPORTED_CHATWOOT_EVENTS = Object.freeze([
  'message_created',
  'conversation_status_changed',
]);

const CHATWOOT_CANONICAL_ERROR = Object.freeze({
  CHATWOOT_IDENTITY_INVALID: 'CHATWOOT_IDENTITY_INVALID',
  CHATWOOT_PAYLOAD_MECHANISM_MISMATCH: 'CHATWOOT_PAYLOAD_MECHANISM_MISMATCH',
  CHATWOOT_MECHANISM_UNSUPPORTED: 'CHATWOOT_MECHANISM_UNSUPPORTED',
  CHATWOOT_EVENT_IDENTITY_UNAVAILABLE: 'CHATWOOT_EVENT_IDENTITY_UNAVAILABLE',
  CHATWOOT_INTEGRATION_SCOPE_REQUIRED: 'CHATWOOT_INTEGRATION_SCOPE_REQUIRED',
  CHATWOOT_TENANT_AUTHORITY_REQUIRED: 'CHATWOOT_TENANT_AUTHORITY_REQUIRED',
  CHATWOOT_VERIFICATION_STATE_REQUIRED: 'CHATWOOT_VERIFICATION_STATE_REQUIRED',
  UNSUPPORTED_CHATWOOT_EVENT: 'UNSUPPORTED_CHATWOOT_EVENT',
  CANONICAL_SECRET_FIELD_FORBIDDEN: 'CANONICAL_SECRET_FIELD_FORBIDDEN',
  CANONICAL_SCHEMA_MISMATCH: 'CANONICAL_SCHEMA_MISMATCH',
  CHATWOOT_PAYLOAD_INVALID: 'CHATWOOT_PAYLOAD_INVALID',
});

// Mirrors the oracle's forbidden-key regex (contract §14) plus Chatwoot secrets.
const CANONICAL_FORBIDDEN_KEY_RE = /^(apitoken|accesstoken|pageaccesstoken|webhooksecret|secret|password|authorization|rawpayload|rawbody|apikey|privatekey|ciphertext|signingsecret|hmactoken)$/i;
const ATTACHMENT_FORBIDDEN_KEY_RE = /^(content|data|url|src|href|body)$/i;

const VALID_DIRECTIONS = Object.freeze(['inbound', 'outbound']);
const VALID_SENDER_ROLES = Object.freeze(['customer', 'bot', 'agent', 'system']);
const HANDOFF_STATES = Object.freeze(['BOT_ACTIVE', 'HUMAN_REQUESTED', 'HUMAN_ACTIVE', 'BOT_PAUSED', 'BOT_RESUME_PENDING', 'CLOSED']);

function cwError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  err.safe = true;
  return err;
}

function nfc(value) { return String(value).normalize('NFC'); }

function sortValue(value) {
  if (typeof value === 'string') return nfc(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
  return out;
}

// Identical serialization to the oracle so idempotency keys match byte-for-byte.
function canonicalSerialize(obj) { return JSON.stringify(sortValue(obj)); }

function sha256Hex(input) { return crypto.createHash('sha256').update(input, 'utf8').digest('hex'); }

function maskRef(value) {
  if (value === null || value === undefined || value === '') return null;
  return sha256Hex(String(value)).slice(0, 24);
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}

function scanForbiddenKeys(node) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(scanForbiddenKeys); return; }
  for (const key of Object.keys(node)) {
    if (CANONICAL_FORBIDDEN_KEY_RE.test(key)) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CANONICAL_SECRET_FIELD_FORBIDDEN, 'forbidden-key:' + key);
    }
    scanForbiddenKeys(node[key]);
  }
}

// ---- ID normalization (prompt §XXIV) ------------------------------------------
// Mirrors oracle.normalizeExternalNumericId for accepted inputs; adds explicit
// rejection of URL userinfo/credentials and whitespace. Accepts a positive
// integer, a pure-digit string, or a provider URL/path whose TERMINAL segment is
// exactly `<resourceType>/<digits>`. Rejects team-URL-as-inbox, wrong resource,
// arbitrary trailing digits, negatives, decimals, leading-zero ambiguity.
function normalizeChatwootNumericId(value, resourceType) {
  if (typeof resourceType !== 'string' || resourceType.length === 0) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'resourceType-required');
  }
  if (value === null || value === undefined) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'empty-identity');
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'non-positive-integer');
    }
    return String(value);
  }
  if (typeof value !== 'string') {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'unrecognized-type');
  }
  const raw = nfc(value).trim();
  if (raw.length === 0 || /\s/.test(raw)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'blank-or-whitespace');
  }
  // Pure digits → already normalized (reject leading-zero ambiguity).
  if (/^[0-9]+$/.test(raw)) {
    if (/^0[0-9]+$/.test(raw)) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'leading-zero');
    }
    return raw;
  }
  if (raw.includes('/')) {
    // Reject embedded credentials (userinfo) outright.
    if (raw.includes('@')) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'credentials-in-url');
    }
    const escaped = resourceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const terminal = new RegExp('(?:^|/)' + escaped + '/([1-9][0-9]*)/?$');
    const m = raw.split('?')[0].match(terminal);
    if (m) return m[1];
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'url-terminal-mismatch');
  }
  throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_IDENTITY_INVALID, 'unrecognized-identity');
}

// ---- Message type / direction / sender role (prompt §XIV canonical mapping) ----
// Chatwoot serializes message_type as a string OR an integer across versions:
//   0/incoming, 1/outgoing, 2/activity, 3/template.
function normalizeChatwootMessageType(raw) {
  let kind = 'unknown';
  if (typeof raw === 'number') {
    if (raw === 0) kind = 'incoming';
    else if (raw === 1) kind = 'outgoing';
    else if (raw === 2) kind = 'activity';
    else if (raw === 3) kind = 'template';
  } else if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'incoming' || s === 'outgoing' || s === 'activity' || s === 'template') kind = s;
  }
  let direction = null;
  if (kind === 'incoming') direction = 'inbound';
  else if (kind === 'outgoing' || kind === 'template') direction = 'outbound';
  // activity/unknown → direction null (blocked downstream)
  return { messageTypeRaw: raw === undefined ? null : raw, messageType: kind, direction, isActivity: kind === 'activity' };
}

function senderRoleFromPayload(sender, messageKind) {
  const type = sender && typeof sender.type === 'string' ? sender.type.trim().toLowerCase() : null;
  if (messageKind === 'activity') return 'system';
  if (type === 'contact' || type === 'contact_inbox') return 'customer';
  if (type === 'agent_bot') return 'bot';
  if (type === 'user' || type === 'agent') return 'agent';
  // Fall back to direction implied by message type.
  if (messageKind === 'incoming') return 'customer';
  if (messageKind === 'outgoing' || messageKind === 'template') return 'agent';
  return 'unknown';
}

// ---- Mechanism-explicit provider identity (prompt §XXV) -----------------------
// Each mechanism declares the resource identity it MUST carry; a payload missing
// that identity for the declared mechanism is a CHATWOOT_PAYLOAD_MECHANISM_MISMATCH.
// The per-mechanism required shape below is DESIGN-LEVEL (mechanism authority is
// still deferred to a future operator-confirmed runtime phase).
function extractChatwootProviderIdentity(payload, mechanism) {
  if (!SUPPORTED_CHATWOOT_MECHANISMS.includes(mechanism)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_MECHANISM_UNSUPPORTED, 'mechanism');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_INVALID, 'payload-shape');
  }
  const account = payload.account || null;
  const inbox = payload.inbox || null;
  const conversation = payload.conversation || null;

  const rawAccount = (account && account.id !== undefined) ? account.id
    : (payload.account_id !== undefined ? payload.account_id : null);
  const rawInbox = (inbox && inbox.id !== undefined) ? inbox.id
    : (conversation && conversation.inbox_id !== undefined ? conversation.inbox_id : null);
  const rawConversation = (conversation && conversation.id !== undefined) ? conversation.id : null;

  // Mechanism-specific required identity.
  if (mechanism === 'ACCOUNT_INTEGRATION_WEBHOOK' && rawAccount === null) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_MECHANISM_MISMATCH, 'account-required');
  }
  if (mechanism === 'API_CHANNEL_WEBHOOK' && rawInbox === null) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_MECHANISM_MISMATCH, 'inbox-required');
  }
  if (mechanism === 'AGENT_BOT_OUTGOING_URL' && rawConversation === null) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_MECHANISM_MISMATCH, 'conversation-required');
  }

  const externalAccountId = rawAccount === null ? null : normalizeChatwootNumericId(rawAccount, 'accounts');
  const externalInboxId = rawInbox === null ? null : normalizeChatwootNumericId(rawInbox, 'inboxes');
  const externalConversationId = rawConversation === null ? null : normalizeChatwootNumericId(rawConversation, 'conversations');

  return { mechanism, externalAccountId, externalInboxId, externalConversationId };
}

// ---- Event identity (prompt §XXII) --------------------------------------------
// Returns durable identity for idempotency. Fails closed when a message event
// lacks a trustworthy message id (never uses text/timestamp/sender/random).
function extractChatwootEventIdentity(payload, mechanism) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_INVALID, 'payload-shape');
  }
  const eventType = typeof payload.event === 'string' ? payload.event : null;
  if (!eventType) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_PAYLOAD_INVALID, 'event-missing');
  }
  const provider = extractChatwootProviderIdentity(payload, mechanism);
  const isSupportedEvent = SUPPORTED_CHATWOOT_EVENTS.includes(eventType);

  const mt = normalizeChatwootMessageType(payload.message_type);
  const isPrivate = payload.private === true;
  const senderRole = senderRoleFromPayload(payload.sender, mt.messageType);
  const senderRef = payload.sender && payload.sender.id !== undefined && payload.sender.id !== null
    ? String(payload.sender.id) : null;

  let externalMessageId = null;
  let providerEventRef = null;

  if (eventType === 'message_created') {
    if (payload.id === undefined || payload.id === null) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_EVENT_IDENTITY_UNAVAILABLE, 'message-id-missing');
    }
    // Message id is the durable, retry-stable business event identity.
    externalMessageId = String(payload.id);
    providerEventRef = externalMessageId;
  } else if (eventType === 'conversation_status_changed') {
    // Status events carry no message id. Derive a stable ref from durable
    // resource identity + target status (NOT random/timestamp/text).
    if (!provider.externalConversationId) {
      throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_EVENT_IDENTITY_UNAVAILABLE, 'conversation-id-missing');
    }
    const status = typeof payload.status === 'string' ? payload.status : 'unknown';
    providerEventRef = 'status:' + provider.externalConversationId + ':' + status;
  } else {
    // Unsupported events still get a coarse identity for safe logging, but the
    // allowlist flag tells callers not to process them.
    if (payload.id !== undefined && payload.id !== null) {
      externalMessageId = String(payload.id);
      providerEventRef = externalMessageId;
    }
  }

  return {
    mechanism: provider.mechanism,
    externalAccountId: provider.externalAccountId,
    externalInboxId: provider.externalInboxId,
    externalConversationId: provider.externalConversationId,
    externalMessageId,
    providerEventRef,
    eventType,
    direction: mt.direction,
    senderRole,
    senderRef,
    messageType: mt.messageType,
    isPrivate,
    isSupportedEvent,
  };
}

// ---- Loop guard (prompt §XXVII) — defense in depth ----------------------------
function evaluateChatwootLoopGuard(signals) {
  const s = signals || {};
  const block = (result) => ({ result, aiAllowed: false, zeroAiInvocation: true, zeroToolInvocation: true });

  if (s.isPrivate === true) return block('CHATWOOT_PRIVATE_NOTE_IGNORED');
  if (s.messageType === 'activity' || s.isActivity === true || s.isSystem === true) {
    return block('CHATWOOT_SYSTEM_EVENT_IGNORED');
  }
  if (!VALID_DIRECTIONS.includes(s.direction)) return block('CHATWOOT_DIRECTION_UNKNOWN_BLOCKED');
  if (s.direction === 'outbound') return block('CHATWOOT_OUTBOUND_LOOP_BLOCKED');
  if (s.senderRole === 'agent') return block('CHATWOOT_AGENT_CALLBACK_BLOCKED');
  if (s.senderRole === 'bot') return block('CHATWOOT_BOT_CALLBACK_BLOCKED');
  if (s.ownBotSenderId && s.senderRef && String(s.ownBotSenderId) === String(s.senderRef)) {
    return block('CHATWOOT_BOT_CALLBACK_BLOCKED');
  }
  if (s.outboundCorrelationId) return block('CHATWOOT_OUTBOUND_LOOP_BLOCKED');
  if (!VALID_SENDER_ROLES.includes(s.senderRole)) return block('CHATWOOT_DIRECTION_UNKNOWN_BLOCKED');
  return { result: 'ALLOW_INBOUND_PROCESSING', aiAllowed: true, zeroAiInvocation: false, zeroToolInvocation: false };
}

// ---- Business idempotency key (prompt §XXVIII) --------------------------------
// Same serialization as the oracle → oracle-parity proven in smoke. Fails closed
// without a trustworthy provider event / message identity.
function computeChatwootIdempotencyKey(input, hashFunction) {
  const hash = hashFunction || sha256Hex;
  const providerEventRef = input && input.providerEventRef;
  const externalMessageRef = input && input.externalMessageRef;
  const hasEventRef = typeof providerEventRef === 'string' && providerEventRef.length > 0;
  const hasMessageRef = typeof externalMessageRef === 'string' && externalMessageRef.length > 0;
  if (!hasEventRef && !hasMessageRef) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_EVENT_IDENTITY_UNAVAILABLE, 'no-event-identity');
  }
  if (!input.integrationId) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_INTEGRATION_SCOPE_REQUIRED, 'integration-scope-required');
  }
  return hash(canonicalSerialize({
    schemaVersion: input.schemaVersion || CANONICAL_SCHEMA_VERSION,
    provider: input.provider || PROVIDER,
    integrationId: input.integrationId,
    providerEventRef: hasEventRef ? providerEventRef : null,
    externalMessageRef: hasMessageRef ? externalMessageRef : null,
    eventType: input.eventType,
    direction: input.direction,
  }));
}

// ---- Attachment metadata (prompt §XXX) — reference-only, no fetch --------------
function toSafeAttachmentMetadata(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att, i) => {
    const a = att || {};
    const type = typeof a.file_type === 'string' ? a.file_type
      : (typeof a.type === 'string' ? a.type : 'unknown');
    const contentType = typeof a.content_type === 'string' ? a.content_type : null;
    const declaredSize = typeof a.file_size === 'number' ? a.file_size
      : (typeof a.declaredSize === 'number' ? a.declaredSize : null);
    const sourceUrl = typeof a.data_url === 'string' ? a.data_url
      : (typeof a.thumb_url === 'string' ? a.thumb_url : null);
    const providerReference = sourceUrl ? sha256Hex(sourceUrl).slice(0, 24) : ('attachment-' + i);
    return { type, contentType, declaredSize, providerReference, fetchStatus: 'DISABLED' };
  });
}

// ---- Safe audit projection (prompt §XXXI) -------------------------------------
function sanitizeChatwootAuditMetadata(meta) {
  const m = meta || {};
  const out = {};
  const passthrough = ['provider', 'mechanism', 'eventType', 'direction', 'integrationId', 'tenantId', 'verificationState', 'safeErrorCode', 'correlationId'];
  for (const key of passthrough) {
    const v = m[key];
    if (v === undefined || v === null) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') out[key] = v;
  }
  if (m.externalMessageRef !== undefined && m.externalMessageRef !== null) {
    out.externalMessageRefMasked = maskRef(m.externalMessageRef);
  }
  if (m.deliveryRef !== undefined && m.deliveryRef !== null) {
    out.deliveryRefMasked = maskRef(m.deliveryRef);
  }
  return out;
}

// ---- Canonical envelope (prompt §XXIX) ----------------------------------------
// Built ONLY when verified + server-resolved tenant/integration + explicit
// mechanism + valid event identity + loop guard allows. Deep-frozen. Any tenantId
// in the provider payload is ignored (never read here).
function buildChatwootCanonicalEnvelope(params) {
  const p = params || {};
  if (!p.integrationId) throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_INTEGRATION_SCOPE_REQUIRED, 'integrationId');
  if (!p.tenantId) throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_TENANT_AUTHORITY_REQUIRED, 'tenantId');
  if (p.verificationState !== 'VERIFIED') {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_VERIFICATION_STATE_REQUIRED, 'not-verified');
  }
  if (!SUPPORTED_CHATWOOT_MECHANISMS.includes(p.mechanism)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CHATWOOT_MECHANISM_UNSUPPORTED, 'mechanism');
  }
  const identity = p.identity || {};
  if (!SUPPORTED_CHATWOOT_EVENTS.includes(identity.eventType)) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.UNSUPPORTED_CHATWOOT_EVENT, 'event-not-allowlisted');
  }

  const idempotencyKey = computeChatwootIdempotencyKey({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: PROVIDER,
    integrationId: p.integrationId,
    providerEventRef: identity.providerEventRef,
    externalMessageRef: identity.externalMessageId,
    eventType: identity.eventType,
    direction: identity.direction,
  });

  const envelope = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: PROVIDER,
    channel: CHANNEL,
    edge: CHATWOOT_EDGE,
    mechanism: p.mechanism,
    integrationId: p.integrationId,
    tenantId: p.tenantId,
    externalDeploymentRef: p.externalDeploymentRef || null,
    externalAccountRef: identity.externalAccountId || null,
    externalInboxRef: identity.externalInboxId || null,
    externalConversationRef: identity.externalConversationId || null,
    externalMessageRef: identity.externalMessageId || null,
    providerEventRef: identity.providerEventRef || null,
    eventType: identity.eventType,
    direction: VALID_DIRECTIONS.includes(identity.direction) ? identity.direction : 'inbound',
    messageType: identity.messageType || null,
    senderRef: identity.senderRef || null,
    senderRole: VALID_SENDER_ROLES.includes(identity.senderRole) ? identity.senderRole : 'customer',
    text: typeof p.text === 'string' ? p.text : null,
    attachments: toSafeAttachmentMetadata(p.attachments),
    providerTimestamp: p.providerTimestamp || null,
    receivedAt: p.receivedAt,
    deliveryRef: typeof p.deliveryRef === 'string' ? p.deliveryRef : null,
    verificationState: 'VERIFIED',
    idempotencyKey,
    handoffState: HANDOFF_STATES.includes(p.handoffState) ? p.handoffState : 'BOT_ACTIVE',
    correlationId: p.correlationId,
  };

  if (envelope.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CANONICAL_SCHEMA_MISMATCH, 'schema');
  }
  // Never accept a provider-supplied tenant id smuggled through params.
  if (p.providerTenantId !== undefined || p.__providerSuppliedTenantId !== undefined) {
    throw cwError(CHATWOOT_CANONICAL_ERROR.CANONICAL_SECRET_FIELD_FORBIDDEN, 'provider-supplied-tenant');
  }
  scanForbiddenKeys(envelope);
  return deepFreeze(envelope);
}

module.exports = {
  CANONICAL_SCHEMA_VERSION,
  PROVIDER,
  CHANNEL,
  CHATWOOT_EDGE,
  SUPPORTED_CHATWOOT_MECHANISMS,
  SUPPORTED_CHATWOOT_EVENTS,
  CHATWOOT_CANONICAL_ERROR,
  HANDOFF_STATES,
  normalizeChatwootNumericId,
  normalizeChatwootMessageType,
  extractChatwootProviderIdentity,
  extractChatwootEventIdentity,
  evaluateChatwootLoopGuard,
  computeChatwootIdempotencyKey,
  toSafeAttachmentMetadata,
  sanitizeChatwootAuditMetadata,
  buildChatwootCanonicalEnvelope,
  canonicalSerialize,
};
