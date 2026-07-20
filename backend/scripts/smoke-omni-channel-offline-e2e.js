#!/usr/bin/env node
'use strict';

// OMNI-CHANNEL-OFFLINE-E2E-DESIGN-01 — Deterministic mock-only smoke matrix.
//
// Proves contract invariants over synthetic data. NO PrismaClient, NO DATABASE_URL,
// NO environment read, NO network, NO filesystem write, NO ../src import,
// NO real LLM, NO real tool execution.

const ref = require('./omni-channel-canonical-reference');
const fx = require('./omni-channel-offline-fixtures');
const hz = require('./omni-channel-offline-harness');

let checks = 0;
const failures = [];
function check(name, cond) {
  checks += 1;
  if (!cond) failures.push(name);
}
function expectCode(fn, code, name) {
  checks += 1;
  try { fn(); failures.push(name + ' (no throw)'); }
  catch (e) { if (!e || e.code !== code) failures.push(name + ' (got ' + (e && e.code) + ')'); }
}

// Build a fully-wired, deterministic world.
function buildWorld(registerList) {
  const fixtures = fx.createOfflineFixtures({});
  const identityStore = hz.createInMemoryIntegrationIdentityStore({});
  const integrationsById = new Map();
  const tenantsById = new Map();
  const { tenantA, tenantB, tenantDisabled } = fixtures.tenants;
  [tenantA, tenantB, tenantDisabled].forEach((t) => tenantsById.set(t.id, t));
  const all = fixtures.integrations;
  const toRegister = registerList || [all.integrationA, all.integrationB, all.integrationDistinct, all.integrationFacebook];
  toRegister.forEach((it) => {
    integrationsById.set(it.id, it);
    identityStore.register(it);
  });
  const resolver = hz.createInMemoryIntegrationResolver({ identityStore, integrationsById, tenantsById });
  const idempotencyStore = hz.createInMemoryIdempotencyStore();
  const handoffStore = hz.createInMemoryHandoffStore();
  const aiPort = hz.createFakeAiPort();
  const toolPort = hz.createFakeToolPort();
  const audit = hz.createSafeAuditCollector();
  const pipeline = hz.createOfflineOmniPipeline({
    resolver, idempotencyStore, handoffStore, aiPort, toolPort, audit,
    clock: fixtures.clock, idFactory: fixtures.idFactory,
  });
  return { fixtures, identityStore, integrationsById, tenantsById, resolver, idempotencyStore, handoffStore, aiPort, toolPort, audit, pipeline };
}

function makeValidEnvelopeObject(overrides) {
  return Object.assign({
    schemaVersion: ref.CANONICAL_SCHEMA_VERSION,
    provider: 'facebook',
    channel: 'facebook',
    integrationId: 'integration-A-0001',
    tenantId: 'tenant-A-0001',
    direction: 'inbound',
    messageType: 'text',
    senderRole: 'customer',
    verificationState: 'VERIFIED',
    idempotencyKey: 'k-sanitized',
    attachments: [],
  }, overrides || {});
}

// ============================ A. Canonical contract ============================
(function A() {
  const w = buildWorld();
  const fbEvent = w.fixtures.events.facebookInboundEvent();
  const r1 = w.pipeline.process(fbEvent);
  check('1. Facebook sanitized event -> valid envelope (COMPLETED)', r1.finalState === 'COMPLETED' && r1.aiInvocations === 1);

  const cwEvent = w.fixtures.events.chatwootConceptualEvent();
  const r2 = w.pipeline.process(cwEvent);
  check('2. Chatwoot conceptual normalized event -> valid envelope (COMPLETED)', r2.finalState === 'COMPLETED' && r2.aiInvocations === 1);

  expectCode(() => ref.validateCanonicalEnvelope(makeValidEnvelopeObject({ schemaVersion: 'wrong.v0' })),
    ref.SAFE_ERROR_CODES.CANONICAL_SCHEMA_MISMATCH, '3. schemaVersion mismatch rejected');

  expectCode(() => ref.validateCanonicalEnvelope(makeValidEnvelopeObject({ providerTenantId: 'tenant-EVIL' })),
    ref.SAFE_ERROR_CODES.AUTHZ_DENIED, '4. provider tenantId injection rejected');

  expectCode(() => ref.validateCanonicalEnvelope(makeValidEnvelopeObject({ apiToken: 'FAKE' })),
    ref.SAFE_ERROR_CODES.CANONICAL_SECRET_FIELD_FORBIDDEN, '5. secret-like field rejected');

  expectCode(() => ref.validateCanonicalEnvelope(makeValidEnvelopeObject({ rawPayload: { a: 1 } })),
    ref.SAFE_ERROR_CODES.CANONICAL_SECRET_FIELD_FORBIDDEN, '6. raw payload field rejected');

  const built = ref.buildCanonicalEnvelope({
    provider: 'facebook', channel: 'facebook', integrationId: 'i', tenantId: 't',
    providerEventRef: 'e1', externalMessageRef: 'm1', eventType: 'message', direction: 'inbound',
    messageType: 'text', senderRole: 'customer', verificationState: 'VERIFIED',
    receivedAt: '2026-01-01T00:00:00.000Z', correlationId: 'c1',
  });
  let mutated = false;
  try { built.tenantId = 'x'; } catch (_) { /* strict throw */ }
  if (built.tenantId !== 't') mutated = true;
  check('7. Envelope immutable after build', Object.isFrozen(built) && !mutated);
})();

