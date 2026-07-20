#!/usr/bin/env node
'use strict';

// FACEBOOK-DIRECT-WEBHOOK-RESOLUTION-01 — mock-only conformance smoke.
//
// Verifies the production-safe Facebook Direct canonical adapter
// (../src/webhook/facebookCanonical.js) and proves it ALIGNS with the LANDED
// canonical oracle (./omni-channel-canonical-reference.js).
//
// NO PrismaClient, NO DATABASE_URL, NO environment read, NO network, NO live
// handler import (handler.js is NOT imported — this stays import-safe).

const fbc = require('../src/webhook/facebookCanonical');
const oracle = require('./omni-channel-canonical-reference');

let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }
function expectCode(fn, code, name) {
  checks += 1;
  try { fn(); failures.push(name + ' (no throw)'); }
  catch (e) { if (!e || e.code !== code) failures.push(name + ' (got ' + (e && e.code) + ')'); }
}

const INTEGRATION_A = 'fbpage-integration-A';
const INTEGRATION_B = 'fbpage-integration-B';
const TENANT_A = 'tenant-A-0001';
const PAGE_ID = '900001';
const RECEIVED_AT = '2026-01-01T00:00:00.000Z';

// Sanitized Meta messaging events (shape-compatible with handler.js).
function fbTextEvent(overrides) {
  return Object.assign({
    sender: { id: 'psid-0001' },
    recipient: { id: PAGE_ID },
    timestamp: 1735689600000,
    message: { mid: 'mid.sanitized-0001', text: '[sanitized-text]' },
  }, overrides || {});
}
function fbEchoEvent() {
  return { sender: { id: PAGE_ID }, recipient: { id: 'psid-0001' }, message: { mid: 'mid.echo-1', text: 'bot reply', is_echo: true } };
}
function fbPostbackEvent() {
  return { sender: { id: 'psid-0002' }, recipient: { id: PAGE_ID }, postback: { payload: 'MENU_BOOK' }, message: undefined };
}
function fbAttachmentEvent() {
  return { sender: { id: 'psid-0003' }, recipient: { id: PAGE_ID }, message: { mid: 'mid.att-1', attachments: [{ type: 'image', payload: { url: 'https://sanitized.invalid/cdn/secret-signed-url' } }] } };
}

function buildEnvelope(event, opts) {
  const id = fbc.extractFacebookEventIdentity(event);
  return fbc.buildFacebookCanonicalEnvelope(Object.assign({
    integrationId: INTEGRATION_A,
    tenantId: TENANT_A,
    identity: id,
    text: event.message && event.message.text,
    attachments: event.message && event.message.attachments,
    receivedAt: RECEIVED_AT,
    verificationState: 'VERIFIED',
    handoffStatus: 'bot',
    correlationId: 'corr-fb-1',
  }, opts || {}));
}

// ============================ A. Identity + canonical ============================
(function A() {
  const id = fbc.extractFacebookEventIdentity(fbTextEvent());
  check('1. Text event identity: mid/sender/direction/role', id.externalMessageRef === 'mid.sanitized-0001' && id.externalConversationRef === 'psid-0001' && id.direction === 'inbound' && id.senderRole === 'customer' && id.eventType === 'message' && id.messageType === 'text');

  const env = buildEnvelope(fbTextEvent());
  // Conformance against the LANDED oracle.
  let oracleOk = true;
  try { oracle.validateCanonicalEnvelope(env); } catch (_) { oracleOk = false; }
  check('2. Envelope conforms to LANDED oracle validateCanonicalEnvelope', oracleOk);
  check('3. Envelope provider=facebook, schema=omni.msg.v1, edge=FACEBOOK_DIRECT', env.provider === 'facebook' && env.schemaVersion === 'omni.msg.v1' && env.edge === 'FACEBOOK_DIRECT');
  check('4. Envelope carries server-resolved tenant + integration', env.tenantId === TENANT_A && env.integrationId === INTEGRATION_A);
  check('5. verificationState=VERIFIED before core', env.verificationState === 'VERIFIED');

  const json = JSON.stringify(env);
  check('6. No secret/token in envelope', !/accesstoken|apitoken|appsecret|verifytoken|access_token|page_access_token/i.test(json));
  check('7. No raw payload/body in envelope', !('rawPayload' in env) && !('rawBody' in env) && json.indexOf('rawBody') === -1);

  let mutated = false;
  try { env.tenantId = 'x'; } catch (_) {}
  if (env.tenantId !== TENANT_A) mutated = true;
  check('8. Envelope immutable (deep-frozen)', Object.isFrozen(env) && !mutated);

  // Alignment: FB idempotency key == oracle idempotency key for equivalent input.
  const id2 = fbc.extractFacebookEventIdentity(fbTextEvent());
  const oracleKey = oracle.computeIdempotencyKey({
    schemaVersion: 'omni.msg.v1', provider: 'facebook', integrationId: INTEGRATION_A,
    providerEventRef: id2.providerEventRef, externalMessageRef: id2.externalMessageRef,
    eventType: id2.eventType, direction: id2.direction,
  });
  check('9. FB idempotency key aligns with oracle key', env.idempotencyKey === oracleKey);
})();

