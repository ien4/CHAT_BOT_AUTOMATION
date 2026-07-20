'use strict';

// OMNI-CHANNEL-OFFLINE-E2E-DESIGN-01 — In-memory, mock-only ports + pipeline.
//
// Models the contract pipeline over synthetic data. It CANNOT activate runtime,
// database or network capability. No PrismaClient, no DATABASE_URL, no environment
// read, no network, no filesystem write, no ../src import.
//
// CONCURRENCY LIMITATION (stated honestly):
//   The idempotency store models atomic winner selection within a SINGLE process.
//   This is SINGLE_PROCESS_ATOMICITY_MODEL_ONLY and is
//   NOT_REAL_DISTRIBUTED_DURABILITY_PROOF. Real multi-instance durability requires
//   a DB unique constraint proven at runtime (deferred).

const ref = require('./omni-channel-canonical-reference');

// ---- Integration Identity Store (global external identity uniqueness) --------
function createInMemoryIntegrationIdentityStore(options) {
  const opts = options || {};
  const hashFunction = opts.hashFunction || null;
  const byKey = new Map(); // identityKey -> array of bindings

  function keyOf(binding) {
    return ref.buildNormalizedIntegrationIdentityKey({
      provider: binding.provider,
      deploymentKey: binding.deploymentKey,
      externalAccountId: binding.externalAccountId,
      externalInboxId: binding.externalInboxId,
    }, hashFunction);
  }

  return {
    keyOf,
    // Global uniqueness: a second DISTINCT binding for the same external identity
    // is rejected. This is what prevents one inbox mapping two tenants.
    register(binding) {
      const key = keyOf(binding);
      const existing = byKey.get(key) || [];
      for (const b of existing) {
        if (b.integrationId === binding.id) return key; // idempotent
        throw ref.omniError(ref.SAFE_ERROR_CODES.INTEGRATION_AMBIGUOUS, 'global-identity-conflict');
      }
      existing.push({ integrationId: binding.id, tenantId: binding.tenantId, isEnabled: binding.isEnabled });
      byKey.set(key, existing);
      return key;
    },
    // Deliberately bypasses the uniqueness guard to construct a corrupted store
    // for the ambiguity-resolution test ONLY.
    forceRegisterForAmbiguityTest(binding) {
      const key = keyOf(binding);
      const existing = byKey.get(key) || [];
      existing.push({ integrationId: binding.id, tenantId: binding.tenantId, isEnabled: binding.isEnabled });
      byKey.set(key, existing);
      return key;
    },
    lookup(key) {
      const bindings = byKey.get(key) || [];
      return { count: bindings.length, bindings };
    },
    size() { return byKey.size; },
  };
}

// ---- Integration / Tenant Resolver (fail-closed, no fallback) -----------------
function createInMemoryIntegrationResolver(options) {
  const opts = options || {};
  const identityStore = opts.identityStore;
  const integrationsById = opts.integrationsById || new Map();
  const tenantsById = opts.tenantsById || new Map();
  const hashFunction = opts.hashFunction || null;

  return {
    resolve(providerIdentity) {
      const key = ref.buildNormalizedIntegrationIdentityKey({
        provider: providerIdentity.provider,
        deploymentKey: providerIdentity.deploymentKey,
        externalAccountId: providerIdentity.externalAccountId,
        externalInboxId: providerIdentity.externalInboxId,
      }, hashFunction);
      const hit = identityStore.lookup(key);
      if (hit.count === 0) {
        throw ref.omniError(ref.SAFE_ERROR_CODES.INTEGRATION_NOT_FOUND, 'no-integration');
      }
      const enabledBindings = hit.bindings.filter((b) => b.isEnabled);
      if (hit.count > 1 || enabledBindings.length > 1) {
        throw ref.omniError(ref.SAFE_ERROR_CODES.INTEGRATION_AMBIGUOUS, 'ambiguous-identity');
      }
      const binding = hit.bindings[0];
      const integration = integrationsById.get(binding.integrationId);
      if (!integration) throw ref.omniError(ref.SAFE_ERROR_CODES.INTEGRATION_NOT_FOUND, 'integration-record');
      if (!integration.isEnabled) throw ref.omniError(ref.SAFE_ERROR_CODES.INTEGRATION_DISABLED, 'disabled');
      const tenant = tenantsById.get(integration.tenantId);
      if (!tenant) throw ref.omniError(ref.SAFE_ERROR_CODES.TENANT_NOT_FOUND, 'no-tenant');
      if (!tenant.isActive) throw ref.omniError(ref.SAFE_ERROR_CODES.TENANT_DISABLED, 'tenant-disabled');
      // NO fallback tenant, NO provider-supplied tenant authority.
      return {
        integrationId: integration.id,
        tenantId: tenant.id,
        channel: integration.channel,
        evidence: { identityKeyPrefix: key.slice(0, 12), resolvedBy: 'server' },
      };
    },
  };
}