// ========================= B. Identity normalization ==========================
(function B() {
  check('8. Numeric Inbox ID accepted', ref.normalizeExternalNumericId(1, 'inboxes') === '1' && ref.normalizeExternalNumericId('7', 'inboxes') === '7');
  check('9. Exact /inboxes/<id> accepted', ref.normalizeExternalNumericId('https://sanitized.invalid/app/accounts/1/settings/inboxes/9', 'inboxes') === '9');
  expectCode(() => ref.normalizeExternalNumericId('https://sanitized.invalid/random/looking/path/42', 'inboxes'),
    ref.SAFE_ERROR_CODES.IDENTITY_INVALID, '10. arbitrary trailing-number URL rejected');
  expectCode(() => ref.normalizeExternalNumericId('https://sanitized.invalid/app/accounts/1/settings/teams/1/edit', 'inboxes'),
    ref.SAFE_ERROR_CODES.IDENTITY_INVALID, '11. Team URL used as Inbox ID rejected');

  // 12 + 13: same global external identity cannot be registered for two tenants.
  const w = buildWorld([]);
  w.identityStore.register(w.fixtures.integrations.integrationA); // tenant A
  expectCode(() => w.identityStore.register(w.fixtures.integrations.integrationAmbiguous),
    ref.SAFE_ERROR_CODES.INTEGRATION_AMBIGUOUS, '12. duplicate global external identity rejected');
  check('13. Same external identity cannot map Tenant A and Tenant B', w.identityStore.lookup(w.identityStore.keyOf(w.fixtures.integrations.integrationA)).count === 1);
})();

// ============================== C. Tenant resolver ============================
(function C() {
  const w = buildWorld();
  const all = w.fixtures.integrations;
  const okId = { provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '1' };
  const resolved = w.resolver.resolve(okId);
  check('14. Exact enabled integration resolves', resolved.integrationId === all.integrationA.id && resolved.tenantId === 'tenant-A-0001');

  expectCode(() => w.resolver.resolve({ provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '999' }),
    ref.SAFE_ERROR_CODES.INTEGRATION_NOT_FOUND, '15. integration missing fail-closed');

  expectCode(() => w.resolver.resolve({ provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '2' }),
    ref.SAFE_ERROR_CODES.INTEGRATION_DISABLED, '16. disabled integration fail-closed');

  // 17: corrupted store with two enabled bindings for same identity -> AMBIGUOUS.
  const w2 = buildWorld([]);
  w2.identityStore.forceRegisterForAmbiguityTest(w2.fixtures.integrations.integrationA);
  w2.identityStore.forceRegisterForAmbiguityTest(w2.fixtures.integrations.integrationAmbiguous);
  w2.integrationsById.set(w2.fixtures.integrations.integrationA.id, w2.fixtures.integrations.integrationA);
  w2.integrationsById.set(w2.fixtures.integrations.integrationAmbiguous.id, w2.fixtures.integrations.integrationAmbiguous);
  expectCode(() => w2.resolver.resolve({ provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '1' }),
    ref.SAFE_ERROR_CODES.INTEGRATION_AMBIGUOUS, '17. ambiguous integration fail-closed');

  // 18: tenant record missing.
  const w3 = buildWorld([]);
  const orphan = Object.assign({}, w3.fixtures.integrations.integrationA, { id: 'integration-ORPH', tenantId: 'tenant-MISSING' });
  w3.integrationsById.set(orphan.id, orphan);
  w3.identityStore.register(orphan);
  expectCode(() => w3.resolver.resolve({ provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '1' }),
    ref.SAFE_ERROR_CODES.TENANT_NOT_FOUND, '18. tenant missing fail-closed');

  // 19: tenant disabled.
  const w4 = buildWorld([]);
  const disabledInt = Object.assign({}, w4.fixtures.integrations.integrationA, { id: 'integration-DIS', tenantId: 'tenant-D-0003' });
  w4.integrationsById.set(disabledInt.id, disabledInt);
  w4.identityStore.register(disabledInt);
  expectCode(() => w4.resolver.resolve({ provider: 'chatwoot', deploymentKey: fx.SANITIZED_DEPLOYMENT, externalAccountId: '1', externalInboxId: '1' }),
    ref.SAFE_ERROR_CODES.TENANT_DISABLED, '19. tenant disabled fail-closed');
})();

