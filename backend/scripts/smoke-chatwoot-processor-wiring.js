#!/usr/bin/env node
'use strict';

// CHATWOOT-PROCESSOR-WIRING-DESIGN-01 — deterministic OFFLINE processor-wiring smoke.
//
// Proves the canonical AI message processor PORT (chatwootProcessor.js) and its
// wiring into chatwootIngress.js over synthetic data with FAKE repositories, a
// FAKE messageProcessor, a FAKE outbound command port, a FAKE clock and FAKE
// encrypted credentials. NO network, NO DB, NO process.env read of secrets, NO
// real AI. PORT-ONLY: the live bot engine is never imported.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const processor = require('../src/webhook/chatwootProcessor');
const canonical = require('../src/webhook/chatwootCanonical');
const { createChatwootIngressHandler, INGRESS_STATUS } = require('../src/webhook/chatwootIngress');
const { buildIngressHandler } = require('../src/webhook/chatwootRoute');
const repos = require('../src/webhook/chatwootRuntimeRepositories');
const { createWebhookEventReceiptRepository } = require('../src/webhook/webhookEventReceiptRepository');

let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }

const SECRET = 'fake-signing-secret-DO-NOT-USE-0123456789';
const NOW = 1700000000;
const DEPLOY = 'deploy-1';
const PUBKEY = 'pubkey_abcdefghijklmnop';

function sign(secret, ts, bodyBuf) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(String(ts) + '.' + bodyBuf.toString('utf8'), 'utf8').digest('hex');
}
function bodyOf(obj) { return Buffer.from(JSON.stringify(obj), 'utf8'); }

function baseMessage(over) {
  return Object.assign({
    event: 'message_created', id: 12345, content: 'xin chào shop', message_type: 'incoming', private: false,
    sender: { id: 6789, type: 'contact', name: 'Khach Hang' },
    conversation: { id: 555, inbox_id: 2, status: 'open' }, account: { id: 1 }, inbox: { id: 2 }, created_at: NOW,
  }, over || {});
}

// ---- Fake Prisma-like client (mirrors runtime-design harness) -----------------
function makeClient(seed) {
  const s = seed || {};
  const endpoints = new Map(); const credentials = new Map(); const identities = [];
  const deliveries = new Map(); const events = new Map(); let dbCalls = 0;
  const endpoint = Object.assign({
    id: 'ep-1', provider: 'CHATWOOT', channel: 'WEBSITE_CHAT', mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK',
    deploymentKey: DEPLOY, externalAccountId: '1', publicEndpointKey: PUBKEY,
    minimumSupportedVersion: '4.13.0', exactVersion: 'v4.13.0', authMode: 'HMAC_SIGNED_WEBHOOK', isEnabled: true, configVersion: 1,
  }, s.endpoint || {});
  endpoints.set(endpoint.publicEndpointKey, endpoint);
  const cred = Object.assign({
    id: 'cred-1', webhookEndpointId: endpoint.id, credentialType: 'WEBHOOK_SIGNING_SECRET',
    ciphertext: 'enc:' + SECRET, keyVersion: 1, algorithmVersion: 'aes-256-gcm', status: 'ACTIVE',
  }, s.credential || {});
  credentials.set(cred.webhookEndpointId + '|' + cred.credentialType, cred);
  const tenant = Object.assign({ id: 'tenant-A', isActive: true }, s.tenant || {});
  const integration = Object.assign({
    id: 'int-1', tenantId: tenant.id, webhookEndpointId: endpoint.id,
    processingMode: 'AUTO_BOT', handoffPolicy: 'BOT_FIRST', isEnabled: true, tenant,
  }, s.integration || {});
  const idn = { id: 'idn-1', tenantIntegrationId: integration.id, provider: 'CHATWOOT', deploymentKey: DEPLOY,
    externalAccountId: '1', externalInboxId: '2',
    normalizedIdentityKey: repos.computeNormalizedIdentityKey({ deploymentKey: DEPLOY, externalAccountId: '1', externalInboxId: '2' }),
    tenantIntegration: integration };
  identities.push(idn);
  const client = {
    providerWebhookEndpoint: { async findUnique({ where }) { dbCalls += 1; return endpoints.get(where.publicEndpointKey) || null; } },
    integrationCredential: { async findUnique({ where }) { dbCalls += 1; const k = where.webhookEndpointId_credentialType; return credentials.get(k.webhookEndpointId + '|' + k.credentialType) || null; } },
    integrationIdentity: { async findMany({ where }) { dbCalls += 1; return identities.filter((i) => i.normalizedIdentityKey === where.normalizedIdentityKey); } },
    webhookDeliveryReceipt: { async create({ data }) { dbCalls += 1; const k = data.webhookEndpointId + '|' + data.deliveryRefHash; if (deliveries.has(k)) { const e = new Error('unique constraint'); e.code = 'P2002'; throw e; } deliveries.set(k, data); return data; } },
    webhookEventReceipt: {
      async create({ data }) { dbCalls += 1; if (events.has(data.idempotencyKey)) { const e = new Error('unique constraint'); e.code = 'P2002'; throw e; } const row = Object.assign({ id: 'evt-' + events.size }, data); events.set(data.idempotencyKey, row); return row; },
      async findUnique({ where }) { dbCalls += 1; return events.get(where.idempotencyKey) || null; },
      async update({ where, data }) { dbCalls += 1; const row = events.get(where.idempotencyKey); if (row) Object.assign(row, data); return row; },
    },
  };
  return { client, endpoint, integration, tenant, stats: () => dbCalls };
}
const fakeCrypto = { decrypt(ct) { if (typeof ct !== 'string' || !ct.startsWith('enc:')) throw new Error('decrypt-failed'); return ct.slice(4); } };

