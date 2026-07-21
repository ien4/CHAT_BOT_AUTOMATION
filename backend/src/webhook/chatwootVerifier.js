'use strict';

// CHATWOOT-SIGNED-WEBHOOK-EDGE-IMPLEMENT-01
// Pure, side-effect-free HMAC admission verifier for Chatwoot signed webhooks.
//
// Baseline: Chatwoot >= v4.13.0 (first version that signs deliveries with
// X-Chatwoot-Signature / X-Chatwoot-Timestamp / X-Chatwoot-Delivery — see
// tmp-runtime/CHATWOOT_WEBHOOK_VERIFIER_RESEARCH_01_REPORT.md). This module is a
// MINIMUM-baseline admission gate; it does NOT claim the deployed instance is
// exactly v4.13.0. Runtime activation still requires exact version + explicit
// mechanism + secret rotation proof (deferred).
//
// Boundaries (intentional, enforced by design):
//   - PURE: only node:crypto. No process.env, no filesystem, no database,
//     no network, no Express request object.
//   - Strict HMAC only. There is NO token / query / header shared-secret
//     fallback and NO auto-detect. Every failure is fail-closed.
//   - JSON.parse happens ONLY after version + auth mode + mechanism + headers +
//     timestamp + signature + replay have all passed (VERIFY_BEFORE_JSON_PARSE).
//   - Never logs raw body / supplied signature / expected signature / secret /
//     message content (this module does not log at all).

const crypto = require('node:crypto');

const MINIMUM_SUPPORTED_CHATWOOT_VERSION = '4.13.0';
const SUPPORTED_AUTH_MODE = 'HMAC_SIGNED_WEBHOOK';
const SUPPORTED_MECHANISMS = Object.freeze([
  'ACCOUNT_INTEGRATION_WEBHOOK',
  'API_CHANNEL_WEBHOOK',
  'AGENT_BOT_OUTGOING_URL',
]);
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300; // receiver policy, NOT an official Chatwoot guarantee.

const SIGNATURE_PREFIX = 'sha256=';
const SIGNATURE_HEX_LEN = 64; // SHA-256 hex digest length.
const SIGNATURE_SHAPE_RE = /^sha256=[0-9a-f]{64}$/;

const CHATWOOT_VERIFY_ERROR = Object.freeze({
  CHATWOOT_EXACT_VERSION_REQUIRED: 'CHATWOOT_EXACT_VERSION_REQUIRED',
  CHATWOOT_VERSION_UNSUPPORTED: 'CHATWOOT_VERSION_UNSUPPORTED',
  CHATWOOT_AUTH_MODE_UNSUPPORTED: 'CHATWOOT_AUTH_MODE_UNSUPPORTED',
  CHATWOOT_MECHANISM_REQUIRED: 'CHATWOOT_MECHANISM_REQUIRED',
  CHATWOOT_MECHANISM_UNSUPPORTED: 'CHATWOOT_MECHANISM_UNSUPPORTED',
  CHATWOOT_SIGNING_SECRET_MISSING: 'CHATWOOT_SIGNING_SECRET_MISSING',
  CHATWOOT_HEADER_AMBIGUOUS: 'CHATWOOT_HEADER_AMBIGUOUS',
  CHATWOOT_SIGNATURE_MISSING: 'CHATWOOT_SIGNATURE_MISSING',
  CHATWOOT_SIGNATURE_MALFORMED: 'CHATWOOT_SIGNATURE_MALFORMED',
  CHATWOOT_SIGNATURE_INVALID: 'CHATWOOT_SIGNATURE_INVALID',
  CHATWOOT_TIMESTAMP_MISSING: 'CHATWOOT_TIMESTAMP_MISSING',
  CHATWOOT_TIMESTAMP_INVALID: 'CHATWOOT_TIMESTAMP_INVALID',
  CHATWOOT_TIMESTAMP_STALE: 'CHATWOOT_TIMESTAMP_STALE',
  CHATWOOT_DELIVERY_ID_MISSING: 'CHATWOOT_DELIVERY_ID_MISSING',
  CHATWOOT_DELIVERY_REPLAYED: 'CHATWOOT_DELIVERY_REPLAYED',
  CHATWOOT_REPLAY_STORE_ERROR: 'CHATWOOT_REPLAY_STORE_ERROR',
  CHATWOOT_PAYLOAD_INVALID: 'CHATWOOT_PAYLOAD_INVALID',
});

function cwError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  err.safe = true;
  return err;
}