// ================================ D. Idempotency ==============================
(function D() {
  const w = buildWorld();
  const ev = w.fixtures.events.chatwootConceptualEvent({ providerEventRef: 'cw-evt-D20', externalMessageRef: 'cw-msg-D20', externalConversationRef: 'cw-conv-D20' });
  const first = w.pipeline.process(ev);
  const aiAfterFirst = w.aiPort.count;
  const toolAfterFirst = w.toolPort.count;
  check('20. First reservation -> RESERVED_NEW (COMPLETED)', first.finalState === 'COMPLETED');
  const second = w.pipeline.process(ev);
  check('21. Second same key -> DUPLICATE', second.finalState === 'DUPLICATE' && second.safeErrorCode === ref.SAFE_ERROR_CODES.IDEMPOTENCY_DUPLICATE);
  check('22. Duplicate causes zero additional AI invocation', w.aiPort.count === aiAfterFirst);
  check('23. Duplicate causes zero additional tool invocation', w.toolPort.count === toolAfterFirst);

  // 24: same provider event under a DISTINCT integration must not collide.
  const evInboxA = w.fixtures.events.chatwootConceptualEvent({ externalInboxId: '1', providerEventRef: 'cw-evt-SHARED', externalMessageRef: 'cw-msg-SHARED', externalConversationRef: 'cw-conv-24A' });
  const evInboxC = w.fixtures.events.chatwootConceptualEvent({ externalInboxId: '3', providerEventRef: 'cw-evt-SHARED', externalMessageRef: 'cw-msg-SHARED', externalConversationRef: 'cw-conv-24C' });
  const rA = w.pipeline.process(evInboxA);
  const rC = w.pipeline.process(evInboxC);
  check('24. Same provider event under distinct integration does not collide', rA.finalState === 'COMPLETED' && rC.finalState === 'COMPLETED' && rA.idempotencyKey !== rC.idempotencyKey);

  // 25: missing trustworthy event identity fails closed.
  const rMissing = w.pipeline.process(w.fixtures.security.missingEventIdentity);
  check('25. Missing trustworthy event identity fails closed', rMissing.finalState === 'REJECTED' && rMissing.safeErrorCode === ref.SAFE_ERROR_CODES.EVENT_IDENTITY_UNAVAILABLE);

  // 26: two concurrent reservations -> one modeled winner.
  const key = 'idem-key-26';
  const a = w.idempotencyStore.reserve(key);
  const b = w.idempotencyStore.reserve(key);
  const winners = [a, b].filter((x) => x.result === 'RESERVED_NEW').length;
  const dups = [a, b].filter((x) => x.result === 'DUPLICATE').length;
  check('26. Two concurrent reservations produce one modeled winner', winners === 1 && dups === 1);

  // 27: retryable state does not create a second logical event.
  const key27 = 'idem-key-27';
  w.idempotencyStore.reserve(key27);
  const sizeBefore = w.idempotencyStore.size();
  w.idempotencyStore.failRetryable(key27);
  const rec = w.idempotencyStore.inspect(key27);
  const reReserve = w.idempotencyStore.reserve(key27);
  check('27. Retryable state does not create a second logical event', w.idempotencyStore.size() === sizeBefore && rec.attemptCount === 2 && rec.processingState === 'FAILED_RETRYABLE' && reReserve.result === 'DUPLICATE');
})();

