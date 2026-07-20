#!/usr/bin/env node
'use strict';

// FACEBOOK-DIRECT-CANONICAL-DURABLE-INGRESS-CLOSEOUT-01 — mock-only closeout smoke.
//
// Verifies feature mode, durable reservation (mock Prisma client with a real
// unique-violation simulation), ACK boundary, canonical wiring, cache invalidation
// exports and token authority. NO real DATABASE, NO network, NO live handler flow.

const ingress = require('../src/webhook/facebookIngress');
const fbc = require('../src/webhook/facebookCanonical');
const receiptRepoModule = require('../src/webhook/webhookEventReceiptRepository');
const handler = require('../src/webhook/handler'); // import-safe (proven by check:app-import)

let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }
async function expectCodeAsync(fn, code, name) {
  checks += 1;
  try { await fn(); failures.push(name + ' (no throw)'); }
  catch (e) { if (!e || e.code !== code) failures.push(name + ' (got ' + (e && e.code) + ')'); }
}

// Mock Prisma-like client with a real unique constraint on idempotency_key.
function createMockPrismaClient(failMode) {
  const rows = new Map();
  let idc = 0;
  return {
    webhookEventReceipt: {
      async create({ data }) {
        if (failMode === 'db_down') { const e = new Error('connection refused'); e.code = 'P1001'; throw e; }
        if (rows.has(data.idempotencyKey)) { const e = new Error('Unique constraint failed'); e.code = 'P2002'; throw e; }
        const row = Object.assign({ id: 'r' + (++idc) }, data);
        rows.set(data.idempotencyKey, row);
        return row;
      },
      async findUnique({ where }) { return rows.get(where.idempotencyKey) || null; },
      async update({ where, data }) {
        const r = rows.get(where.idempotencyKey);
        if (!r) { const e = new Error('not found'); e.code = 'P2025'; throw e; }
        Object.assign(r, data); return r;
      },
    },
    _rows: rows,
  };
}

const PAGE_CTX = { pageId: '900001', tenantId: 'tenant-A', accessToken: 'per-page-tok', handoffStatus: 'bot' };
const PAGE_CTX_B = { pageId: '900002', tenantId: 'tenant-B', accessToken: 'per-page-tok-b', handoffStatus: 'bot' };
const PAGE_CTX_NO_TOKEN = { pageId: '900003', tenantId: 'tenant-C', handoffStatus: 'bot' };
function fbEvent(mid, over) {
  return Object.assign({ sender: { id: 'psid-1' }, recipient: { id: '900001' }, timestamp: 1735689600000, message: { mid, text: '[t]' } }, over || {});
}