// ---- Version gate (prompt §VIII / §XIV) ---------------------------------------
// Requires an EXACT semver. Ranges ("v4.13.0+"), partials ("v4.13"), and labels
// ("latest"/"stable"/"UNKNOWN") are rejected as CHATWOOT_EXACT_VERSION_REQUIRED.
function assertSupportedChatwootVersion(version) {
  if (typeof version !== 'string') {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_EXACT_VERSION_REQUIRED, 'version-not-string');
  }
  const raw = version.trim();
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw);
  if (!m) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_EXACT_VERSION_REQUIRED, 'not-exact-semver');
  }
  // Reject ambiguous leading zeros (e.g. "4.13.00").
  for (let i = 1; i <= 3; i += 1) {
    if (m[i].length > 1 && m[i][0] === '0') {
      throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_EXACT_VERSION_REQUIRED, 'leading-zero-segment');
    }
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  const min = MINIMUM_SUPPORTED_CHATWOOT_VERSION.split('.').map(Number);
  const cur = [major, minor, patch];
  let cmp = 0;
  for (let i = 0; i < 3 && cmp === 0; i += 1) {
    if (cur[i] > min[i]) cmp = 1;
    else if (cur[i] < min[i]) cmp = -1;
  }
  if (cmp < 0) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_VERSION_UNSUPPORTED, 'below-minimum');
  }
  return { major, minor, patch, normalized: `${major}.${minor}.${patch}` };
}

// ---- Single-value header reader (prompt §XVII) --------------------------------
// Case-insensitive. A security header MUST carry exactly one value; arrays and
// comma-joined duplicates are rejected (CHATWOOT_HEADER_AMBIGUOUS) rather than
// silently taking the first element. Returns null when absent.
function parseSingleHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const target = String(name).toLowerCase();
  let found;
  let seen = 0;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      found = headers[key];
      seen += 1;
    }
  }
  if (seen === 0 || found === undefined || found === null) return null;
  if (seen > 1) throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_HEADER_AMBIGUOUS, 'duplicate-key:' + target);
  if (Array.isArray(found)) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_HEADER_AMBIGUOUS, 'array-value:' + target);
  }
  const value = String(found);
  if (value.indexOf(',') !== -1) {
    // These headers (signature/timestamp/delivery) never legitimately contain a
    // comma; a comma means Node joined multiple header instances.
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_HEADER_AMBIGUOUS, 'comma-joined:' + target);
  }
  return value;
}

// ---- Raw body (prompt §XIII / §XVIII) -----------------------------------------
// rawBody MUST be a Buffer in runtime. A string is only accepted as an explicit
// convenience and is converted to a UTF-8 Buffer before signing.
function normalizeRawBody(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID, 'rawBody-not-buffer');
}

// ---- Timestamp freshness (prompt §XIX) ----------------------------------------
// `now` is injected Unix seconds — the core never calls Date.now() when now is
// supplied. Boundary (|delta| === maxSkew) is accepted.
function validateTimestamp(tsHeader, now, maxClockSkewSeconds) {
  if (typeof now !== 'number' || !Number.isFinite(now) || now < 0) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_INVALID, 'receiver-clock-required');
  }
  const maxSkew = typeof maxClockSkewSeconds === 'number' && Number.isFinite(maxClockSkewSeconds) && maxClockSkewSeconds >= 0
    ? maxClockSkewSeconds
    : DEFAULT_MAX_CLOCK_SKEW_SECONDS;
  if (tsHeader === null || tsHeader === undefined || tsHeader === '') {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_MISSING, 'timestamp-missing');
  }
  const raw = String(tsHeader);
  // Digits only → rejects decimals, negatives, exponents and non-numeric input.
  if (!/^[0-9]+$/.test(raw)) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_INVALID, 'not-unix-seconds');
  }
  const ts = Number(raw);
  if (!Number.isSafeInteger(ts)) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_INVALID, 'timestamp-range');
  }
  const delta = now - ts; // positive → past, negative → future
  if (delta > maxSkew) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_STALE, 'too-old');
  }
  if (-delta > maxSkew) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_TIMESTAMP_STALE, 'too-future');
  }
  return ts;
}

// ---- Signed message + HMAC (prompt §XVIII) ------------------------------------
function buildSignedMessage(timestampValue, rawBodyBuffer) {
  const body = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.toString('utf8') : String(rawBodyBuffer);
  return `${timestampValue}.${body}`;
}

function computeExpectedSignature(signingSecret, signedMessage) {
  const digest = crypto.createHmac('sha256', signingSecret).update(signedMessage, 'utf8').digest('hex');
  return SIGNATURE_PREFIX + digest;
}

// Constant-time comparison. Fails closed on length mismatch WITHOUT leaking which
// side differed. Never logs either value.
function safeCompareSignature(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch (_e) {
    return false;
  }
}

// ---- Transport replay identity (prompt §XX) -----------------------------------
// Prefers X-Chatwoot-Delivery. When absent, FAIL CLOSED — never invent a random
// id, never reuse the business message id as a transport delivery id.
function buildReplayIdentity(deliveryHeaderValue) {
  if (typeof deliveryHeaderValue !== 'string' || deliveryHeaderValue.trim().length === 0) {
    throw cwError(CHATWOOT_VERIFY_ERROR.CHATWOOT_DELIVERY_ID_MISSING, 'delivery-missing');
  }
  return deliveryHeaderValue.trim();
}

