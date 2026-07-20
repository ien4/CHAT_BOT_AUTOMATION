'use strict';

// FACEBOOK-DIRECT-WEBHOOK-RESOLUTION-01
// Production-safe, side-effect-free Facebook Direct → Canonical (omni.msg.v1)
// adapter. It aligns the Facebook edge with the LANDED canonical contract
// (see backend/scripts/omni-channel-canonical-reference.js) WITHOUT importing any
// test-only / offline harness module, and WITHOUT rewiring the live webhook
// handler in this pass.
//
// Boundaries (intentional):
//   - PURE: only node:crypto; no PrismaClient, no environment read, no network,
//     no filesystem, no require of ../bot / ../telegram / ../db.
//   - The Facebook EDGE still owns raw-body capture, x-hub-signature-256
//     verification, Meta payload shape validation and Graph outbound in
//     handler.js. This module only produces the provider-neutral canonical view
//     AFTER signature verification + server-side tenant resolution.
//   - Secrets (FB_APP_SECRET / FB_VERIFY_TOKEN / Page Access Token) NEVER enter
//     the canonical envelope.
//   - Attachments are reduced to reference-only metadata (no fetchable URL) to
//     honour REMOTE_ATTACHMENT_FETCH_DISABLED.

const crypto = require('node:crypto');

const CANONICAL_SCHEMA_VERSION = 'omni.msg.v1';
const PROVIDER = 'facebook';        // conformant with the canonical oracle enum
const FACEBOOK_EDGE = 'FACEBOOK_DIRECT';
const CHANNEL = 'facebook';

const FB_CANONICAL_ERROR = Object.freeze({
  FACEBOOK_EVENT_IDENTITY_UNAVAILABLE: 'FACEBOOK_EVENT_IDENTITY_UNAVAILABLE',
  FACEBOOK_INTEGRATION_SCOPE_REQUIRED: 'FACEBOOK_INTEGRATION_SCOPE_REQUIRED',
  FACEBOOK_TENANT_AUTHORITY_REQUIRED: 'FACEBOOK_TENANT_AUTHORITY_REQUIRED',
  CANONICAL_SECRET_FIELD_FORBIDDEN: 'CANONICAL_SECRET_FIELD_FORBIDDEN',
  CANONICAL_SCHEMA_MISMATCH: 'CANONICAL_SCHEMA_MISMATCH',
  IDENTITY_INVALID: 'IDENTITY_INVALID',
});

// Keys that must never appear inside a canonical envelope (mirrors the oracle).
const CANONICAL_FORBIDDEN_KEY_RE = /^(apitoken|accesstoken|pageaccesstoken|webhooksecret|secret|password|authorization|rawpayload|rawbody|apikey|privatekey|ciphertext|verifytoken|appsecret)$/i;
const ATTACHMENT_FORBIDDEN_KEY_RE = /^(content|data|url|src|href|body|payload)$/i;

const VALID_DIRECTIONS = Object.freeze(['inbound', 'outbound']);
const VALID_SENDER_ROLES = Object.freeze(['customer', 'bot', 'agent', 'system']);
const HANDOFF_STATES = Object.freeze(['BOT_ACTIVE', 'HUMAN_REQUESTED', 'HUMAN_ACTIVE', 'BOT_PAUSED', 'BOT_RESUME_PENDING', 'CLOSED']);

function fbError(code, message) {
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

// Canonical serialization identical to the LANDED oracle so idempotency keys match.
function canonicalSerialize(obj) { return JSON.stringify(sortValue(obj)); }

function sha256Hex(input) { return crypto.createHash('sha256').update(input, 'utf8').digest('hex'); }

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
      throw fbError(FB_CANONICAL_ERROR.CANONICAL_SECRET_FIELD_FORBIDDEN, 'forbidden-key:' + key);
    }
    scanForbiddenKeys(node[key]);
  }
}

