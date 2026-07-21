'use strict';

// CHATWOOT-ACCOUNT-WEBHOOK-RUNTIME-SCHEMA-DESIGN-01
// Chatwoot Account Webhook ingress skeleton (feature-flagged, default OFF).
//
// This module is the PURE composition core of the ingress pipeline. It:
//   - takes ALL side-effecting collaborators via dependency injection
//     (createChatwootIngressHandler({...})),
//   - never instantiates Prisma, never reads process.env, never touches network,
//   - resolves the signing secret from an encrypted credential BEFORE any JSON
//     parse, verifies raw-body HMAC + timestamp, then reserves a DURABLE transport
//     delivery, and only then parses the verified payload,
//   - resolves the Tenant from a server-side inbox->integration mapping (never
//     from the payload), reserves a DURABLE business idempotency key (distinct
//     from transport replay), evaluates loop/handoff ownership, and invokes the
//     provider-neutral chatbot processor + outbound command port EXACTLY ONCE.
//
// It calls NO live Chatwoot API and NO live AI. Both are injected ports.

const verifier = require('./chatwootVerifier');
const canonical = require('./chatwootCanonical');

const SUPPORTED_INGRESS_EVENTS = Object.freeze(['message_created']);
const SIGNATURE_SHAPE_RE = /^sha256=[0-9a-f]{64}$/;

const INGRESS_STATUS = Object.freeze({
  DISABLED: 'WEBSITE_CHAT_DISABLED',
  RUNTIME_CONFIG_INVALID: 'CHATWOOT_RUNTIME_CONFIG_INVALID',
  ENDPOINT_NOT_FOUND: 'CHATWOOT_ENDPOINT_NOT_FOUND',
  ENDPOINT_KEY_MALFORMED: 'CHATWOOT_ENDPOINT_KEY_MALFORMED',
  CREDENTIAL_UNAVAILABLE: 'CHATWOOT_CREDENTIAL_UNAVAILABLE',
  RUNTIME_UNAVAILABLE: 'CHATWOOT_RUNTIME_UNAVAILABLE',
  SAFE_ERROR: 'SAFE_ERROR',
  ACCOUNT_MISMATCH: 'CHATWOOT_ACCOUNT_MISMATCH',
  SAFE_ACK: 'SAFE_ACK',
  ACCEPTED: 'ACCEPTED',
});

// Public endpoint key: opaque, high-entropy, NOT a secret, never contains an
// account/tenant id. Shape gate only — it never authenticates the request.
const ENDPOINT_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;

const CREDENTIAL_UNAVAILABLE_STATUSES = Object.freeze(['ROTATION_REQUIRED', 'REVOKED', 'DISABLED', 'PENDING']);

function maskKey(endpointKey) {
  if (typeof endpointKey !== 'string' || endpointKey.length === 0) return null;
  const head = endpointKey.slice(0, 4);
  return head + '…(' + endpointKey.length + ')';
}

// Map verifier fail codes to an HTTP decision.
function decideVerifierFailure(code) {
  switch (code) {
    case verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_REPLAY_STORE_ERROR:
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: code, aiInvoked: false };
    case verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_DELIVERY_REPLAYED:
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: code, aiInvoked: false };
    case verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID:
      // Signature valid but body is not a JSON object → ACK to stop useless retries.
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: code, aiInvoked: false };
    default:
      // Signature / timestamp / delivery-missing / header / config → safe 403.
      return { httpStatus: 403, status: INGRESS_STATUS.SAFE_ERROR, safeErrorCode: code, aiInvoked: false };
  }
}