// ================================ E. Loop guard ===============================
(function E() {
  const outbound = ref.evaluateLoopGuard({ direction: 'outbound', senderRole: 'bot' });
  check('28. Outbound direction blocked', outbound.result === 'OUTBOUND_LOOP_BLOCKED' && outbound.aiAllowed === false);
  const botSender = ref.evaluateLoopGuard({ direction: 'inbound', senderRole: 'bot' });
  check('29. Bot sender callback blocked', botSender.result === 'BOT_OR_AGENT_CALLBACK_BLOCKED' && botSender.aiAllowed === false);
  const ownBot = ref.evaluateLoopGuard({ direction: 'inbound', senderRole: 'customer', ownBotIdentity: 'bot-1', messageSource: 'bot-1' });
  check('30. Own bot identity blocked', ownBot.result === 'BOT_OR_AGENT_CALLBACK_BLOCKED' && ownBot.aiAllowed === false);
  const echo = ref.evaluateLoopGuard({ direction: 'inbound', senderRole: 'customer', outboundCorrelationId: 'out-1' });
  check('31. Outbound correlation echo blocked', echo.result === 'DUPLICATE_OUTBOUND_CALLBACK' && echo.aiAllowed === false);
  const dupCb = ref.evaluateLoopGuard({ direction: 'inbound', senderRole: 'customer', outboundIdempotencyKey: 'ok-1', knownOutboundIdempotencyKey: true });
  check('32. Duplicate outbound callback blocked', dupCb.result === 'DUPLICATE_OUTBOUND_CALLBACK' && dupCb.aiAllowed === false);
  const unknown = ref.evaluateLoopGuard({ direction: 'sideways', senderRole: 'customer' });
  check('33. Unknown direction produces no AI', unknown.result === 'UNKNOWN_DIRECTION_BLOCKED' && unknown.aiAllowed === false);

  // Pipeline-level proof: bot callback event -> zero AI (BOT_REPLY_WEBHOOK_DOES_NOT_CREATE_NEW_AI_REPLY).
  const w = buildWorld();
  const before = w.aiPort.count;
  const r = w.pipeline.process(w.fixtures.security.botCallback);
  check('28b. Bot callback via pipeline creates no new AI reply', r.aiInvocations === 0 && w.aiPort.count === before);
})();

// ================================== F. Handoff ================================
(function F() {
  check('34. BOT_ACTIVE permits fake AI', ref.evaluateHandoffGate('BOT_ACTIVE').aiAllowed === true);
  check('35. HUMAN_ACTIVE blocks AI', ref.evaluateHandoffGate('HUMAN_ACTIVE').aiAllowed === false);
  check('36. BOT_PAUSED blocks AI', ref.evaluateHandoffGate('BOT_PAUSED').aiAllowed === false);
  check('37. BOT_RESUME_PENDING blocks AI', ref.evaluateHandoffGate('BOT_RESUME_PENDING').aiAllowed === false);

  // Pipeline: seeded HUMAN_ACTIVE conversation blocks AI.
  const w = buildWorld();
  w.handoffStore.seed('cw-conv-HUMAN', 'HUMAN_ACTIVE', 1);
  const ev = w.fixtures.events.chatwootConceptualEvent({ externalConversationRef: 'cw-conv-HUMAN', providerEventRef: 'cw-evt-HUMAN', externalMessageRef: 'cw-msg-HUMAN' });
  const before = w.aiPort.count;
  const r = w.pipeline.process(ev);
  check('35b. HUMAN_ACTIVE via pipeline -> HANDOFF_BLOCKED, zero AI', r.finalState === 'HANDOFF_BLOCKED' && r.aiInvocations === 0 && w.aiPort.count === before);

  // 38: version conflict rejected.
  const w2 = buildWorld();
  w2.handoffStore.seed('conv-38', 'HUMAN_ACTIVE', 5);
  expectCode(() => w2.handoffStore.applyTransition('conv-38', { to: 'BOT_PAUSED', expectedVersion: 1 }),
    ref.SAFE_ERROR_CODES.VERSION_CONFLICT, '38. version conflict rejected');

  // 39: audited resume enables AI only after a valid transition.
  const w3 = buildWorld();
  w3.handoffStore.seed('conv-39', 'BOT_RESUME_PENDING', 3);
  const blockedBefore = ref.evaluateHandoffGate(w3.handoffStore.getState('conv-39').state).aiAllowed;
  const t = w3.handoffStore.applyTransition('conv-39', { to: 'BOT_ACTIVE', expectedVersion: 3, actor: 'staff' });
  const allowedAfter = ref.evaluateHandoffGate(t.state).aiAllowed;
  check('39. Audited resume enables AI only after valid transition', blockedBefore === false && allowedAfter === true && t.version === 4);
})();