// ---- Meta event → identity (edge-owned shape, no secret) ----------------------
// `messagingEvent` is one element of entry.messaging from the Meta webhook.
function extractFacebookEventIdentity(messagingEvent) {
  const ev = messagingEvent || {};
  const message = ev.message || null;
  const isEcho = Boolean(message && message.is_echo);
  const mid = message && typeof message.mid === 'string' ? message.mid : null;
  const senderId = ev.sender && ev.sender.id ? String(ev.sender.id) : null;
  const recipientId = ev.recipient && ev.recipient.id ? String(ev.recipient.id) : null;
  const postbackPayload = ev.postback && ev.postback.payload ? String(ev.postback.payload) : null;
  const quickReplyPayload = message && message.quick_reply && message.quick_reply.payload
    ? String(message.quick_reply.payload) : null;
  const hasText = Boolean(message && typeof message.text === 'string');
  const hasAttachments = Boolean(message && Array.isArray(message.attachments) && message.attachments.length > 0);

  let eventType;
  let messageType;
  if (ev.postback) { eventType = 'postback'; messageType = 'postback'; }
  else if (quickReplyPayload) { eventType = 'message'; messageType = 'quick_reply'; }
  else if (hasAttachments) { eventType = 'message'; messageType = 'attachment'; }
  else { eventType = 'message'; messageType = 'text'; }

  return {
    isEcho,
    externalMessageRef: mid,
    providerEventRef: mid, // Meta message id is the durable event identity
    externalConversationRef: senderId, // PSID scopes the conversation
    externalInboxRef: recipientId,      // Page id (recipient on inbound)
    senderRef: senderId,
    senderRole: isEcho ? 'bot' : 'customer',
    direction: isEcho ? 'outbound' : 'inbound',
    eventType,
    messageType,
    hasText,
    hasAttachments,
    postbackPayload,
    quickReplyPayload,
  };
}

// ---- Integration-scoped idempotency key (durable-ready) ------------------------
// Fail-closed when no trustworthy Meta event identity (mid) is present. Never
// falls back to timestamp / sender / message text.
function computeFacebookIdempotencyKey(input) {
  const providerEventRef = input && input.providerEventRef;
  const externalMessageRef = input && input.externalMessageRef;
  const hasEventRef = typeof providerEventRef === 'string' && providerEventRef.length > 0;
  const hasMessageRef = typeof externalMessageRef === 'string' && externalMessageRef.length > 0;
  if (!hasEventRef && !hasMessageRef) {
    throw fbError(FB_CANONICAL_ERROR.FACEBOOK_EVENT_IDENTITY_UNAVAILABLE, 'no-mid');
  }
  if (!input.integrationId) {
    throw fbError(FB_CANONICAL_ERROR.FACEBOOK_INTEGRATION_SCOPE_REQUIRED, 'integration-scope');
  }
  return sha256Hex(canonicalSerialize({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: PROVIDER,
    integrationId: input.integrationId,
    providerEventRef: hasEventRef ? providerEventRef : null,
    externalMessageRef: hasMessageRef ? externalMessageRef : null,
    eventType: input.eventType,
    direction: input.direction,
  }));
}

// ---- Loop guard (defense in depth, not a single field) ------------------------
function evaluateFacebookLoopGuard(signals) {
  const s = signals || {};
  if (s.isEcho === true) {
    return { result: 'FACEBOOK_ECHO_IGNORED', aiAllowed: false };
  }
  if (!VALID_DIRECTIONS.includes(s.direction)) {
    return { result: 'UNKNOWN_DIRECTION_BLOCKED', aiAllowed: false };
  }
  if (s.direction === 'outbound') {
    return { result: 'FACEBOOK_OUTBOUND_LOOP_BLOCKED', aiAllowed: false };
  }
  if (s.senderRole === 'bot' || s.senderRole === 'agent') {
    return { result: 'FACEBOOK_BOT_CALLBACK_BLOCKED', aiAllowed: false };
  }
  // Own-page callback: recipient == sender or sender is the resolved page itself.
  if (s.ownPageId && s.senderRef && String(s.ownPageId) === String(s.senderRef)) {
    return { result: 'FACEBOOK_BOT_CALLBACK_BLOCKED', aiAllowed: false };
  }
  return { result: 'ALLOW_INBOUND_PROCESSING', aiAllowed: true };
}

// ---- Handoff mapping + gate ---------------------------------------------------
// Maps the existing Conversation.handoffStatus vocabulary to canonical states.
function mapFacebookHandoffStatusToCanonical(handoffStatus) {
  switch (handoffStatus) {
    case 'human_active': return 'HUMAN_ACTIVE';
    case 'pending_human': return 'HUMAN_REQUESTED';
    case 'closed': return 'CLOSED';
    case 'bot':
    case undefined:
    case null:
    default: return 'BOT_ACTIVE';
  }
}

