'use strict';

// OMNI-CHANNEL-OFFLINE-E2E-DESIGN-01
// Executable canonical reference model (pure, side-effect-free) implementing the
// contract from tmp-runtime/OMNI_CHANNEL_CANONICAL_SCHEMA_API_CONTRACT_DESIGN_01.
//
// This module PROVES contract behavior over synthetic in-memory values but CANNOT
// activate runtime, database or network capability. It intentionally:
//   - never imports PrismaClient,
//   - never reads DATABASE_URL / .env / an environment variable,
//   - never performs a network call (no axios / fetch / socket),
//   - never writes a file (at import or ever),
//   - never requires runtime source under ../src.
//
// Only Node built-in node:crypto is used, and only for deterministic hashing.

const crypto = require('node:crypto');

const CANONICAL_SCHEMA_VERSION = 'omni.msg.v1';

// 14 processing states (contract §11).
const PROCESSING_STATES = Object.freeze([
  'RECEIVED',
  'VERIFICATION_REQUIRED',
  'VERIFIED',
  'PAYLOAD_VALIDATED',
  'IDENTITY_EXTRACTED',
  'TENANT_RESOLVED',
  'IDEMPOTENCY_RESERVED',
  'PROCESSING',
  'HANDOFF_BLOCKED',
  'COMPLETED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'DUPLICATE',
  'REJECTED',
]);

// 6 handoff states (contract §18).
const HANDOFF_STATES = Object.freeze([
  'BOT_ACTIVE',
  'HUMAN_REQUESTED',
  'HUMAN_ACTIVE',
  'BOT_PAUSED',
  'BOT_RESUME_PENDING',
  'CLOSED',
]);

// Stable safe-error codes (contract §19 taxonomy families). No raw provider error,
// no secret ever travels in these codes.
const SAFE_ERROR_CODES = Object.freeze({
  VERIFY_FAILED: 'VERIFY_FAILED',
  PAYLOAD_INVALID: 'PAYLOAD_INVALID',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  IDENTITY_INVALID: 'IDENTITY_INVALID',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  INTEGRATION_DISABLED: 'INTEGRATION_DISABLED',
  INTEGRATION_AMBIGUOUS: 'INTEGRATION_AMBIGUOUS',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_DISABLED: 'TENANT_DISABLED',
  IDEMPOTENCY_DUPLICATE: 'IDEMPOTENCY_DUPLICATE',
  EVENT_IDENTITY_UNAVAILABLE: 'EVENT_IDENTITY_UNAVAILABLE',
  HANDOFF_BLOCKED: 'HANDOFF_BLOCKED',
  HANDOFF_CONFLICT: 'HANDOFF_CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  OUTBOUND_LOOP_BLOCKED: 'OUTBOUND_LOOP_BLOCKED',
  CANONICAL_SECRET_FIELD_FORBIDDEN: 'CANONICAL_SECRET_FIELD_FORBIDDEN',
  CANONICAL_SCHEMA_MISMATCH: 'CANONICAL_SCHEMA_MISMATCH',
  PROVIDER_UNKNOWN: 'PROVIDER_UNKNOWN',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  AUTHZ_DENIED: 'AUTHZ_DENIED',
  SECRET_MISSING: 'SECRET_MISSING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

// Providers this reference model recognizes. `facebook` = existing runtime edge;
// `chatwoot` = CONCEPTUAL_ONLY / UNVERIFIED_PROVIDER_SHAPE (auth contract unverified).
const KNOWN_PROVIDERS = Object.freeze(['facebook', 'chatwoot']);
const VALID_DIRECTIONS = Object.freeze(['inbound', 'outbound']);
const VALID_SENDER_ROLES = Object.freeze(['customer', 'bot', 'agent', 'system']);

// Keys that must NEVER appear anywhere inside a Canonical Envelope (contract §14).
const CANONICAL_FORBIDDEN_KEY_RE = /^(apitoken|accesstoken|pageaccesstoken|webhooksecret|secret|password|authorization|rawpayload|rawbody|apikey|privatekey|ciphertext)$/i;

// Attachment metadata is reference-only: no inline content / no fetchable source
// (safe default REMOTE_ATTACHMENT_FETCH_DISABLED).
const ATTACHMENT_FORBIDDEN_KEY_RE = /^(content|data|url|src|href|body)$/i;

// Log projection allowlist (contract §20 / §28 safe logging).
const SAFE_LOG_KEYS = Object.freeze([
  'eventType', 'tenantId', 'integrationId', 'provider', 'channel', 'correlationId',
  'safeErrorCode', 'previousState', 'nextState', 'result', 'processingState',
  'direction', 'verificationState', 'handoffState', 'idempotencyKey', 'loopGuardResult',
]);

function omniError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  err.safe = true;
  return err;
}

function deepFreeze(obj) {
  if (obj === null || (typeof obj !== 'object')) return obj;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

function nfc(value) {
  return String(value).normalize('NFC');
}

function defaultSha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// ---- Identity normalization (contract §13b / prompt §XI) ----------------------
// Accepts a bare positive integer id OR a provider console URL/path whose TERMINAL
// resource segment matches resourceType exactly. Rejects arbitrary trailing digits,
// wrong resource (e.g. a Team URL used as an Inbox id), negatives and decimals.
function normalizeExternalNumericId(value, resourceType) {
  if (typeof resourceType !== 'string' || resourceType.length === 0) {
    throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'resourceType required');
  }
  if (value === null || value === undefined) {
    throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'empty identity');
  }

  // Plain integer (number form).
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'non-positive-integer');
    }
    return String(value);
  }

  const raw = nfc(value).trim();
  if (raw.length === 0) {
    throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'empty identity');
  }

  // Pure digits → already a normalized id.
  if (/^[0-9]+$/.test(raw)) {
    if (/^0[0-9]+$/.test(raw)) {
      throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'leading-zero id');
    }
    return raw;
  }

  // URL / path form: require the terminal segment to be exactly
  // `<resourceType>/<digits>` (optionally trailing slash). This deliberately
  // rejects `.../teams/1/edit`, `.../random/42`, and query-string authority.
  if (raw.includes('/')) {
    const escaped = resourceType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const terminal = new RegExp('(?:^|/)' + escaped + '/([1-9][0-9]*)/?$');
    const m = raw.split('?')[0].match(terminal);
    if (m) return m[1];
    throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'url-terminal-mismatch');
  }

  throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'unrecognized-identity');
}