function createChatwootIngressHandler(deps) {
  const d = deps || {};
  const config = d.config || {};
  const endpointRepository = d.endpointRepository;
  const credentialRepository = d.credentialRepository;
  const credentialDecryptor = d.credentialDecryptor;
  const replayStore = d.replayStore;
  const integrationResolver = d.integrationResolver;
  const businessEventStore = d.businessEventStore;
  const handoffPolicy = d.handoffPolicy;
  const canonicalMessageProcessor = d.canonicalMessageProcessor;
  const outboundCommandPort = d.outboundCommandPort;
  const auditWriter = d.auditWriter || { write() {} };
  const clock = typeof d.clock === 'function' ? d.clock : () => Math.floor(Date.now() / 1000);

  const maxClockSkewSeconds = typeof config.maxClockSkewSeconds === 'number'
    ? config.maxClockSkewSeconds : verifier.DEFAULT_MAX_CLOCK_SKEW_SECONDS;

  // Runtime config completeness gate. When core collaborators are missing the
  // route is enabled by flag but cannot serve → 503, never a silent fallback.
  function isRuntimeConfigComplete() {
    return Boolean(endpointRepository && credentialRepository && credentialDecryptor
      && replayStore && integrationResolver && businessEventStore
      && canonicalMessageProcessor && outboundCommandPort);
  }

  function audit(safe) {
    try { auditWriter.write(canonical.sanitizeChatwootAuditMetadata(safe)); } catch (_e) { /* audit is best-effort, never throws to caller */ }
  }

  async function handle(request) {
    const req = request || {};
    const endpointKey = req.endpointKey;
    const headers = req.headers || {};
    const rawBody = req.rawBody;
    const now = clock();

    // Step 0 (flag) is enforced by the route BEFORE this handler is built.
    if (!isRuntimeConfigComplete()) {
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, safeErrorCode: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, aiInvoked: false };
    }

    // Step 1: endpoint key shape (no DB hit for an obviously invalid key).
    if (typeof endpointKey !== 'string' || !ENDPOINT_KEY_RE.test(endpointKey)) {
      return { httpStatus: 404, status: INGRESS_STATUS.ENDPOINT_NOT_FOUND, safeErrorCode: INGRESS_STATUS.ENDPOINT_KEY_MALFORMED, aiInvoked: false };
    }

    // Step 2: resolve the ENABLED account webhook endpoint by public key.
    let endpoint;
    try {
      endpoint = await endpointRepository.findEnabledByPublicEndpointKey(endpointKey);
    } catch (_e) {
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.RUNTIME_UNAVAILABLE, aiInvoked: false };
    }
    if (!endpoint || endpoint.isEnabled === false) {
      return { httpStatus: 404, status: INGRESS_STATUS.ENDPOINT_NOT_FOUND, safeErrorCode: INGRESS_STATUS.ENDPOINT_NOT_FOUND, aiInvoked: false };
    }

    // Step 3: exact version / config validation (before any credential decrypt).
    if (endpoint.mechanism !== 'ACCOUNT_INTEGRATION_WEBHOOK'
      || endpoint.authMode !== verifier.SUPPORTED_AUTH_MODE) {
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, safeErrorCode: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, aiInvoked: false };
    }
    let exactVersion;
    try {
      exactVersion = verifier.assertSupportedChatwootVersion(endpoint.exactVersion).normalized;
    } catch (_e) {
      // exactVersion null / range / unsupported → not activatable yet.
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, safeErrorCode: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, aiInvoked: false };
    }

    // Step 4: load + decrypt the active signing credential. Secret stays in local
    // scope; it is never placed on the request context, envelope, log or error.
    let signingSecret;
    try {
      const credential = await credentialRepository.getActiveSigningCredential(endpoint.id);
      if (!credential
        || credential.credentialType !== 'WEBHOOK_SIGNING_SECRET'
        || CREDENTIAL_UNAVAILABLE_STATUSES.includes(credential.status)
        || !credential.ciphertext) {
        return { httpStatus: 503, status: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, aiInvoked: false };
      }
      signingSecret = credentialDecryptor.decrypt(credential);
      if (typeof signingSecret !== 'string' || signingSecret.length === 0) {
        return { httpStatus: 503, status: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, aiInvoked: false };
      }
    } catch (_e) {
      // DECRYPT_FAILED / store error → never leak; 503, zero parse, zero AI.
      return { httpStatus: 503, status: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.CREDENTIAL_UNAVAILABLE, aiInvoked: false };
    }

    // Step 5: verify raw-body HMAC + timestamp using the LANDED verifier PRIMITIVES.
    // The bundled verifyChatwootWebhook() takes a SYNCHRONOUS replay port; a durable
    // DB store is async, so we sequence the immutable primitives ourselves to keep
    // the exact order: HMAC+timestamp (5) → durable async replay (6) → parse (7).
    let deliveryRef;
    let rawBodyBuf;
    try {
      rawBodyBuf = verifier.normalizeRawBody(rawBody);
      const signature = verifier.parseSingleHeader(headers, 'x-chatwoot-signature');
      const timestampHeader = verifier.parseSingleHeader(headers, 'x-chatwoot-timestamp');
      const deliveryHeader = verifier.parseSingleHeader(headers, 'x-chatwoot-delivery');
      if (signature === null) {
        signingSecret = null;
        return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_MISSING);
      }
      if (!SIGNATURE_SHAPE_RE.test(signature)) {
        signingSecret = null;
        return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_MALFORMED);
      }
      const timestamp = verifier.validateTimestamp(timestampHeader, now, maxClockSkewSeconds);
      const signedMessage = verifier.buildSignedMessage(timestamp, rawBodyBuf);
      const expected = verifier.computeExpectedSignature(signingSecret, signedMessage);
      if (!verifier.safeCompareSignature(expected, signature)) {
        signingSecret = null;
        return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_SIGNATURE_INVALID);
      }
      // Delivery id required BEFORE parse (fail-closed, never invent one).
      deliveryRef = verifier.buildReplayIdentity(deliveryHeader);
    } catch (e) {
      signingSecret = null;
      const code = (e && e.code) || verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID;
      audit({ provider: canonical.PROVIDER, mechanism: endpoint.mechanism, verificationState: 'REJECTED', safeErrorCode: code });
      return decideVerifierFailure(code);
    } finally {
      // Discard the plaintext secret reference as soon as HMAC comparison is done.
      signingSecret = null;
    }

    // Step 6: DURABLE (async) transport replay reservation, AFTER a valid signature.
    let transportOutcome;
    try {
      transportOutcome = await replayStore.reserveTransport({ endpointId: endpoint.id, deliveryRef, timestamp: now });
    } catch (_e) {
      return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_REPLAY_STORE_ERROR);
    }
    if (transportOutcome !== 'RESERVED_NEW') {
      return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_DELIVERY_REPLAYED);
    }

    // Step 7: parse the VERIFIED JSON only now. Must be a JSON object.
    let payload;
    try {
      payload = JSON.parse(rawBodyBuf.toString('utf8'));
    } catch (_e) {
      return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID);
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return decideVerifierFailure(verifier.CHATWOOT_VERIFY_ERROR.CHATWOOT_PAYLOAD_INVALID);
    }

    const correlationId = 'cw-' + endpoint.id + '-' + deliveryRef;

    // Step 8: event allowlist. Only message_created is processed in this phase.
    const eventType = typeof payload.event === 'string' ? payload.event : null;
    if (!SUPPORTED_INGRESS_EVENTS.includes(eventType)) {
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: 'UNSUPPORTED_CHATWOOT_EVENT', aiInvoked: false };
    }

    // Step 9: extract account / inbox / message identity from the VERIFIED payload.
    let identity;
    try {
      identity = canonical.extractChatwootEventIdentity(payload, endpoint.mechanism);
    } catch (e) {
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: (e && e.code) || 'CHATWOOT_PAYLOAD_INVALID', aiInvoked: false };
    }

    // Step 10: account consistency — payload account MUST equal endpoint account.
    if (String(identity.externalAccountId) !== String(endpoint.externalAccountId)) {
      audit({ provider: canonical.PROVIDER, mechanism: endpoint.mechanism, eventType, safeErrorCode: INGRESS_STATUS.ACCOUNT_MISMATCH });
      return { httpStatus: 403, status: INGRESS_STATUS.ACCOUNT_MISMATCH, safeErrorCode: INGRESS_STATUS.ACCOUNT_MISMATCH, aiInvoked: false };
    }

    // Step 11: resolve IntegrationIdentity → TenantIntegration → Tenant. NO fallback.
    let resolution;
    try {
      resolution = await integrationResolver.resolveExactlyOneEnabledIntegration({
        endpointId: endpoint.id,
        deploymentKey: endpoint.deploymentKey,
        externalAccountId: identity.externalAccountId,
        externalInboxId: identity.externalInboxId,
      });
    } catch (_e) {
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.RUNTIME_UNAVAILABLE, aiInvoked: false };
    }
    if (!resolution || resolution.status !== 'RESOLVED') {
      const code = 'CHATWOOT_INTEGRATION_' + ((resolution && resolution.status) || 'NOT_FOUND');
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: code, aiInvoked: false };
    }
    const tenantId = resolution.tenantId;
    const integrationId = resolution.integrationId;

    // Step 12: loop / private / system guard (defense in depth).
    const guard = canonical.evaluateChatwootLoopGuard({
      direction: identity.direction,
      senderRole: identity.senderRole,
      isPrivate: identity.isPrivate,
      messageType: identity.messageType,
      isActivity: identity.messageType === 'activity',
      senderRef: identity.senderRef,
    });

    // Step 13: DURABLE business idempotency reservation (distinct from transport).
    let idempotencyKey;
    try {
      idempotencyKey = canonical.computeChatwootIdempotencyKey({
        integrationId,
        providerEventRef: identity.providerEventRef,
        externalMessageRef: identity.externalMessageId,
        eventType,
        direction: identity.direction,
      });
    } catch (e) {
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: (e && e.code) || 'CHATWOOT_EVENT_IDENTITY_UNAVAILABLE', aiInvoked: false };
    }

    let reservation;
    try {
      reservation = await businessEventStore.reserveEvent({
        provider: canonical.PROVIDER,
        integrationId,
        tenantId,
        providerEventRef: identity.providerEventRef,
        externalMessageRef: identity.externalMessageId,
        eventType,
        direction: identity.direction,
        idempotencyKey,
        correlationId,
      });
    } catch (_e) {
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: INGRESS_STATUS.RUNTIME_UNAVAILABLE, aiInvoked: false };
    }
    const reserveResult = reservation && reservation.result;
    const isFirstDelivery = reserveResult === 'RESERVED_NEW' || reserveResult === 'RETRYABLE_EXISTING';
    if (!isFirstDelivery) {
      // Duplicate business event → zero processor, zero outbound, safe ACK.
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: 'CHATWOOT_BUSINESS_DUPLICATE', aiInvoked: false, reserveResult };
    }

    // Step 14: Human ↔ AI ownership.
    let handoffState = 'BOT_ACTIVE';
    if (handoffPolicy && typeof handoffPolicy.evaluate === 'function') {
      try {
        const ho = await handoffPolicy.evaluate({ tenantId, integrationId, conversationRef: identity.externalConversationId, policyRef: resolution.handoffPolicy });
        if (ho && typeof ho.handoffState === 'string') handoffState = ho.handoffState;
      } catch (_e) {
        handoffState = 'BOT_ACTIVE';
      }
    }

    // Automatic chatbot eligibility (§XXII) — every condition must hold.
    const eligible = eventType === 'message_created'
      && identity.direction === 'inbound'
      && identity.isPrivate !== true
      && identity.senderRole === 'customer'
      && resolution.processingMode === 'AUTO_BOT'
      && resolution.tenantActive === true
      && handoffState === 'BOT_ACTIVE'
      && guard.result === 'ALLOW_INBOUND_PROCESSING';

    if (!eligible) {
      // Not eligible (agent/bot/private/outgoing/human-owned/duplicate content) →
      // safe ACK, ZERO AI. Mark completed so a valid non-AI event is not retried.
      try { await businessEventStore.markCompleted(idempotencyKey); } catch (_e) { /* best effort */ }
      audit({ provider: canonical.PROVIDER, mechanism: endpoint.mechanism, eventType, direction: identity.direction, integrationId, tenantId, verificationState: 'VERIFIED', correlationId, safeErrorCode: guard.result !== 'ALLOW_INBOUND_PROCESSING' ? guard.result : 'CHATWOOT_NOT_ELIGIBLE_' + handoffState });
      return { httpStatus: 200, status: INGRESS_STATUS.SAFE_ACK, safeErrorCode: guard.result !== 'ALLOW_INBOUND_PROCESSING' ? guard.result : 'CHATWOOT_HUMAN_OWNED', aiInvoked: false, handoffState };
    }

    // Step 15: build the canonical envelope (server tenant/integration, deep-frozen).
    let envelope;
    try {
      envelope = canonical.buildChatwootCanonicalEnvelope({
        integrationId,
        tenantId,
        verificationState: 'VERIFIED',
        mechanism: endpoint.mechanism,
        identity,
        text: typeof payload.content === 'string' ? payload.content : null,
        attachments: payload.attachments,
        providerTimestamp: payload.created_at || null,
        receivedAt: now,
        deliveryRef,
        handoffState,
        correlationId,
      });
    } catch (e) {
      try { await businessEventStore.markRetryableFailure(idempotencyKey, (e && e.code) || 'CANONICAL_BUILD_FAILED'); } catch (_e2) { /* best effort */ }
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: (e && e.code) || 'CANONICAL_BUILD_FAILED', aiInvoked: false };
    }

    // Step 16: invoke the chatbot processor EXACTLY ONCE.
    let processed;
    try {
      processed = await canonicalMessageProcessor.processCanonicalMessage(envelope);
    } catch (e) {
      try { await businessEventStore.markRetryableFailure(idempotencyKey, 'PROCESSOR_ERROR'); } catch (_e2) { /* best effort */ }
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: 'PROCESSOR_ERROR', aiInvoked: true };
    }

    const processedResult = processed && processed.result;

    // Step 17: emit the outbound reply command EXACTLY ONCE (only for REPLY_COMMAND).
    let outboundSent = false;
    if (processedResult === 'REPLY_COMMAND') {
      try {
        await outboundCommandPort.send({
          integrationId,
          tenantId,
          externalConversationRef: envelope.externalConversationRef,
          content: typeof processed.content === 'string' ? processed.content : '',
          correlationId,
          idempotencyKey,
        });
        outboundSent = true;
      } catch (_e) {
        // Outbound adapter is a deferred port; a failure marks retryable but never
        // double-replies because the business receipt is not completed.
        try { await businessEventStore.markRetryableFailure(idempotencyKey, 'OUTBOUND_ERROR'); } catch (_e2) { /* best effort */ }
        return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: 'OUTBOUND_ERROR', aiInvoked: true, outboundSent: false };
      }
    }

    // Step 18: mark the business event completed / retryable / final.
    if (processedResult === 'PROCESSING_FAILED') {
      try { await businessEventStore.markRetryableFailure(idempotencyKey, 'PROCESSING_FAILED'); } catch (_e) { /* best effort */ }
      audit({ provider: canonical.PROVIDER, mechanism: endpoint.mechanism, eventType, direction: identity.direction, integrationId, tenantId, verificationState: 'VERIFIED', correlationId, safeErrorCode: 'PROCESSING_FAILED' });
      return { httpStatus: 503, status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, safeErrorCode: 'PROCESSING_FAILED', aiInvoked: true, outboundSent };
    }
    try { await businessEventStore.markCompleted(idempotencyKey); } catch (_e) { /* best effort */ }

    // Step 19: safe audit (no content / PII / secret / signature).
    audit({ provider: canonical.PROVIDER, mechanism: endpoint.mechanism, eventType, direction: identity.direction, integrationId, tenantId, verificationState: 'VERIFIED', correlationId, externalMessageRef: identity.externalMessageId, deliveryRef });

    // Step 20: response.
    return {
      httpStatus: 200,
      status: INGRESS_STATUS.ACCEPTED,
      safeErrorCode: null,
      aiInvoked: true,
      processedResult: processedResult || 'NO_REPLY',
      outboundSent,
      handoffState,
      reserveResult,
    };
  }

  return { handle, isRuntimeConfigComplete };
}

module.exports = {
  createChatwootIngressHandler,
  INGRESS_STATUS,
  SUPPORTED_INGRESS_EVENTS,
  ENDPOINT_KEY_RE,
  maskKey,
};