function evaluateFacebookHandoffGate(handoffStatusOrState) {
  const state = HANDOFF_STATES.includes(handoffStatusOrState)
    ? handoffStatusOrState
    : mapFacebookHandoffStatusToCanonical(handoffStatusOrState);
  switch (state) {
    case 'BOT_ACTIVE': return { state, aiAllowed: true, result: 'AI_ALLOWED' };
    case 'HUMAN_REQUESTED': return { state, aiAllowed: false, result: 'HANDOFF_PENDING_NO_AI' };
    case 'HUMAN_ACTIVE': return { state, aiAllowed: false, result: 'HANDOFF_BLOCKED' };
    case 'BOT_PAUSED': return { state, aiAllowed: false, result: 'HANDOFF_BLOCKED' };
    case 'BOT_RESUME_PENDING': return { state, aiAllowed: false, result: 'HANDOFF_BLOCKED' };
    case 'CLOSED': return { state, aiAllowed: false, result: 'CLOSED_NO_AI' };
    default: return { state: 'BOT_ACTIVE', aiAllowed: false, result: 'HANDOFF_BLOCKED' };
  }
}

// ---- Attachment metadata (reference-only, no fetchable URL) --------------------
function toSafeAttachmentMeta(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att, i) => {
    const type = att && typeof att.type === 'string' ? att.type : 'unknown';
    // Reference is a stable hash of the provider URL when present — NEVER the URL.
    const providerUrl = att && att.payload && typeof att.payload.url === 'string' ? att.payload.url : null;
    const ref = providerUrl ? sha256Hex(providerUrl).slice(0, 24) : ('attachment-' + i);
    return { type, ref };
  });
}

// ---- Build canonical envelope (VERIFIED + server-resolved only) ----------------
// integrationId + tenantId MUST be server-resolved (from FacebookPage → tenantId).
// verificationState MUST already be 'VERIFIED' (edge verified x-hub-signature-256).
function buildFacebookCanonicalEnvelope(params) {
  const p = params || {};
  if (!p.integrationId) throw fbError(FB_CANONICAL_ERROR.FACEBOOK_INTEGRATION_SCOPE_REQUIRED, 'integrationId');
  if (!p.tenantId) throw fbError(FB_CANONICAL_ERROR.FACEBOOK_TENANT_AUTHORITY_REQUIRED, 'tenantId');
  const identity = p.identity || {};
  const idempotencyKey = computeFacebookIdempotencyKey({
    integrationId: p.integrationId,
    providerEventRef: identity.providerEventRef,
    externalMessageRef: identity.externalMessageRef,
    eventType: identity.eventType,
    direction: identity.direction,
  });

  const envelope = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: PROVIDER,
    channel: CHANNEL,
    edge: FACEBOOK_EDGE,
    integrationId: p.integrationId,
    tenantId: p.tenantId,
    externalDeploymentRef: 'graph.facebook.com',
    externalAccountRef: p.externalAccountRef || null,
    externalInboxRef: identity.externalInboxRef || null,
    externalConversationRef: identity.externalConversationRef || null,
    externalMessageRef: identity.externalMessageRef || null,
    providerEventRef: identity.providerEventRef || null,
    eventType: identity.eventType,
    direction: VALID_DIRECTIONS.includes(identity.direction) ? identity.direction : 'inbound',
    messageType: identity.messageType,
    senderRef: identity.senderRef || null,
    senderRole: VALID_SENDER_ROLES.includes(identity.senderRole) ? identity.senderRole : 'customer',
    text: typeof p.text === 'string' ? p.text : null,
    attachments: toSafeAttachmentMeta(p.attachments),
    providerTimestamp: p.providerTimestamp || null,
    receivedAt: p.receivedAt,
    verificationState: p.verificationState === 'VERIFIED' ? 'VERIFIED' : 'PENDING',
    idempotencyKey,
    handoffState: HANDOFF_STATES.includes(p.handoffState) ? p.handoffState : mapFacebookHandoffStatusToCanonical(p.handoffStatus),
    correlationId: p.correlationId,
  };

  if (envelope.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw fbError(FB_CANONICAL_ERROR.CANONICAL_SCHEMA_MISMATCH, 'schema');
  }
  scanForbiddenKeys(envelope);
  return deepFreeze(envelope);
}

module.exports = {
  CANONICAL_SCHEMA_VERSION,
  PROVIDER,
  FACEBOOK_EDGE,
  CHANNEL,
  FB_CANONICAL_ERROR,
  HANDOFF_STATES,
  extractFacebookEventIdentity,
  computeFacebookIdempotencyKey,
  evaluateFacebookLoopGuard,
  mapFacebookHandoffStatusToCanonical,
  evaluateFacebookHandoffGate,
  toSafeAttachmentMeta,
  buildFacebookCanonicalEnvelope,
  canonicalSerialize,
};