// ---- Global integration identity key (contract §12) --------------------------
// Global (NOT tenant-scoped) → ONE_EXTERNAL_INBOX_IDENTITY_TO_ONE_TENANT.
function buildNormalizedIntegrationIdentityKey(parts, hashFunction) {
  const hash = hashFunction || defaultSha256Hex;
  const provider = nfc(parts && parts.provider).trim().toLowerCase();
  const deploymentKey = nfc(parts && parts.deploymentKey).trim().toLowerCase();
  const account = normalizeExternalNumericId(parts && parts.externalAccountId, 'accounts');
  const inbox = normalizeExternalNumericId(parts && parts.externalInboxId, 'inboxes');
  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw omniError(SAFE_ERROR_CODES.PROVIDER_UNKNOWN, 'unknown-provider');
  }
  if (deploymentKey.length === 0) {
    throw omniError(SAFE_ERROR_CODES.IDENTITY_INVALID, 'deployment-required');
  }
  // Canonical field ordering, unambiguous separator. No tenantId, no secret.
  const canonical = canonicalSerialize({
    v: 1,
    provider,
    deploymentKey,
    externalAccountId: account,
    externalInboxId: inbox,
  });
  return hash(canonical);
}

// Stable serialization: sorted keys, NFC on string values.
function canonicalSerialize(obj) {
  return JSON.stringify(sortValue(obj));
}

function sortValue(value) {
  if (typeof value === 'string') return nfc(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortValue(value[key]);
  }
  return out;
}