// ================================ B. Idempotency ================================
(function B() {
  const base = { integrationId: INTEGRATION_A, providerEventRef: 'mid.X', externalMessageRef: 'mid.X', eventType: 'message', direction: 'inbound' };
  const k1 = fbc.computeFacebookIdempotencyKey(base);
  const k1b = fbc.computeFacebookIdempotencyKey(Object.assign({}, base));
  check('10. Same mid same integration -> same key', k1 === k1b);
  const kB = fbc.computeFacebookIdempotencyKey(Object.assign({}, base, { integrationId: INTEGRATION_B }));
  check('11. Same mid distinct integration -> different key (no collision)', k1 !== kB);
  expectCode(() => fbc.computeFacebookIdempotencyKey({ integrationId: INTEGRATION_A, eventType: 'message', direction: 'inbound' }),
    fbc.FB_CANONICAL_ERROR.FACEBOOK_EVENT_IDENTITY_UNAVAILABLE, '12. Missing mid fails closed');
  expectCode(() => fbc.computeFacebookIdempotencyKey({ providerEventRef: 'mid.Y', externalMessageRef: 'mid.Y', eventType: 'message', direction: 'inbound' }),
    fbc.FB_CANONICAL_ERROR.FACEBOOK_INTEGRATION_SCOPE_REQUIRED, '13. Missing integration scope fails closed');
  // No timestamp/text fallback: an event with text but no mid still fails closed.
  const idNoMid = fbc.extractFacebookEventIdentity({ sender: { id: 'psid-9' }, recipient: { id: PAGE_ID }, message: { text: 'hello no mid' } });
  check('14. No weak fallback key from text/timestamp', idNoMid.externalMessageRef === null && idNoMid.providerEventRef === null);
})();

// =============================== C. Loop / echo =================================
(function C() {
  const echoId = fbc.extractFacebookEventIdentity(fbEchoEvent());
  check('15. is_echo -> direction outbound, role bot', echoId.isEcho === true && echoId.direction === 'outbound' && echoId.senderRole === 'bot');
  const echoGuard = fbc.evaluateFacebookLoopGuard({ isEcho: true });
  check('16. is_echo ignored (no AI)', echoGuard.result === 'FACEBOOK_ECHO_IGNORED' && echoGuard.aiAllowed === false);
  const outGuard = fbc.evaluateFacebookLoopGuard({ direction: 'outbound', senderRole: 'bot' });
  check('17. outbound loop blocked', outGuard.result === 'FACEBOOK_OUTBOUND_LOOP_BLOCKED' && outGuard.aiAllowed === false);
  const botGuard = fbc.evaluateFacebookLoopGuard({ direction: 'inbound', senderRole: 'bot' });
  check('18. bot callback blocked', botGuard.result === 'FACEBOOK_BOT_CALLBACK_BLOCKED' && botGuard.aiAllowed === false);
  const ownPage = fbc.evaluateFacebookLoopGuard({ direction: 'inbound', senderRole: 'customer', ownPageId: PAGE_ID, senderRef: PAGE_ID });
  check('19. own-page callback blocked', ownPage.result === 'FACEBOOK_BOT_CALLBACK_BLOCKED' && ownPage.aiAllowed === false);
  const unknown = fbc.evaluateFacebookLoopGuard({ direction: 'sideways', senderRole: 'customer' });
  check('20. unknown direction produces no AI', unknown.result === 'UNKNOWN_DIRECTION_BLOCKED' && unknown.aiAllowed === false);
  const ok = fbc.evaluateFacebookLoopGuard({ direction: 'inbound', senderRole: 'customer', ownPageId: PAGE_ID, senderRef: 'psid-0001' });
  check('21. normal inbound customer allowed', ok.result === 'ALLOW_INBOUND_PROCESSING' && ok.aiAllowed === true);
})();