function failResult(code, ctx) {
  return {
    ok: false,
    verificationState: 'REJECTED',
    authMode: (ctx && ctx.authMode) || null,
    mechanism: (ctx && ctx.mechanism) || null,
    exactVersion: (ctx && ctx.exactVersion) || null,
    deliveryRef: null,
    timestamp: null,
    payload: null,
    safeErrorCode: code,
  };
}

// ---- Top-level admission verifier (prompt §XIII / §XXI / §XXII) ----------------
// Returns a provider-neutral result object; never throws for expected validation
// failures and never returns raw secret / raw body / signatures.
function verifyChatwootWebhook(input) {
  const args = input || {};
  const ctx = {};
  try {
    // 1) Version gate (exact semver >= 4.13.0).
    const versionInfo = assertSupportedChatwootVersion(args.exactVersion);
    ctx.exactVersion = versionInfo.normalized;

    // 2) Auth mode gate — strict HMAC only, no auto-detect.
    if (args.authMode !== SUPPORTED_AUTH_MODE) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_AUTH_MODE_UNSUPPORTED, ctx);
    }
    ctx.authMode = SUPPORTED_AUTH_MODE;

    // 3) Mechanism gate — explicit input, never defaulted.
    if (args.mechanism === undefined || args.mechanism === null || args.mechanism === '') {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_MECHANISM_REQUIRED, ctx);
    }
    if (!SUPPORTED_MECHANISMS.includes(args.mechanism)) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_MECHANISM_UNSUPPORTED, ctx);
    }
    ctx.mechanism = args.mechanism;

    // 4) Signing secret presence (no live secret is read from env here).
    if (typeof args.signingSecret !== 'string' || args.signingSecret.trim().length === 0) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNING_SECRET_MISSING, ctx);
    }

    // 5) Raw body → Buffer.
    const rawBody = normalizeRawBody(args.rawBody);

    // 6) Single-value security headers (case-insensitive).
    const signature = parseSingleHeader(args.headers, 'x-chatwoot-signature');
    const timestampHeader = parseSingleHeader(args.headers, 'x-chatwoot-timestamp');
    const deliveryHeader = parseSingleHeader(args.headers, 'x-chatwoot-delivery');

    // 7) Signature presence + shape (no token branch is ever attempted).
    if (signature === null) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_MISSING, ctx);
    }
    if (!SIGNATURE_SHAPE_RE.test(signature)) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_MALFORMED, ctx);
    }

    // 8) Timestamp freshness.
    const timestamp = validateTimestamp(timestampHeader, args.now, args.maxClockSkewSeconds);

    // 9) Raw-bytes HMAC verification (VERIFY_BEFORE_JSON_PARSE).
    const signedMessage = buildSignedMessage(timestamp, rawBody);
    const expected = computeExpectedSignature(args.signingSecret, signedMessage);
    if (!safeCompareSignature(expected, signature)) {
      // Invalid signature ⇒ ZERO JSON parse, ZERO canonical/AI call.
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_INVALID, ctx);
    }

    // 10) Transport replay gate (fail-closed on missing delivery / store error).
    const deliveryRef = buildReplayIdentity(deliveryHeader);
    if (!args.replayStore || typeof args.replayStore.reserve !== 'function') {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_REPLAY_STORE_ERROR, ctx);
    }
    let reserved;
    try {
      reserved = args.replayStore.reserve(deliveryRef);
    } catch (_storeErr) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_REPLAY_STORE_ERROR, ctx);
    }
    if (reserved === false) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_DELIVERY_REPLAYED, ctx);
    }

    // 11) Parse ONLY after full verification. Payload must be a JSON object.
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (_parseErr) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID, ctx);
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID, ctx);
    }

    return {
      ok: true,
      verificationState: 'VERIFIED',
      authMode: SUPPORTED_AUTH_MODE,
      mechanism: ctx.mechanism,
      exactVersion: ctx.exactVersion,
      deliveryRef,
      timestamp,
      payload,
      safeErrorCode: null,
    };
  } catch (e) {
    if (e && typeof e.code === 'string' && Object.prototype.hasOwnProperty.call(CHATWOOT_VERIFY_ERROR, e.code)) {
      return failResult(e.code, ctx);
    }
    // Unknown error ⇒ fail closed generically (still no secret/body leak).
    return failResult(CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID, ctx);
  }
}

module.exports = {
  MINIMUM_SUPPORTED_CHATWOOT_VERSION,
  SUPPORTED_AUTH_MODE,
  SUPPORTED_MECHANISMS,
  DEFAULT_MAX_CLOCK_SKEW_SECONDS,
  CHATWOOT_VERIFY_ERROR,
  assertSupportedChatwootVersion,
  parseSingleHeader,
  normalizeRawBody,
  validateTimestamp,
  buildSignedMessage,
  computeExpectedSignature,
  safeCompareSignature,
  buildReplayIdentity,
  verifyChatwootWebhook,
};