// ---- Idempotency key (contract §14/15) ---------------------------------------
function computeIdempotencyKey(input, hashFunction) {
  const hash = hashFunction || defaultSha256Hex;
  const providerEventRef = input && input.providerEventRef;
  const externalMessageRef = input && input.externalMessageRef;
  const hasEventRef = typeof providerEventRef === 'string' && providerEventRef.length > 0;
  const hasMessageRef = typeof externalMessageRef === 'string' && externalMessageRef.length > 0;
  // Fail-closed: no trustworthy provider event identity. Never fall back to
  // timestamp / sender / text.
  if (!hasEventRef && !hasMessageRef) {
    throw omniError(SAFE_ERROR_CODES.EVENT_IDENTITY_UNAVAILABLE, 'no-event-identity');
  }
  if (!input.integrationId) {
    throw omniError(SAFE_ERROR_CODES.INTEGRATION_NOT_FOUND, 'integration-scope-required');
  }
  const canonical = canonicalSerialize({
    schemaVersion: input.schemaVersion || CANONICAL_SCHEMA_VERSION,
    provider: input.provider,
    integrationId: input.integrationId,
    providerEventRef: hasEventRef ? providerEventRef : null,
    externalMessageRef: hasMessageRef ? externalMessageRef : null,
    eventType: input.eventType,
    direction: input.direction,
  });
  return hash(canonical);
}

// ---- Canonical envelope build + validation (contract §9/10/14) ---------------
function scanForbiddenKeys(node, path) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => scanForbiddenKeys(child, path + '[' + i + ']'));
    return;
  }
  for (const key of Object.keys(node)) {
    if (CANONICAL_FORBIDDEN_KEY_RE.test(key)) {
      throw omniError(SAFE_ERROR_CODES.CANONICAL_SECRET_FIELD_FORBIDDEN, 'forbidden-key:' + key);
    }
    scanForbiddenKeys(node[key], path + '.' + key);
  }
}

function validateCanonicalEnvelope(env) {
  if (!env || typeof env !== 'object') {
    throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'envelope-missing');
  }
  if (env.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    throw omniError(SAFE_ERROR_CODES.CANONICAL_SCHEMA_MISMATCH, 'schema-version');
  }
  if (!KNOWN_PROVIDERS.includes(env.provider)) {
    throw omniError(SAFE_ERROR_CODES.PROVIDER_UNKNOWN, 'provider');
  }
  if (!VALID_DIRECTIONS.includes(env.direction)) {
    throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'direction');
  }
  if (!VALID_SENDER_ROLES.includes(env.senderRole)) {
    throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'senderRole');
  }
  // tenant authority is server-resolved only; presence is required here.
  if (!env.integrationId) throw omniError(SAFE_ERROR_CODES.INTEGRATION_NOT_FOUND, 'integrationId');
  if (!env.tenantId) throw omniError(SAFE_ERROR_CODES.TENANT_NOT_FOUND, 'tenantId');
  if (env.verificationState !== 'VERIFIED') {
    throw omniError(SAFE_ERROR_CODES.VERIFY_FAILED, 'not-verified-before-core');
  }
  if (!env.idempotencyKey) throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'idempotencyKey');
  if ('rawPayload' in env || 'rawBody' in env) {
    throw omniError(SAFE_ERROR_CODES.CANONICAL_SECRET_FIELD_FORBIDDEN, 'raw-payload-object');
  }
  // Attachment metadata must be reference-only.
  if (env.attachments !== undefined) {
    if (!Array.isArray(env.attachments)) {
      throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'attachments-not-array');
    }
    for (const att of env.attachments) {
      if (!att || typeof att !== 'object') {
        throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'attachment-shape');
      }
      for (const key of Object.keys(att)) {
        if (ATTACHMENT_FORBIDDEN_KEY_RE.test(key)) {
          throw omniError(SAFE_ERROR_CODES.PAYLOAD_INVALID, 'attachment-inline-content:' + key);
        }
      }
    }
  }
  // Deep scan every key for secret-like fields and provider tenant injection.
  scanForbiddenKeys(env, 'env');
  if (env.__providerSuppliedTenantId !== undefined || env.providerTenantId !== undefined) {
    throw omniError(SAFE_ERROR_CODES.AUTHZ_DENIED, 'provider-supplied-tenant');
  }
  return { ok: true };
}

