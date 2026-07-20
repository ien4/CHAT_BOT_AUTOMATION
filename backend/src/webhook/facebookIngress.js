'use strict';

// FACEBOOK-DIRECT-CANONICAL-DURABLE-INGRESS-CLOSEOUT-01
// Facebook Direct ingress composition: feature mode + canonical build (production
// module) + durable acceptance + ACK decision + per-Page token authority.
//
// Boundaries:
//   - Uses only the production-safe facebookCanonical module — NEVER the offline
//     harness / fixtures / test-only escape hatch.
//   - Reads a single non-secret feature flag FACEBOOK_CANONICAL_RUNTIME_MODE.
//   - Pure decision helpers are unit-testable; durable acceptance takes an injected
//     repository so no DB is touched unless a caller supplies one.

const fbc = require('./facebookCanonical');

const RUNTIME_MODES = Object.freeze(['off', 'shadow', 'enforce']);

let invalidModeWarned = false;

// Resolve the runtime mode. Unknown value → 'off' (fail-safe, never auto-enforce).
function resolveRuntimeMode(rawValue) {
  const raw = rawValue !== undefined ? rawValue : process.env.FACEBOOK_CANONICAL_RUNTIME_MODE;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === '') return 'off';
  if (!RUNTIME_MODES.includes(value)) {
    if (!invalidModeWarned) {
      invalidModeWarned = true;
      // eslint-disable-next-line no-console
      console.warn('[FacebookIngress] FACEBOOK_CANONICAL_MODE_INVALID — falling back to off');
    }
    return 'off';
  }
  return value;
}

function isRuntimeModeActive(rawValue) {
  return resolveRuntimeMode(rawValue) !== 'off';
}

// Server-resolved Facebook integration identity = the Page id (unique) from the
// already-resolved page context. NEVER a request/sender-supplied value.
function facebookIntegrationIdFromPageContext(pageContext) {
  if (!pageContext || !pageContext.pageId) {
    throw fbc.FB_CANONICAL_ERROR
      ? Object.assign(new Error('FACEBOOK_INTEGRATION_SCOPE_REQUIRED'), { code: 'FACEBOOK_INTEGRATION_SCOPE_REQUIRED' })
      : new Error('FACEBOOK_INTEGRATION_SCOPE_REQUIRED');
  }
  return 'facebook:page:' + String(pageContext.pageId);
}

// Build a canonical omni.msg.v1 envelope for a VERIFIED + tenant-resolved event.
// Throws FACEBOOK_EVENT_IDENTITY_UNAVAILABLE when there is no trustworthy mid.
function buildVerifiedCanonical(event, pageContext, options) {
  const opts = options || {};
  const clock = typeof opts.clock === 'function' ? opts.clock : () => new Date().toISOString();
  const identity = fbc.extractFacebookEventIdentity(event);
  return fbc.buildFacebookCanonicalEnvelope({
    integrationId: facebookIntegrationIdFromPageContext(pageContext),
    tenantId: pageContext.tenantId,
    externalAccountRef: pageContext.pageId,
    identity,
    text: undefined, // message text intentionally excluded from the canonical view
    attachments: event && event.message && event.message.attachments,
    providerTimestamp: event && event.timestamp ? new Date(event.timestamp).toISOString() : null,
    receivedAt: clock(),
    verificationState: 'VERIFIED',
    handoffStatus: pageContext.handoffStatus,
    correlationId: opts.correlationId,
  });
}

// Per-Page token authority. In enforce mode a Page without its own access token
// is ambiguous (must not borrow the global token of a different Page).
function checkPageTokenAuthority(pageContext, mode) {
  const hasPerPageToken = Boolean(pageContext && typeof pageContext.accessToken === 'string' && pageContext.accessToken.length > 0);
  if (hasPerPageToken) return { authority: 'PER_PAGE_TOKEN_REQUIRED', ok: true };
  if (resolveRuntimeMode(mode) === 'enforce') {
    return { authority: 'FACEBOOK_PAGE_TOKEN_AUTHORITY_AMBIGUOUS', ok: false };
  }
  return { authority: 'GLOBAL_FALLBACK_LEGACY', ok: true };
}

// Map a durable reserve result to an ACK + processing decision.
// NO_SUCCESS_ACK_BEFORE_DURABLE_ACCEPTANCE: only RESERVED_NEW proceeds to process.
function decideAck(reserveResult) {
  switch (reserveResult) {
    case 'RESERVED_NEW':
      return { httpStatus: 200, process: true, reason: 'RESERVED_NEW' };
    case 'DUPLICATE_COMPLETED':
      return { httpStatus: 200, process: false, reason: 'DUPLICATE_COMPLETED' };
    case 'DUPLICATE_PROCESSING':
      return { httpStatus: 200, process: false, reason: 'DUPLICATE_PROCESSING' };
    case 'RETRYABLE_EXISTING':
      return { httpStatus: 200, process: true, reason: 'RETRYABLE_EXISTING' };
    case 'CONFLICT':
      return { httpStatus: 200, process: false, reason: 'CONFLICT' };
    default:
      // Unknown → do not process; safe accepted response.
      return { httpStatus: 200, process: false, reason: 'UNKNOWN_SAFE_NOOP' };
  }
}

// Durable acceptance for enforce mode. Reserves the event BEFORE any AI/tool.
// A raw repository/DB error is surfaced so the caller can answer retryable (503).
async function acceptEventDurably(params) {
  const p = params || {};
  const repo = p.repo;
  const envelope = p.envelope;
  if (!repo) throw Object.assign(new Error('FACEBOOK_DURABLE_REPO_REQUIRED'), { code: 'FACEBOOK_DURABLE_REPO_REQUIRED' });
  const reservation = await repo.reserveEvent({
    provider: envelope.provider,
    integrationId: envelope.integrationId,
    tenantId: envelope.tenantId,
    providerEventRef: envelope.providerEventRef,
    externalMessageRef: envelope.externalMessageRef,
    eventType: envelope.eventType,
    direction: envelope.direction,
    idempotencyKey: envelope.idempotencyKey,
    correlationId: envelope.correlationId,
  });
  return { reservation, ack: decideAck(reservation.result) };
}

// Shadow-mode observation: build + validate canonical best-effort. NEVER throws to
// the caller and NEVER alters processing. No raw payload/secret is logged.
function observeVerifiedIngress(event, pageContext, options) {
  const mode = resolveRuntimeMode(options && options.mode);
  if (mode === 'off') return { observed: false, mode };
  try {
    const envelope = buildVerifiedCanonical(event, pageContext, options);
    return {
      observed: true,
      mode,
      safe: {
        provider: envelope.provider,
        tenantId: envelope.tenantId,
        integrationId: envelope.integrationId,
        direction: envelope.direction,
        eventType: envelope.eventType,
        idempotencyKey: envelope.idempotencyKey,
        handoffState: envelope.handoffState,
      },
    };
  } catch (e) {
    return { observed: false, mode, safeErrorCode: (e && e.code) || 'INTERNAL_ERROR' };
  }
}

module.exports = {
  RUNTIME_MODES,
  resolveRuntimeMode,
  isRuntimeModeActive,
  facebookIntegrationIdFromPageContext,
  buildVerifiedCanonical,
  checkPageTokenAuthority,
  decideAck,
  acceptEventDurably,
  observeVerifiedIngress,
};