// ---- Idempotency Store (single-process atomic model) --------------------------
function createInMemoryIdempotencyStore() {
  const byKey = new Map(); // idempotencyKey -> record

  return {
    reserve(idempotencyKey) {
      if (byKey.has(idempotencyKey)) {
        return { result: 'DUPLICATE', record: byKey.get(idempotencyKey) };
      }
      const record = { idempotencyKey, processingState: 'IDEMPOTENCY_RESERVED', attemptCount: 1 };
      byKey.set(idempotencyKey, record); // check-then-set is atomic within one process
      return { result: 'RESERVED_NEW', record };
    },
    inspect(idempotencyKey) { return byKey.get(idempotencyKey) || null; },
    complete(idempotencyKey) {
      const r = byKey.get(idempotencyKey);
      if (r) r.processingState = 'COMPLETED';
      return r;
    },
    failRetryable(idempotencyKey) {
      const r = byKey.get(idempotencyKey);
      if (r) { r.processingState = 'FAILED_RETRYABLE'; r.attemptCount += 1; } // same logical event
      return r;
    },
    failFinal(idempotencyKey) {
      const r = byKey.get(idempotencyKey);
      if (r) r.processingState = 'FAILED_FINAL';
      return r;
    },
    size() { return byKey.size; },
  };
}

// ---- Handoff Store (optimistic concurrency) ----------------------------------
const HANDOFF_TRANSITIONS = Object.freeze({
  BOT_ACTIVE: ['HUMAN_REQUESTED', 'CLOSED'],
  HUMAN_REQUESTED: ['HUMAN_ACTIVE', 'BOT_ACTIVE', 'CLOSED'],
  HUMAN_ACTIVE: ['BOT_PAUSED', 'CLOSED'],
  BOT_PAUSED: ['BOT_RESUME_PENDING', 'CLOSED'],
  BOT_RESUME_PENDING: ['BOT_ACTIVE', 'CLOSED'],
  CLOSED: [],
});

function createInMemoryHandoffStore() {
  const byConv = new Map(); // conversationRef -> { state, version }
  function ensure(convRef) {
    if (!byConv.has(convRef)) byConv.set(convRef, { state: 'BOT_ACTIVE', version: 1 });
    return byConv.get(convRef);
  }
  return {
    getState(convRef) { return Object.assign({}, ensure(convRef)); },
    seed(convRef, state, version) { byConv.set(convRef, { state, version: version || 1 }); },
    applyTransition(convRef, req) {
      const cur = ensure(convRef);
      if (req.expectedVersion !== cur.version) {
        throw ref.omniError(ref.SAFE_ERROR_CODES.VERSION_CONFLICT, 'version-conflict');
      }
      const allowed = HANDOFF_TRANSITIONS[cur.state] || [];
      if (!allowed.includes(req.to)) {
        throw ref.omniError(ref.SAFE_ERROR_CODES.HANDOFF_CONFLICT, 'transition-not-allowed');
      }
      cur.state = req.to;
      cur.version += 1;
      return Object.assign({}, cur);
    },
  };
}