// Build a deep-frozen Canonical Envelope. integrationId/tenantId/verificationState
// MUST be supplied by the (server-side) resolver+verifier — never by the provider.
function buildCanonicalEnvelope(input, options) {
  const opts = options || {};
  const hashFunction = opts.hashFunction;
  const idempotencyKey = input.idempotencyKey || computeIdempotencyKey({
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: input.provider,
    integrationId: input.integrationId,
    providerEventRef: input.providerEventRef,
    externalMessageRef: input.externalMessageRef,
    eventType: input.eventType,
    direction: input.direction,
  }, hashFunction);

  const env = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    provider: input.provider,
    channel: input.channel,
    integrationId: input.integrationId,
    tenantId: input.tenantId,
    externalDeploymentRef: input.externalDeploymentRef || null,
    externalAccountRef: input.externalAccountRef || null,
    externalInboxRef: input.externalInboxRef || null,
    externalConversationRef: input.externalConversationRef || null,
    externalMessageRef: input.externalMessageRef || null,
    providerEventRef: input.providerEventRef || null,
    eventType: input.eventType,
    direction: input.direction,
    messageType: input.messageType,
    senderRef: input.senderRef || null,
    senderRole: input.senderRole,
    text: typeof input.text === 'string' ? input.text : null,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    providerTimestamp: input.providerTimestamp || null,
    receivedAt: input.receivedAt, // injected clock value — no Date.now()
    verificationState: input.verificationState,
    idempotencyKey,
    handoffState: input.handoffState || 'BOT_ACTIVE',
    correlationId: input.correlationId,
  };
  validateCanonicalEnvelope(env);
  return deepFreeze(env);
}

// ---- Loop guard (contract §16 / prompt §XV) — defense in depth ----------------
function evaluateLoopGuard(evidence) {
  const ev = evidence || {};
  if (!VALID_DIRECTIONS.includes(ev.direction)) {
    return { result: 'UNKNOWN_DIRECTION_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.direction === 'outbound') {
    return { result: 'OUTBOUND_LOOP_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.senderRole === 'bot' || ev.senderRole === 'agent') {
    return { result: 'BOT_OR_AGENT_CALLBACK_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.ownBotIdentity && ev.messageSource && ev.ownBotIdentity === ev.messageSource) {
    return { result: 'BOT_OR_AGENT_CALLBACK_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.outboundCorrelationId) {
    return { result: 'DUPLICATE_OUTBOUND_CALLBACK', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.outboundIdempotencyKey && ev.knownOutboundIdempotencyKey === true) {
    return { result: 'DUPLICATE_OUTBOUND_CALLBACK', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  if (ev.eventAllowlistResult === 'DENY') {
    return { result: 'OUTBOUND_LOOP_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.OUTBOUND_LOOP_BLOCKED };
  }
  return { result: 'ALLOW_INBOUND_PROCESSING', aiAllowed: true, safeErrorCode: null };
}

// ---- Handoff gate (contract §18 / prompt §XVI) --------------------------------
function evaluateHandoffGate(state) {
  switch (state) {
    case 'BOT_ACTIVE':
      return { result: 'AI_ALLOWED', aiAllowed: true, safeErrorCode: null };
    case 'HUMAN_REQUESTED':
      // Explicit policy: hold AI while awaiting human (no auto double-reply).
      return { result: 'HANDOFF_PENDING_NO_AI', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
    case 'HUMAN_ACTIVE':
      return { result: 'HANDOFF_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
    case 'BOT_PAUSED':
      return { result: 'HANDOFF_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
    case 'BOT_RESUME_PENDING':
      return { result: 'HANDOFF_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
    case 'CLOSED':
      return { result: 'CLOSED_NO_AI', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
    default:
      return { result: 'HANDOFF_BLOCKED', aiAllowed: false, safeErrorCode: SAFE_ERROR_CODES.HANDOFF_BLOCKED };
  }
}

// ---- Safe log projection (contract §20) --------------------------------------
function sanitizeOmniLogMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const key of SAFE_LOG_KEYS) {
    const value = meta[key];
    if (value === undefined || value === null) continue;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

module.exports = {
  CANONICAL_SCHEMA_VERSION,
  PROCESSING_STATES,
  HANDOFF_STATES,
  SAFE_ERROR_CODES,
  KNOWN_PROVIDERS,
  VALID_DIRECTIONS,
  VALID_SENDER_ROLES,
  normalizeExternalNumericId,
  buildNormalizedIntegrationIdentityKey,
  canonicalSerialize,
  computeIdempotencyKey,
  validateCanonicalEnvelope,
  buildCanonicalEnvelope,
  evaluateLoopGuard,
  evaluateHandoffGate,
  sanitizeOmniLogMeta,
  deepFreeze,
  omniError,
};