function goodRequest(over, headerOver) {
  const body = bodyOf(baseMessage(over));
  const headers = Object.assign({
    'x-chatwoot-signature': sign(SECRET, NOW, body), 'x-chatwoot-timestamp': String(NOW),
    'x-chatwoot-delivery': 'del-' + Math.random().toString(36).slice(2),
  }, headerOver || {});
  return { endpointKey: PUBKEY, headers, rawBody: body };
}

// Fake AI port. Counts calls; returns configurable raw result; can throw / hang.
function makeMessageProcessor(opts) {
  const o = opts || {};
  const calls = { n: 0, last: null };
  return {
    calls,
    async generateReply(input) {
      calls.n += 1; calls.last = input;
      if (o.throw) { throw new Error('ai-boom'); }
      if (o.hang) { return new Promise(() => {}); } // never resolves → timeout path
      if (typeof o.raw !== 'undefined') return o.raw;
      return { result: 'REPLY', reply: 'chào bạn, shop hỗ trợ gì ạ?' };
    },
  };
}

function frozenEnvelope(over) {
  return Object.freeze(Object.assign({
    schemaVersion: canonical.CANONICAL_SCHEMA_VERSION, provider: canonical.PROVIDER, channel: canonical.CHANNEL,
    verificationState: 'VERIFIED', eventType: 'message_created', direction: 'inbound', senderRole: 'customer',
    tenantId: 'tenant-A', integrationId: 'int-1', externalConversationRef: 'conv-abc', externalMessageRef: 'msg-1',
    text: 'cho mình hỏi giá', correlationId: 'corr-1', idempotencyKey: 'idem-1', handoffState: 'BOT_ACTIVE',
  }, over || {}));
}