// ================================= D. Handoff ==================================
(function D() {
  check('22. bot -> BOT_ACTIVE AI allowed', fbc.evaluateFacebookHandoffGate('bot').aiAllowed === true);
  check('23. human_active -> blocked', fbc.evaluateFacebookHandoffGate('human_active').aiAllowed === false && fbc.evaluateFacebookHandoffGate('human_active').state === 'HUMAN_ACTIVE');
  check('24. pending_human -> HUMAN_REQUESTED no AI', fbc.evaluateFacebookHandoffGate('pending_human').aiAllowed === false && fbc.evaluateFacebookHandoffGate('pending_human').state === 'HUMAN_REQUESTED');
  check('25. closed -> CLOSED no AI', fbc.evaluateFacebookHandoffGate('closed').aiAllowed === false && fbc.evaluateFacebookHandoffGate('closed').state === 'CLOSED');
  check('26. mapping bot/unknown -> BOT_ACTIVE', fbc.mapFacebookHandoffStatusToCanonical('bot') === 'BOT_ACTIVE' && fbc.mapFacebookHandoffStatusToCanonical(undefined) === 'BOT_ACTIVE');
})();

// ========================== E. Tenant authority ================================
(function E() {
  const id = fbc.extractFacebookEventIdentity(fbTextEvent());
  expectCode(() => fbc.buildFacebookCanonicalEnvelope({ integrationId: INTEGRATION_A, identity: id, receivedAt: RECEIVED_AT, verificationState: 'VERIFIED', correlationId: 'c' }),
    fbc.FB_CANONICAL_ERROR.FACEBOOK_TENANT_AUTHORITY_REQUIRED, '27. No envelope without server-resolved tenant');
  expectCode(() => fbc.buildFacebookCanonicalEnvelope({ tenantId: TENANT_A, identity: id, receivedAt: RECEIVED_AT, verificationState: 'VERIFIED', correlationId: 'c' }),
    fbc.FB_CANONICAL_ERROR.FACEBOOK_INTEGRATION_SCOPE_REQUIRED, '28. No envelope without integration scope');
})();

// ============================ F. Event handling ================================
(function F() {
  const pb = fbc.extractFacebookEventIdentity(fbPostbackEvent());
  check('29. postback event typed', pb.eventType === 'postback' && pb.messageType === 'postback');
  const qr = fbc.extractFacebookEventIdentity(fbTextEvent({ message: { mid: 'mid.qr', quick_reply: { payload: 'QR_YES' } } }));
  check('30. quick_reply typed', qr.messageType === 'quick_reply');
  const attEnv = buildEnvelope(fbAttachmentEvent());
  const attJson = JSON.stringify(attEnv.attachments);
  check('31. attachment metadata reference-only (no fetchable url)', attJson.indexOf('sanitized.invalid') === -1 && attJson.indexOf('url') === -1 && attEnv.attachments[0].ref.length > 0 && attEnv.attachments[0].type === 'image');
})();

// =============================== Result output =================================
if (failures.length > 0) {
  console.error('smoke:facebook-direct-webhook: FAIL (' + failures.length + ' of ' + checks + ')');
  failures.forEach((f) => console.error('  >>> FAIL: ' + f));
  process.exit(1);
}
console.log('smoke:facebook-direct-webhook: MOCK_PASS (' + checks + ' checks)');
console.log('scenarios=31 · FACEBOOK_CANONICAL_RUNTIME_DEFERRED · DURABLE_META_IDEMPOTENCY_DEFERRED_WITH_TEST_GAP');