// =========================== G. Provider isolation ============================
(function G() {
  // 40: simulated Chatwoot outage does not break Facebook fixture.
  const w = buildWorld();
  const outage = w.pipeline.process({ provider: 'chatwoot', verificationState: 'VERIFIED', simulateOutage: true, direction: 'inbound', eventType: 'message', senderRole: 'customer' });
  const fbOk = w.pipeline.process(w.fixtures.events.facebookInboundEvent({ providerEventRef: 'fb-evt-40', externalMessageRef: 'fb-msg-40', externalConversationRef: 'fb-conv-40' }));
  check('40. Simulated Chatwoot failure does not break Facebook fixture', outage.finalState === 'FAILED_RETRYABLE' && fbOk.finalState === 'COMPLETED');

  // 41: Facebook path is independent — resolves with ONLY the facebook integration registered.
  const fbOnly = buildWorld([]);
  fbOnly.integrationsById.set(fbOnly.fixtures.integrations.integrationFacebook.id, fbOnly.fixtures.integrations.integrationFacebook);
  fbOnly.identityStore.register(fbOnly.fixtures.integrations.integrationFacebook);
  const rFb = fbOnly.pipeline.process(fbOnly.fixtures.events.facebookInboundEvent({ providerEventRef: 'fb-evt-41', externalMessageRef: 'fb-msg-41' }));
  check('41. Facebook fixture does not depend on Chatwoot module/integration', rFb.finalState === 'COMPLETED');

  // 42: unknown provider rejected without affecting known providers.
  const rUnknown = w.pipeline.process(w.fixtures.security.unknownProviderEvent);
  const rKnownAfter = w.pipeline.process(w.fixtures.events.facebookInboundEvent({ providerEventRef: 'fb-evt-42', externalMessageRef: 'fb-msg-42', externalConversationRef: 'fb-conv-42' }));
  check('42. Unknown provider rejected without affecting known providers', rUnknown.finalState === 'REJECTED' && rUnknown.safeErrorCode === ref.SAFE_ERROR_CODES.PROVIDER_UNKNOWN && rKnownAfter.finalState === 'COMPLETED');
})();

// =========================== H. Logging and audit =============================
(function H() {
  const w = buildWorld();
  w.pipeline.process(w.fixtures.events.chatwootConceptualEvent({ providerEventRef: 'cw-evt-H', externalMessageRef: 'cw-msg-H', externalConversationRef: 'cw-conv-H', text: 'SENSITIVE-CUSTOMER-TEXT' }));
  const events = w.audit.events;
  const serialized = JSON.stringify(events);
  check('43. Audit contains no fake secret value', serialized.indexOf('apiToken') === -1 && serialized.indexOf('FAKE-NOT-A-REAL-SECRET') === -1 && serialized.toLowerCase().indexOf('secret') === -1);
  check('44. Audit contains no raw message text', serialized.indexOf('SENSITIVE-CUSTOMER-TEXT') === -1 && events.every((e) => !('text' in e)));
  const last = events[events.length - 1];
  check('45. Safe error code family is stable', typeof last.result === 'string' && Object.values(ref.SAFE_ERROR_CODES).indexOf('IDEMPOTENCY_DUPLICATE') !== -1);
  check('46. Correlation ID propagates', typeof last.correlationId === 'string' && last.correlationId.length > 0);
  check('47. Tenant/integration evidence remains scoped', last.tenantId === 'tenant-A-0001' && last.integrationId === 'integration-A-0001');

  // Extra: sanitizeOmniLogMeta drops non-allowlisted + secret-like keys.
  const sanitized = ref.sanitizeOmniLogMeta({ tenantId: 't', apiToken: 'x', text: 'y', accessToken: 'z', result: 'COMPLETED' });
  check('47b. sanitizeOmniLogMeta drops secret/text keys', sanitized.tenantId === 't' && sanitized.result === 'COMPLETED' && !('apiToken' in sanitized) && !('text' in sanitized) && !('accessToken' in sanitized));
})();

// =============================== Result output ================================
if (failures.length > 0) {
  console.error('smoke:omni-channel-offline-e2e: FAIL (' + failures.length + ' of ' + checks + ')');
  failures.forEach((f) => console.error('  >>> FAIL: ' + f));
  process.exit(1);
}
console.log('smoke:omni-channel-offline-e2e: MOCK_PASS (' + checks + ' checks)');
console.log('scenarios=47 · SINGLE_PROCESS_ATOMICITY_MODEL_ONLY · NOT_REAL_DISTRIBUTED_DURABILITY_PROOF');