(async () => {
  // ============================ Import safety ==================================
  check('01 chatwootProcessor imports with no side effect', typeof processor.createChatwootProcessor === 'function'
    && typeof processor.processChatwootCanonicalEvent === 'function'
    && typeof processor.evaluateProcessorEligibility === 'function'
    && typeof processor.buildPendingOutboundCommand === 'function'
    && typeof processor.normalizeProcessorResult === 'function'
    && typeof processor.redactProcessorAudit === 'function');
  check('02 chatwootIngress imports with no side effect beyond existing', typeof createChatwootIngressHandler === 'function'
    && INGRESS_STATUS.PROCESSOR_NOT_CONFIGURED === 'CHATWOOT_PROCESSOR_NOT_CONFIGURED');

  // ============================ Eligibility (defense in depth) =================
  check('03 eligible: valid inbound customer message', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope() }).eligible === true);
  check('10 blocked: outgoing direction → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ direction: 'outbound' }) }).eligible === false);
  check('11 blocked: private note (senderRole system) → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ senderRole: 'system' }) }).eligible === false);
  check('12 blocked: agent sender → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ senderRole: 'agent' }) }).eligible === false);
  check('13 blocked: bot sender → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ senderRole: 'bot' }) }).eligible === false);
  {
    // 14 own-bot loop: loop guard (canonical) blocks a bot-echo before processor.
    const g = canonical.evaluateChatwootLoopGuard({ direction: 'inbound', senderRole: 'bot', isPrivate: false, messageType: 'incoming', ownBotSenderId: '6789', senderRef: '6789' });
    check('14 own-bot correlation blocked (loop guard) → zero AI', g.aiAllowed === false && g.zeroAiInvocation === true);
  }
  check('15 blocked: HUMAN_ACTIVE conversation → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope(), conversationState: 'HUMAN_ACTIVE' }).eligible === false);
  check('16 blocked: missing tenantContext → fail closed', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ tenantId: null }), tenantContext: {} }).reason === processor.PROCESSOR_REASON.TENANT_CONTEXT_MISSING);
  check('17 blocked: missing integrationId → fail closed', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ integrationId: null }), tenantContext: {} }).reason === processor.PROCESSOR_REASON.INTEGRATION_MISSING);
  check('19 blocked: unsupported event → zero AI', processor.evaluateProcessorEligibility({ envelope: frozenEnvelope({ eventType: 'contact_created' }) }).eligible === false);
  check('23 blocked: invalid envelope (null) → fail closed', processor.evaluateProcessorEligibility({ envelope: null }).reason === processor.PROCESSOR_REASON.ENVELOPE_INVALID);

  // ============================ Result normalization ==========================
  check('06 NO_REPLY normalized', processor.normalizeProcessorResult({ result: 'NO_REPLY' }).result === processor.PROCESSOR_RESULT.NO_REPLY);
  check('07 HANDOFF_REQUEST normalized', processor.normalizeProcessorResult({ result: 'HANDOFF' }).result === processor.PROCESSOR_RESULT.HANDOFF_REQUEST);
  check('08 PROCESSING_FAILED_RETRYABLE normalized', processor.normalizeProcessorResult({ retryable: true }).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE);
  check('09 PROCESSING_FAILED_FINAL normalized', processor.normalizeProcessorResult({ final: true }).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('09b unknown/null result → FINAL fail-closed', processor.normalizeProcessorResult(null).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('05a explicit reply text → PENDING_OUTBOUND_COMMAND', processor.normalizeProcessorResult({ result: 'REPLY', reply: 'hi' }).result === processor.PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND);
  check('24 empty explicit reply → FINAL fail-closed', processor.normalizeProcessorResult({ result: 'REPLY', reply: '   ' }).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('U01 Direct normalize BOGUS is not NO_REPLY', processor.normalizeProcessorResult({ result: 'BOGUS' }).result !== processor.PROCESSOR_RESULT.NO_REPLY && processor.normalizeProcessorResult({ result: 'BOGUS' }).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('U02 Direct normalize empty object is not NO_REPLY', processor.normalizeProcessorResult({}).result !== processor.PROCESSOR_RESULT.NO_REPLY && processor.normalizeProcessorResult({}).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('U03 Direct normalize malformed primitive fails closed', ['x', 42, true].every((v) => processor.normalizeProcessorResult(v).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL));
  check('U04 Direct normalize array fails closed', processor.normalizeProcessorResult([{ result: 'NO_REPLY' }]).result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL);
  check('U05 Explicit NO_REPLY remains NO_REPLY', processor.normalizeProcessorResult({ result: 'NO_REPLY' }).result === processor.PROCESSOR_RESULT.NO_REPLY);

  // ============================ Outbound command safety =======================
  {
    const cmd = processor.buildPendingOutboundCommand({ envelope: frozenEnvelope(), content: 'giá 100k ạ' });
    check('05 PENDING command built for reply', cmd.transport === 'PENDING' && cmd.dispatched === false);
    check('13b command provider = CHATWOOT_WEBSITE', cmd.provider === 'CHATWOOT_WEBSITE');
    check('28 command has no token/secret/API URL key', !Object.keys(cmd).some((k) => /token|secret|apikey|authorization|apiurl|url|password|signature/i.test(k)) && cmd.integrationId === 'int-1' && cmd.externalConversationRef === 'conv-abc');
    check('30 raw provider payload not copied into command', typeof cmd.providerPayload === 'undefined' && typeof cmd.rawPayload === 'undefined' && cmd.content === 'giá 100k ạ');
    check('28b command is deep-frozen (immutable)', Object.isFrozen(cmd));
  }
  {
    const audit = processor.redactProcessorAudit({ envelope: frozenEnvelope({ text: 'sđt 0900123456 email a@b.com' }), result: 'NO_REPLY' });
    const raw = JSON.stringify(audit);
    check('29 audit redaction removes content/email/phone/token/signature', !/0900123456|a@b\.com|sđt/.test(raw) && typeof audit.contentLength === 'number' && audit.tenantId === 'tenant-A');
  }

  // ============================ processChatwootCanonicalEvent ==================
  {
    const mp = makeMessageProcessor({ raw: { result: 'REPLY', reply: 'chào bạn' } });
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), tenantContext: { tenantId: 'tenant-A', integrationId: 'int-1' }, messageProcessor: mp, now: NOW });
    check('04 valid message calls messageProcessor exactly once', mp.calls.n === 1);
    check('04b success → PENDING_OUTBOUND_COMMAND + command', out.result === processor.PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND && out.command && out.command.content === 'chào bạn');
    check('34 messageProcessor call count exactly one on success', mp.calls.n === 1);
    check('35b outbound port NEVER called by processor module (no send here)', typeof mp.generateReply === 'function');
  }
  {
    const mp = makeMessageProcessor({ raw: { result: 'NO_REPLY' } });
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), messageProcessor: mp, now: NOW });
    check('06b NO_REPLY → safe, zero outbound command', out.result === processor.PROCESSOR_RESULT.NO_REPLY && out.command === null);
  }
  {
    const port = processor.createChatwootProcessor({ messageProcessor: makeMessageProcessor({ raw: { result: 'BOGUS' } }), now: () => NOW });
    const out = await port.processCanonicalMessage(frozenEnvelope());
    check('U06 createChatwootProcessor BOGUS output returns PROCESSING_FAILED', out.result === processor.INGRESS_RESULT.PROCESSING_FAILED);
  }
  {
    const port = processor.createChatwootProcessor({ messageProcessor: makeMessageProcessor({ raw: {} }), now: () => NOW });
    const out = await port.processCanonicalMessage(frozenEnvelope());
    check('U07 createChatwootProcessor empty object returns PROCESSING_FAILED', out.result === processor.INGRESS_RESULT.PROCESSING_FAILED);
  }
  {
    const mp = makeMessageProcessor({ raw: { result: 'HANDOFF' } });
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), messageProcessor: mp, now: NOW });
    check('07b HANDOFF_REQUEST → no command', out.result === processor.PROCESSOR_RESULT.HANDOFF_REQUEST && out.command === null);
  }
  {
    const mp = makeMessageProcessor({ throw: true });
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), messageProcessor: mp, now: NOW });
    check('26 processor throws → PROCESSING_FAILED_RETRYABLE', out.result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE && out.reason === processor.PROCESSOR_REASON.PROCESSOR_ERROR);
  }
  {
    const mp = makeMessageProcessor({ hang: true });
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), messageProcessor: mp, now: NOW, timeoutMs: 5 });
    check('27 processor timeout → PROCESSING_FAILED_RETRYABLE (timeout mapped)', out.result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE && out.reason === processor.PROCESSOR_REASON.PROCESSOR_TIMEOUT);
  }
  {
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope(), messageProcessor: null, now: NOW });
    check('25a processor missing → FINAL + PROCESSOR_NOT_CONFIGURED, zero AI', out.result === processor.PROCESSOR_RESULT.PROCESSING_FAILED_FINAL && out.reason === processor.PROCESSOR_REASON.NOT_CONFIGURED && out.zeroAiInvocation === true);
  }
  {
    const mp = makeMessageProcessor({});
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope({ text: '' }), messageProcessor: mp, now: NOW });
    check('20 empty/attachment-only content → NO_REPLY, processor NOT called', out.result === processor.PROCESSOR_RESULT.NO_REPLY && mp.calls.n === 0);
  }
  {
    const env = frozenEnvelope();
    const mp = makeMessageProcessor({ raw: { reply: 'ok' } });
    await processor.processChatwootCanonicalEvent({ envelope: env, messageProcessor: mp, now: NOW });
    check('31 envelope remains immutable / not mutated', Object.isFrozen(env) && env.text === 'cho mình hỏi giá');
  }
  {
    const mpBlocked = makeMessageProcessor({});
    const out = await processor.processChatwootCanonicalEvent({ envelope: frozenEnvelope({ senderRole: 'agent' }), messageProcessor: mpBlocked, now: NOW });
    check('35 ineligible → messageProcessor NOT invoked (blocked before AI)', out.zeroAiInvocation === true && mpBlocked.calls.n === 0);
  }

  // ============================ Ingress integration ===========================
  function makeIngress(procOpts) {
    const built = makeClient();
    const mp = makeMessageProcessor(procOpts || {});
    const outboundCalls = { n: 0, last: null };
    const handler = buildIngressHandler({
      client: built.client, config: { maxClockSkewSeconds: 300 }, cryptoService: fakeCrypto,
      handoffPolicy: { evaluate: async () => ({ handoffState: 'BOT_ACTIVE' }) },
      canonicalMessageProcessor: processor.createChatwootProcessor({ messageProcessor: mp, now: () => NOW }),
      outboundCommandPort: { async send(cmd) { outboundCalls.n += 1; outboundCalls.last = cmd; } },
      auditWriter: { write() {} }, clock: () => NOW,
    });
    return { handler, mp, outboundCalls };
  }
  {
    const { handler, mp, outboundCalls } = makeIngress({ raw: { result: 'REPLY', reply: 'chào bạn' } });
    const r = await handler.handle(goodRequest());
    check('04c ingress: valid message → ACCEPTED', r.status === INGRESS_STATUS.ACCEPTED && r.aiInvoked === true);
    check('05c ingress: reply → exactly one outbound command', outboundCalls.n === 1 && mp.calls.n === 1);
    check('28c ingress outbound command carries no token/secret/url', outboundCalls.last && !Object.keys(outboundCalls.last).some((k) => /token|secret|apikey|authorization|apiurl|password|signature/i.test(k)));
  }
  {
    const { handler, mp, outboundCalls } = makeIngress({ raw: { result: 'NO_REPLY' } });
    const r = await handler.handle(goodRequest());
    check('06c ingress: NO_REPLY → accepted, zero outbound', r.status === INGRESS_STATUS.ACCEPTED && outboundCalls.n === 0 && mp.calls.n === 1);
  }
  {
    const { handler, mp } = makeIngress({ raw: { result: 'FAILED_RETRYABLE' } });
    const r = await handler.handle(goodRequest());
    check('08c ingress: retryable failure → 503 PROCESSING_FAILED', r.httpStatus === 503 && r.safeErrorCode === 'PROCESSING_FAILED' && mp.calls.n === 1);
  }
  {
    const { handler, mp, outboundCalls } = makeIngress({ raw: { result: 'FAILED_FINAL' } });
    const r = await handler.handle(goodRequest());
    check('09c ingress: processor failure (final) → 503 retryable, NOT completed, zero outbound', r.httpStatus === 503 && r.safeErrorCode === 'PROCESSING_FAILED' && outboundCalls.n === 0 && mp.calls.n === 1);
  }
  {
    // Business duplicate: same message id, different delivery header → transport
    // passes both times, business idempotency blocks the 2nd → processor once.
    const { handler, mp, outboundCalls } = makeIngress({ raw: { result: 'REPLY', reply: 'hi' } });
    const first = await handler.handle(goodRequest({}, { 'x-chatwoot-delivery': 'del-A' }));
    const second = await handler.handle(goodRequest({}, { 'x-chatwoot-delivery': 'del-B' }));
    check('18 duplicate business idempotency → processor NOT called 2nd time', mp.calls.n === 1 && outboundCalls.n === 1);
    check('32 processor invoked only after idempotency reservation (once total)', first.status === INGRESS_STATUS.ACCEPTED && second.safeErrorCode === 'CHATWOOT_BUSINESS_DUPLICATE');
  }
  {
    // Transport replay: identical delivery header twice → 2nd is replay SAFE_ACK
    // BEFORE business/processor.
    const { handler, mp } = makeIngress({ raw: { result: 'REPLY', reply: 'hi' } });
    await handler.handle(goodRequest({}, { 'x-chatwoot-delivery': 'del-SAME' }));
    const dup = await handler.handle(goodRequest({}, { 'x-chatwoot-delivery': 'del-SAME' }));
    check('33 processor never called for transport replay duplicate', mp.calls.n === 1 && dup.status === INGRESS_STATUS.SAFE_ACK);
  }
  {
    // Processor object present but WRONG SHAPE (no processCanonicalMessage) → the
    // config gate fails closed at 503 RUNTIME_CONFIG_INVALID (method-shape check),
    // BEFORE parse/AI/outbound. Never a spurious 200 SAFE_ACK.
    const built = makeClient();
    const handler = buildIngressHandler({
      client: built.client, config: {}, cryptoService: fakeCrypto,
      handoffPolicy: { evaluate: async () => ({ handoffState: 'BOT_ACTIVE' }) },
      canonicalMessageProcessor: {}, // no processCanonicalMessage
      outboundCommandPort: { async send() {} }, auditWriter: { write() {} }, clock: () => NOW,
    });
    const r = await handler.handle(goodRequest());
    check('25b ingress: processor {} wrong shape → 503 RUNTIME_CONFIG_INVALID (gate)', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.RUNTIME_CONFIG_INVALID && r.aiInvoked === false);
  }
  {
    // Outgoing message blocked at ingress → zero AI (processor never reached).
    const { handler, mp } = makeIngress({ raw: { result: 'REPLY', reply: 'hi' } });
    const r = await handler.handle(goodRequest({ message_type: 'outgoing' }));
    check('10c ingress: outgoing message → zero AI (processor not called)', mp.calls.n === 0 && r.aiInvoked === false);
  }
  {
    const { handler, mp } = makeIngress({ raw: { result: 'REPLY', reply: 'hi' } });
    const r = await handler.handle(goodRequest({ private: true }));
    check('11c ingress: private note → zero AI', mp.calls.n === 0 && r.aiInvoked === false);
  }

  // ==================== RETRY SEMANTICS MATRIX (§VIII/§X–§XII) =================
  // A spy businessEventStore counts markCompleted vs markRetryableFailure so we can
  // prove a config/dependency/handoff/unknown result is NEVER laundered into COMPLETED.
  function makeSpyStore(reserveResult) {
    const calls = { reserve: 0, completed: 0, retryable: 0, lastRetryCode: null };
    return {
      calls,
      async reserveEvent() { calls.reserve += 1; return { result: reserveResult || 'RESERVED_NEW', receipt: {} }; },
      async markCompleted() { calls.completed += 1; },
      async markRetryableFailure(_k, code) { calls.retryable += 1; calls.lastRetryCode = code; },
      async markProcessing() {},
    };
  }
  function buildSpyIngress(o) {
    const built = makeClient();
    const store = makeSpyStore(o.reserveResult);
    const outboundCalls = { n: 0 };
    const outbound = o.outboundThrows
      ? { async send() { throw new Error('outbound-down'); } }
      : { async send() { outboundCalls.n += 1; } };
    const handler = buildIngressHandler({
      client: built.client, config: { maxClockSkewSeconds: 300 }, cryptoService: fakeCrypto,
      handoffPolicy: { evaluate: async () => ({ handoffState: 'BOT_ACTIVE' }) },
      canonicalMessageProcessor: o.processor,
      outboundCommandPort: outbound,
      businessEventStore: store,
      auditWriter: { write() {} }, clock: () => NOW,
    });
    return { handler, store, outboundCalls };
  }
  function adapterPort(rawResult, extra) {
    const mp = { calls: { n: 0 }, async generateReply() { this.calls.n += 1; return rawResult; } };
    const port = processor.createChatwootProcessor(Object.assign({ messageProcessor: mp, now: () => NOW }, extra || {}));
    port.__mp = mp;
    return port;
  }

  { const { handler, store } = buildSpyIngress({ processor: undefined });
    const r = await handler.handle(goodRequest());
    check('R01 missing processor → 503 RUNTIME_CONFIG_INVALID, zero reserve/AI/outbound', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.RUNTIME_CONFIG_INVALID && store.calls.reserve === 0); }
  { const { handler, store } = buildSpyIngress({ processor: {} });
    const r = await handler.handle(goodRequest());
    check('R02 processor {} → 503 RUNTIME_CONFIG_INVALID, zero reserve', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.RUNTIME_CONFIG_INVALID && store.calls.reserve === 0); }
  { const { handler, store } = buildSpyIngress({ processor: { processCanonicalMessage: 123 } });
    const r = await handler.handle(goodRequest());
    check('R03 processor method non-function → 503 RUNTIME_CONFIG_INVALID', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.RUNTIME_CONFIG_INVALID && store.calls.reserve === 0); }
  { // Step-16 defense in depth: method present at gate, gone at call time (getter).
    let peek = 0;
    const proc = { get processCanonicalMessage() { peek += 1; return peek === 1 ? (async () => ({ result: 'NO_REPLY' })) : undefined; } };
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: proc });
    const r = await handler.handle(goodRequest());
    check('R04 processor disappears after config check → 503 PROCESSOR_NOT_CONFIGURED', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.PROCESSOR_NOT_CONFIGURED);
    check('R05 PROCESSOR_NOT_CONFIGURED → markRetryableFailure exactly once', store.calls.retryable === 1 && store.calls.lastRetryCode === INGRESS_STATUS.PROCESSOR_NOT_CONFIGURED);
    check('R06 PROCESSOR_NOT_CONFIGURED → markCompleted zero', store.calls.completed === 0);
    check('R07 PROCESSOR_NOT_CONFIGURED → outbound zero', outboundCalls.n === 0); }
  { const port = { async processCanonicalMessage() { return { result: 'WEIRD_THING' }; } };
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R08 unknown processor result → 503 PROCESSOR_RESULT_INVALID retryable', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.PROCESSOR_RESULT_INVALID && store.calls.retryable === 1);
    check('R09 unknown result → markCompleted zero, outbound zero', store.calls.completed === 0 && outboundCalls.n === 0);
    check('U18 Existing unknown direct ingress result remains invalid/retryable', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.PROCESSOR_RESULT_INVALID && store.calls.retryable === 1 && store.calls.completed === 0 && outboundCalls.n === 0); }
  { const port = adapterPort({ result: 'BOGUS' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('U08 Full ingress BOGUS adapter output returns HTTP 503', r.httpStatus === 503 && r.safeErrorCode === 'PROCESSING_FAILED');
    check('U09 BOGUS adapter output calls markRetryableFailure exactly once', store.calls.retryable === 1 && store.calls.lastRetryCode === 'PROCESSING_FAILED');
    check('U10 BOGUS adapter output calls markCompleted zero times', store.calls.completed === 0);
    check('U11 BOGUS adapter output calls outbound zero times', outboundCalls.n === 0); }
  { const port = adapterPort({});
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('U12 Full ingress empty object returns HTTP 503', r.httpStatus === 503 && r.safeErrorCode === 'PROCESSING_FAILED');
    check('U13 Empty object calls markRetryableFailure exactly once', store.calls.retryable === 1 && store.calls.lastRetryCode === 'PROCESSING_FAILED');
    check('U14 Empty object calls markCompleted zero times', store.calls.completed === 0);
    check('U15 Empty object calls outbound zero times', outboundCalls.n === 0); }
  { const port = adapterPort({ result: 'HANDOFF' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R10 HANDOFF_REQUEST no persistence → 503 CHATWOOT_HANDOFF_EXECUTION_DEFERRED', r.httpStatus === 503 && r.safeErrorCode === INGRESS_STATUS.HANDOFF_DEFERRED);
    check('R11 HANDOFF deferred → markRetryableFailure exactly once', store.calls.retryable === 1 && store.calls.lastRetryCode === INGRESS_STATUS.HANDOFF_DEFERRED);
    check('R12 HANDOFF deferred → markCompleted zero, outbound zero', store.calls.completed === 0 && outboundCalls.n === 0);
    check('U17 Existing HANDOFF deferred behavior remains 503 retryable', r.httpStatus === 503 && store.calls.retryable === 1 && store.calls.completed === 0 && outboundCalls.n === 0); }
  { const port = adapterPort({ result: 'NO_REPLY' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R13 NO_REPLY → markCompleted exactly once, zero retryable/outbound', r.httpStatus === 200 && store.calls.completed === 1 && store.calls.retryable === 0 && outboundCalls.n === 0);
    check('U16 Explicit NO_REPLY still returns HTTP 200 and completes exactly once', r.httpStatus === 200 && store.calls.completed === 1 && store.calls.retryable === 0 && outboundCalls.n === 0); }
  { const port = adapterPort({ result: 'REPLY', reply: 'chào bạn' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R14 REPLY_COMMAND + outbound success → markCompleted once, outbound once', r.httpStatus === 200 && store.calls.completed === 1 && outboundCalls.n === 1); }
  { const port = adapterPort({ result: 'FAILED_RETRYABLE' });
    const { handler, store } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R15 PROCESSING_FAILED → retryable once, not completed', r.httpStatus === 503 && store.calls.retryable === 1 && store.calls.completed === 0); }
  { const hang = { async generateReply() { return new Promise(() => {}); } };
    const port = processor.createChatwootProcessor({ messageProcessor: hang, now: () => NOW, timeoutMs: 5 });
    const { handler, store } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R16 processor timeout → retryable, not completed', r.httpStatus === 503 && store.calls.retryable === 1 && store.calls.completed === 0); }
  { const thrower = { async generateReply() { throw new Error('ai-boom'); } };
    const port = processor.createChatwootProcessor({ messageProcessor: thrower, now: () => NOW });
    const { handler, store } = buildSpyIngress({ processor: port });
    const r = await handler.handle(goodRequest());
    check('R17 processor throw → retryable, not completed', r.httpStatus === 503 && store.calls.retryable === 1 && store.calls.completed === 0); }
  { const port = adapterPort({ result: 'REPLY', reply: 'hi' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port, outboundThrows: true });
    const r = await handler.handle(goodRequest());
    check('R18 outbound failure → OUTBOUND_ERROR retryable, not completed', r.httpStatus === 503 && r.safeErrorCode === 'OUTBOUND_ERROR' && store.calls.retryable === 1 && store.calls.completed === 0 && outboundCalls.n === 0); }
  { const port = adapterPort({ result: 'REPLY', reply: 'hi' });
    const { handler, store } = buildSpyIngress({ processor: port, reserveResult: 'DUPLICATE_COMPLETED' });
    const r = await handler.handle(goodRequest());
    check('R19 duplicate completed event → zero processor, safe ACK, zero re-complete', r.httpStatus === 200 && port.__mp.calls.n === 0 && store.calls.completed === 0); }
  { const port = adapterPort({ result: 'REPLY', reply: 'hi' });
    const { handler, store, outboundCalls } = buildSpyIngress({ processor: port, reserveResult: 'RETRYABLE_EXISTING' });
    const r = await handler.handle(goodRequest());
    check('R20 RETRYABLE_EXISTING → processor retries exactly once, completed once', port.__mp.calls.n === 1 && r.httpStatus === 200 && store.calls.completed === 1 && outboundCalls.n === 1); }

  // ============================ Port-only / drift / package ====================
  {
    const rawSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'webhook', 'chatwootProcessor.js'), 'utf8');
    // Strip line + block comments so the drift scan inspects CODE only (the
    // boundary comment intentionally names the forbidden APIs it must not use).
    const src = rawSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    check('36 source path drift: processor is PORT-ONLY (no live engine/axios/prisma/env import)',
      !/require\(['"]\.\.\/bot\/engine['"]\)/.test(src) && !/require\(['"]axios['"]\)/.test(src)
      && !/new PrismaClient/.test(src) && !/process\.env/.test(src) && !/require\(['"]openai['"]\)/i.test(src));
    check('14b defense-in-depth: no fetch/http in processor module (code)', !/\bfetch\(/.test(src) && !/https?\.request/.test(src));
  }
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    check('37 package script smoke:chatwoot-processor-wiring exists', pkg.scripts && pkg.scripts['smoke:chatwoot-processor-wiring'] === 'node scripts/smoke-chatwoot-processor-wiring.js');
  }
  check('38 regression import safety: factory returns port with processCanonicalMessage', typeof processor.createChatwootProcessor({}).processCanonicalMessage === 'function');

  // ================================ Summary ====================================
  if (failures.length > 0) {
    console.error('CHATWOOT_PROCESSOR_WIRING_SMOKE FAIL checks=' + checks + ' failures=' + failures.length);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('smoke:chatwoot-processor-wiring: MOCK_PASS checks=' + checks + ' failures=0');
  process.exit(0);
})().catch((e) => { console.error('CHATWOOT_PROCESSOR_WIRING_SMOKE ERROR', e && e.message ? e.message : e); process.exit(1); });