// ---- Fake AI / Tool ports (count-only, no LLM, no real tool) ------------------
function createFakeAiPort() {
  let count = 0;
  return {
    invoke() { count += 1; return { aiInvoked: true }; },
    get count() { return count; },
  };
}
function createFakeToolPort() {
  let count = 0;
  return {
    invoke() { count += 1; return { toolInvoked: true }; },
    get count() { return count; },
  };
}

// ---- Safe Audit Collector (whitelist only) -----------------------------------
function createSafeAuditCollector() {
  const events = [];
  return {
    record(event) {
      events.push(ref.sanitizeOmniLogMeta(event));
    },
    get events() { return events.slice(); },
  };
}

// ---- Offline Omni Pipeline (contract §11 order / prompt §XIX) -----------------
function createOfflineOmniPipeline(ports) {
  const p = ports || {};
  const resolver = p.resolver;
  const idempotencyStore = p.idempotencyStore;
  const handoffStore = p.handoffStore;
  const aiPort = p.aiPort;
  const toolPort = p.toolPort;
  const audit = p.audit;
  const clock = p.clock;
  const idFactory = p.idFactory;
  const hashFunction = p.hashFunction || null;

  function finalize(state, correlationId, meta) {
    if (audit) {
      audit.record(Object.assign({
        eventType: 'PIPELINE_RESULT',
        correlationId,
        nextState: state,
        result: state,
      }, meta || {}));
    }
    return Object.assign({ finalState: state, correlationId }, meta || {});
  }

  function process(event, ctx) {
    const context = ctx || {};
    const correlationId = context.correlationId || (idFactory ? idFactory('corr') : 'corr-x');
    const aiBefore = aiPort ? aiPort.count : 0;
    const toolBefore = toolPort ? toolPort.count : 0;

    try {
      // 1. Verification (must precede everything core).
      if (event.verificationState !== 'VERIFIED') {
        return finalize('REJECTED', correlationId, { safeErrorCode: ref.SAFE_ERROR_CODES.VERIFY_FAILED });
      }
      // Provider outage is isolated: it never leaks into other providers' paths.
      if (event.simulateOutage === true) {
        return finalize('FAILED_RETRYABLE', correlationId, { safeErrorCode: ref.SAFE_ERROR_CODES.PROVIDER_UNAVAILABLE, provider: event.provider });
      }
      // 2. Payload / normalized-event validation.
      if (!ref.KNOWN_PROVIDERS.includes(event.provider)) {
        return finalize('REJECTED', correlationId, { safeErrorCode: ref.SAFE_ERROR_CODES.PROVIDER_UNKNOWN });
      }
      if (!event.eventType || !ref.VALID_DIRECTIONS.includes(event.direction)) {
        return finalize('REJECTED', correlationId, { safeErrorCode: ref.SAFE_ERROR_CODES.PAYLOAD_INVALID });
      }
      // 3. Provider identity extraction (URL→id normalization happens in resolver key).
      const providerIdentity = {
        provider: event.provider,
        deploymentKey: event.deploymentKey,
        externalAccountId: event.externalAccountId,
        externalInboxId: event.externalInboxId,
      };
      // 4 + 5. Global identity resolution + tenant resolution (fail-closed).
      const resolved = resolver.resolve(providerIdentity);
      // 6. Canonical envelope build (computes idempotency key; may fail-closed).
      const envelope = ref.buildCanonicalEnvelope({
        provider: event.provider,
        channel: resolved.channel || event.channel,
        integrationId: resolved.integrationId,
        tenantId: resolved.tenantId,
        externalDeploymentRef: event.deploymentKey,
        externalAccountRef: event.externalAccountId,
        externalInboxRef: event.externalInboxId,
        externalConversationRef: event.externalConversationRef,
        externalMessageRef: event.externalMessageRef,
        providerEventRef: event.providerEventRef,
        eventType: event.eventType,
        direction: event.direction,
        messageType: event.messageType,
        senderRef: event.senderRef,
        senderRole: event.senderRole,
        text: event.text,
        attachments: event.attachments,
        providerTimestamp: event.providerTimestamp,
        receivedAt: clock ? clock() : '1970-01-01T00:00:00.000Z',
        verificationState: event.verificationState,
        handoffState: event.handoffState,
        correlationId,
      }, { hashFunction });

      const scopedMeta = {
        tenantId: envelope.tenantId,
        integrationId: envelope.integrationId,
        provider: envelope.provider,
        channel: envelope.channel,
        direction: envelope.direction,
        verificationState: envelope.verificationState,
        idempotencyKey: envelope.idempotencyKey,
        correlationId,
      };

      // 7. Idempotency reservation (BEFORE any tool/AI execution).
      const reservation = idempotencyStore.reserve(envelope.idempotencyKey);
      if (reservation.result === 'DUPLICATE') {
        return finalize('DUPLICATE', correlationId, Object.assign({ safeErrorCode: ref.SAFE_ERROR_CODES.IDEMPOTENCY_DUPLICATE }, scopedMeta));
      }

      // 8. Loop guard (defense in depth).
      const loop = ref.evaluateLoopGuard({
        direction: envelope.direction,
        senderRole: envelope.senderRole,
        ownBotIdentity: event.ownBotIdentity,
        messageSource: event.messageSource,
        outboundCorrelationId: event.outboundCorrelationId,
        outboundIdempotencyKey: event.outboundIdempotencyKey,
        knownOutboundIdempotencyKey: event.knownOutboundIdempotencyKey,
        eventAllowlistResult: event.eventAllowlistResult,
      });
      if (!loop.aiAllowed) {
        idempotencyStore.complete(envelope.idempotencyKey);
        return finalize('COMPLETED', correlationId, Object.assign({ loopGuardResult: loop.result, safeErrorCode: loop.safeErrorCode, aiInvocations: 0, toolInvocations: 0 }, scopedMeta));
      }

      // 9. Handoff gate (HUMAN_ACTIVE blocks AI outbound).
      const convRef = envelope.externalConversationRef || 'conv-unknown';
      const handoffState = handoffStore ? handoffStore.getState(convRef).state : (event.handoffState || 'BOT_ACTIVE');
      const gate = ref.evaluateHandoffGate(handoffState);
      if (!gate.aiAllowed) {
        idempotencyStore.complete(envelope.idempotencyKey);
        return finalize('HANDOFF_BLOCKED', correlationId, Object.assign({ handoffState, safeErrorCode: gate.safeErrorCode, aiInvocations: 0, toolInvocations: 0 }, scopedMeta));
      }

      // 10. Fake AI / tool processing (only after all gates allow).
      if (aiPort) aiPort.invoke(scopedMeta);
      if (toolPort) toolPort.invoke(scopedMeta);

      // 11. Completion.
      idempotencyStore.complete(envelope.idempotencyKey);

      // 12. Safe audit.
      return finalize('COMPLETED', correlationId, Object.assign({
        loopGuardResult: loop.result,
        handoffState,
        aiInvocations: (aiPort ? aiPort.count : 0) - aiBefore,
        toolInvocations: (toolPort ? toolPort.count : 0) - toolBefore,
      }, scopedMeta));
    } catch (e) {
      const code = (e && e.code) ? e.code : ref.SAFE_ERROR_CODES.INTERNAL_ERROR;
      return finalize('REJECTED', correlationId, { safeErrorCode: code });
    }
  }

  return { process };
}

module.exports = {
  createInMemoryIntegrationIdentityStore,
  createInMemoryIntegrationResolver,
  createInMemoryIdempotencyStore,
  createInMemoryHandoffStore,
  createFakeAiPort,
  createFakeToolPort,
  createSafeAuditCollector,
  createOfflineOmniPipeline,
  HANDOFF_TRANSITIONS,
};