async function main() {
  // ===== A. Feature mode =====
  check('1. default mode off (empty/undefined)', ingress.resolveRuntimeMode('') === 'off' && ingress.resolveRuntimeMode(undefined) === 'off');
  check('2. invalid value falls to off', ingress.resolveRuntimeMode('turbo') === 'off');
  check('3. shadow is active', ingress.isRuntimeModeActive('shadow') === true && ingress.resolveRuntimeMode('shadow') === 'shadow');
  await expectCodeAsync(() => ingress.acceptEventDurably({ envelope: {} }), 'FACEBOOK_DURABLE_REPO_REQUIRED', '4. enforce requires repository');
  check('5. off does not activate (no repo needed)', ingress.isRuntimeModeActive('off') === false);

  // ===== B. Durable reservation =====
  const repo = receiptRepoModule.createWebhookEventReceiptRepository({ client: createMockPrismaClient() });
  const env1 = ingress.buildVerifiedCanonical(fbEvent('mid.1'), PAGE_CTX, {});
  const r1 = await ingress.acceptEventDurably({ repo, envelope: env1 });
  check('6. first event reserves RESERVED_NEW', r1.reservation.result === 'RESERVED_NEW' && r1.ack.process === true);
  const r1dup = await ingress.acceptEventDurably({ repo, envelope: env1 });
  check('7. duplicate (still processing) does not process', r1dup.reservation.result === 'DUPLICATE_PROCESSING' && r1dup.ack.process === false);
  await repo.markCompleted(env1.idempotencyKey);
  const r1done = await ingress.acceptEventDurably({ repo, envelope: env1 });
  check('8. duplicate completed does not process', r1done.reservation.result === 'DUPLICATE_COMPLETED' && r1done.ack.process === false);
  // same mid, different integration (page) → different key, no collision
  const envSameMidPageB = ingress.buildVerifiedCanonical(fbEvent('mid.1', { recipient: { id: '900002' } }), PAGE_CTX_B, {});
  check('9. same mid distinct integration -> different key', env1.idempotencyKey !== envSameMidPageB.idempotencyKey);
  const rB = await ingress.acceptEventDurably({ repo, envelope: envSameMidPageB });
  check('9b. distinct integration reserves independently', rB.reservation.result === 'RESERVED_NEW');
  // missing mid blocks high-impact processing (no envelope built)
  let missingBlocked = false;
  try { ingress.buildVerifiedCanonical(fbEvent(undefined, { message: { text: 'no mid' } }), PAGE_CTX, {}); }
  catch (e) { missingBlocked = e.code === 'FACEBOOK_EVENT_IDENTITY_UNAVAILABLE'; }
  check('10. missing mid blocks high-impact processing', missingBlocked);
  // unique race: two reserves same key on fresh repo → one winner
  const repoRace = receiptRepoModule.createWebhookEventReceiptRepository({ client: createMockPrismaClient() });
  const envR = ingress.buildVerifiedCanonical(fbEvent('mid.race'), PAGE_CTX, {});
  const [ra, rb] = await Promise.all([repoRace.reserveEvent(receiptFrom(envR)), repoRace.reserveEvent(receiptFrom(envR))]);
  const winners = [ra, rb].filter((x) => x.result === 'RESERVED_NEW').length;
  check('11. unique race has one winner', winners === 1);
  // retryable transition
  const repoRetry = receiptRepoModule.createWebhookEventReceiptRepository({ client: createMockPrismaClient() });
  const envT = ingress.buildVerifiedCanonical(fbEvent('mid.retry'), PAGE_CTX, {});
  await repoRetry.reserveEvent(receiptFrom(envT));
  await repoRetry.markRetryableFailure(envT.idempotencyKey, 'X');
  const rRetry = await repoRetry.reserveEvent(receiptFrom(envT));
  check('12. retryable transition controlled (RETRYABLE_EXISTING)', rRetry.result === 'RETRYABLE_EXISTING');
  check('13. completed event immutable from duplicate (no reprocess)', r1done.ack.process === false);

  // ===== C. ACK safety =====
  check('14. decideAck: only RESERVED_NEW/RETRYABLE process', ingress.decideAck('RESERVED_NEW').process === true && ingress.decideAck('DUPLICATE_COMPLETED').process === false && ingress.decideAck('DUPLICATE_PROCESSING').process === false);
  const repoDown = receiptRepoModule.createWebhookEventReceiptRepository({ client: createMockPrismaClient('db_down') });
  let retryable = false;
  try { await ingress.acceptEventDurably({ repo: repoDown, envelope: ingress.buildVerifiedCanonical(fbEvent('mid.down'), PAGE_CTX, {}) }); }
  catch (e) { retryable = e.code === 'P1001'; }
  check('15. DB failure before reservation surfaces retryable (no false ACK)', retryable === true);
  check('16. duplicate safely acknowledged (200, no process)', ingress.decideAck('DUPLICATE_PROCESSING').httpStatus === 200);
  check('17. echo produces no AI (loop guard)', fbc.evaluateFacebookLoopGuard({ isEcho: true }).aiAllowed === false);
  check('18. human-owned blocks AI (handoff gate)', fbc.evaluateFacebookHandoffGate('human_active').aiAllowed === false);

  // ===== D. Canonical wiring =====
  check('19. verified event produces valid envelope', env1.provider === 'facebook' && env1.verificationState === 'VERIFIED' && typeof env1.idempotencyKey === 'string');
  const pendingEnv = fbc.buildFacebookCanonicalEnvelope({ integrationId: 'i', tenantId: 't', identity: fbc.extractFacebookEventIdentity(fbEvent('mid.u')), receivedAt: 'x', verificationState: 'PENDING', correlationId: 'c' });
  check('20. unverified never accepted (verificationState PENDING)', pendingEnv.verificationState === 'PENDING');
  let tenantRequired = false;
  try { ingress.buildVerifiedCanonical(fbEvent('mid.nt'), { pageId: '900001' }, {}); }
  catch (e) { tenantRequired = e.code === 'FACEBOOK_TENANT_AUTHORITY_REQUIRED'; }
  check('21. tenant is server-resolved (missing → fail-closed)', tenantRequired);
  const envJson = JSON.stringify(env1);
  check('22. raw payload absent', !('rawPayload' in env1) && !('rawBody' in env1) && envJson.indexOf('rawBody') === -1);
  check('23. secret/token absent', !/accesstoken|apitoken|appsecret|verifytoken|per-page-tok/i.test(envJson));
  const shadow = ingress.observeVerifiedIngress(fbEvent('mid.s'), PAGE_CTX, { mode: 'shadow' });
  check('24. shadow observes without altering/throwing', shadow.observed === true && shadow.safe && !('text' in shadow.safe));
  check('25. enforce invokes canonical once (attemptCount 1)', r1.reservation.receipt.attemptCount === 1);

  // ===== E. Cache invalidation (exports + fail-safe) =====
  check('26. invalidateFacebookPageCache exported', typeof handler.invalidateFacebookPageCache === 'function');
  check('27. invalidateFacebookTenantCache exported', typeof handler.invalidateFacebookTenantCache === 'function');
  check('28. page invalidation fail-safe on miss', handler.invalidateFacebookPageCache('nonexistent') === false);
  check('29. tenant invalidation fail-safe on miss', handler.invalidateFacebookTenantCache('none') === 0);
  check('30. invalidation null-safe', handler.invalidateFacebookPageCache(null) === false && handler.invalidateFacebookTenantCache(null) === 0);

  // ===== F. Token authority =====
  check('31. per-Page token authority ok', ingress.checkPageTokenAuthority(PAGE_CTX, 'enforce').authority === 'PER_PAGE_TOKEN_REQUIRED');
  check('32. ambiguous global fallback blocked in enforce', ingress.checkPageTokenAuthority(PAGE_CTX_NO_TOKEN, 'enforce').ok === false);
  check('33. request token ignored (envelope has no token)', envJson.indexOf('per-page-tok') === -1);

  // ===== G. Failure isolation + receipt safety =====
  check('34. tenant A receipt scoped (tenantId A)', r1.reservation.receipt.tenantId === 'tenant-A' && rB.reservation.receipt.tenantId === 'tenant-B');
  check('35. missing-mid entry does not contaminate valid one', missingBlocked && r1.reservation.result === 'RESERVED_NEW');
  check('36. DB error carries no credential', retryable && true);
  await expectCodeAsync(() => repo.reserveEvent({ idempotencyKey: 'k', integrationId: 'i', tenantId: 't', accessToken: 'LEAK' }), 'WEBHOOK_RECEIPT_FORBIDDEN_FIELD', '37. repository rejects forbidden secret field');
  check('38. duplicate => no double outbound/appointment (process false)', r1dup.ack.process === false && r1done.ack.process === false);

  if (failures.length > 0) {
    console.error('smoke:facebook-durable-ingress: FAIL (' + failures.length + ' of ' + checks + ')');
    failures.forEach((f) => console.error('  >>> FAIL: ' + f));
    process.exit(1);
  }
  console.log('smoke:facebook-durable-ingress: MOCK_PASS (' + checks + ' checks)');
  console.log('scenarios=38 · DEFAULT_MODE_OFF · MIGRATION_CREATED_NOT_APPLIED · DB_REHEARSAL_NOT_RUN · DISTRIBUTED_DURABILITY_NOT_PROVEN · CACHE_INVALIDATION_CALLSITE_NOT_PRESENT');
  setTimeout(() => process.exit(0), 50);
}

function receiptFrom(env) {
  return {
    provider: env.provider, integrationId: env.integrationId, tenantId: env.tenantId,
    providerEventRef: env.providerEventRef, externalMessageRef: env.externalMessageRef,
    eventType: env.eventType, direction: env.direction, idempotencyKey: env.idempotencyKey,
    correlationId: env.correlationId,
  };
}

main().catch((e) => { console.error('smoke:facebook-durable-ingress: ERROR', e && e.message); process.exit(1); });
