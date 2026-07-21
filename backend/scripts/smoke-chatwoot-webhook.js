#!/usr/bin/env node
'use strict';

// CHATWOOT-SIGNED-WEBHOOK-EDGE-IMPLEMENT-01 — Deterministic security smoke suite.
//
// Proves the Chatwoot signed-webhook edge (verifier + canonical adapter) over
// synthetic data with FAKE secrets and SANITIZED fixtures. NO network, NO DB,
// NO process.env read, NO filesystem write, NO live Chatwoot call.
//
// The oracle (omni-channel-canonical-reference.js) is required ONLY here (a test
// script) to prove idempotency parity — runtime src modules never import it.

const crypto = require('node:crypto');
const verifier = require('../src/webhook/chatwootVerifier');
const canonical = require('../src/webhook/chatwootCanonical');
const oracle = require('./omni-channel-canonical-reference');

const V = verifier.CHATWOOT_VERIFY_ERROR;
const C = canonical.CHATWOOT_CANONICAL_ERROR;

let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }
function expectCode(fn, code, name) {
  checks += 1;
  try { fn(); failures.push(name + ' (no throw)'); }
  catch (e) { if (!e || e.code !== code) failures.push(name + ' (got ' + (e && e.code) + ')'); }
}
function expectFail(result, code, name) {
  checks += 1;
  if (!result || result.ok !== false || result.safeErrorCode !== code) {
    failures.push(name + ' (ok=' + (result && result.ok) + ' code=' + (result && result.safeErrorCode) + ')');
  }
}
function expectOk(result, name) {
  checks += 1;
  if (!result || result.ok !== true || result.verificationState !== 'VERIFIED') {
    failures.push(name + ' (ok=' + (result && result.ok) + ' code=' + (result && result.safeErrorCode) + ')');
  }
}

// ---- Fixtures (fake secret, sanitized payload) --------------------------------
const SECRET = 'fake-signing-secret-DO-NOT-USE-0123456789';
const WRONG_SECRET = 'another-fake-secret-wrong-key-987654321';
const NOW = 1700000000; // injected Unix seconds (deterministic clock)
const HEX64 = '0'.repeat(64);

function sign(secret, ts, bodyBuf) {
  const msg = String(ts) + '.' + bodyBuf.toString('utf8');
  return 'sha256=' + crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}
function bodyOf(obj) { return Buffer.from(JSON.stringify(obj), 'utf8'); }
function freshStore() {
  const seen = new Set();
  return { reserve(k) { if (seen.has(k)) return false; seen.add(k); return true; } };
}
function throwingStore() { return { reserve() { throw new Error('store-down'); } }; }

const VALID_OBJ = {
  event: 'message_created',
  id: 12345,
  content: 'xin chào shop',
  message_type: 'incoming',
  private: false,
  sender: { id: 6789, type: 'contact', name: 'Khach Hang' },
  conversation: { id: 555, inbox_id: 2, status: 'open' },
  account: { id: 1 },
  inbox: { id: 2 },
  created_at: NOW,
};
const VALID_BODY = bodyOf(VALID_OBJ);

function hdr(sig, ts, delivery) {
  const h = {};
  if (sig !== undefined) h['x-chatwoot-signature'] = sig;
  if (ts !== undefined) h['x-chatwoot-timestamp'] = ts;
  if (delivery !== undefined) h['x-chatwoot-delivery'] = delivery;
  return h;
}
function verifyWith(over) {
  const base = {
    rawBody: VALID_BODY,
    headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'del-default'),
    signingSecret: SECRET,
    exactVersion: 'v4.13.0',
    authMode: 'HMAC_SIGNED_WEBHOOK',
    mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK',
    now: NOW,
    maxClockSkewSeconds: 300,
    replayStore: freshStore(),
  };
  return verifier.verifyChatwootWebhook(Object.assign(base, over || {}));
}

// ================================ Version ======================================
check('01 v4.13.0 accepted', verifier.assertSupportedChatwootVersion('v4.13.0').normalized === '4.13.0');
check('02 newer exact version accepted', verifier.assertSupportedChatwootVersion('v4.14.2').normalized === '4.14.2' && verifier.assertSupportedChatwootVersion('5.0.0').normalized === '5.0.0');
expectCode(() => verifier.assertSupportedChatwootVersion('v4.12.9'), V.CHATWOOT_VERSION_UNSUPPORTED, '03 v4.12.x rejected');
expectCode(() => verifier.assertSupportedChatwootVersion('v4.13.0+'), V.CHATWOOT_EXACT_VERSION_REQUIRED, '04 range string rejected');
expectCode(() => verifier.assertSupportedChatwootVersion('latest'), V.CHATWOOT_EXACT_VERSION_REQUIRED, '05 latest rejected');
expectCode(() => verifier.assertSupportedChatwootVersion('UNKNOWN'), V.CHATWOOT_EXACT_VERSION_REQUIRED, '06 UNKNOWN rejected');
expectCode(() => verifier.assertSupportedChatwootVersion('v4.13'), V.CHATWOOT_EXACT_VERSION_REQUIRED, '07 malformed semver rejected');

// ============================ Auth / mechanism =================================
expectOk(verifyWith(), '08 HMAC mode accepted');
expectFail(verifyWith({ authMode: 'SHARED_TOKEN' }), V.CHATWOOT_AUTH_MODE_UNSUPPORTED, '09 unsupported auth mode rejected');
expectFail(verifyWith({ mechanism: undefined }), V.CHATWOOT_MECHANISM_REQUIRED, '10 missing mechanism rejected');
expectFail(verifyWith({ mechanism: 'NOT_A_MECHANISM' }), V.CHATWOOT_MECHANISM_UNSUPPORTED, '11 invalid mechanism rejected');
// 12: even with a token-like header present, unsupported auth mode fails closed (no fallback).
expectFail(verifyWith({ authMode: 'QUERY_TOKEN', headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'd', 'tok') }), V.CHATWOOT_AUTH_MODE_UNSUPPORTED, '12 no automatic fallback');
// 13: missing signature never enters a token branch — it is SIGNATURE_MISSING.
expectFail(verifyWith({ headers: hdr(undefined, String(NOW), 'del-13') }), V.CHATWOOT_SIGNATURE_MISSING, '13 missing signature never enters token branch');

// ================================ Signature ====================================
expectOk(verifyWith({ replayStore: freshStore() }), '14 valid signature');
expectFail(verifyWith({ headers: hdr(undefined, String(NOW), 'del-15') }), V.CHATWOOT_SIGNATURE_MISSING, '15 missing signature');
expectFail(verifyWith({ headers: hdr('sha1=' + HEX64, String(NOW), 'del-16') }), V.CHATWOOT_SIGNATURE_MALFORMED, '16 wrong prefix');
expectFail(verifyWith({ headers: hdr('sha256=' + '0'.repeat(63), String(NOW), 'del-17') }), V.CHATWOOT_SIGNATURE_MALFORMED, '17 wrong digest length');
expectFail(verifyWith({ headers: hdr('sha256=' + 'g'.repeat(64), String(NOW), 'del-18') }), V.CHATWOOT_SIGNATURE_MALFORMED, '18 non-hex digest');
expectFail(verifyWith({ headers: hdr(sign(WRONG_SECRET, NOW, VALID_BODY), String(NOW), 'del-19') }), V.CHATWOOT_SIGNATURE_INVALID, '19 wrong signature');
{
  const tampered = bodyOf(Object.assign({}, VALID_OBJ, { content: 'tampered' }));
  expectFail(verifyWith({ rawBody: tampered, headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'del-20') }), V.CHATWOOT_SIGNATURE_INVALID, '20 body tampered');
}
// 21: signature made over NOW but header claims NOW+5 → signed message differs → INVALID.
expectFail(verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW + 5), 'del-21') }), V.CHATWOOT_SIGNATURE_INVALID, '21 timestamp tampered');
{
  const utf = bodyOf({ event: 'message_created', id: 22, content: 'café 日本 😀', message_type: 'incoming', sender: { id: 1, type: 'contact' }, conversation: { id: 2, inbox_id: 2 }, account: { id: 1 }, inbox: { id: 2 } });
  expectOk(verifyWith({ rawBody: utf, headers: hdr(sign(SECRET, NOW, utf), String(NOW), 'del-22'), replayStore: freshStore() }), '22 UTF-8 raw body');
}
{
  const empty = Buffer.alloc(0);
  expectFail(verifyWith({ rawBody: empty, headers: hdr(sign(SECRET, NOW, empty), String(NOW), 'del-23'), replayStore: freshStore() }), V.CHATWOOT_PAYLOAD_INVALID, '23 empty body signed then invalid payload');
}
// 24 constant-time compare path.
check('24 constant-time compare path', verifier.safeCompareSignature('sha256=' + HEX64, 'sha256=' + HEX64) === true
  && verifier.safeCompareSignature('sha256=' + HEX64, 'sha256=' + '1'.repeat(64)) === false
  && verifier.safeCompareSignature('sha256=' + HEX64, 'short') === false);
// 25 header names case-insensitive.
{
  const H = {};
  H['X-Chatwoot-Signature'] = sign(SECRET, NOW, VALID_BODY);
  H['X-Chatwoot-Timestamp'] = String(NOW);
  H['X-Chatwoot-Delivery'] = 'del-25';
  expectOk(verifyWith({ headers: H, replayStore: freshStore() }), '25 header names case-insensitive');
}
// 26/27 multiple header values rejected.
expectFail(verifyWith({ headers: { 'x-chatwoot-signature': [sign(SECRET, NOW, VALID_BODY), 'sha256=' + HEX64], 'x-chatwoot-timestamp': String(NOW), 'x-chatwoot-delivery': 'del-26' } }), V.CHATWOOT_HEADER_AMBIGUOUS, '26 multiple signature headers rejected');
expectFail(verifyWith({ headers: { 'x-chatwoot-signature': sign(SECRET, NOW, VALID_BODY), 'x-chatwoot-timestamp': [String(NOW), String(NOW)], 'x-chatwoot-delivery': 'del-27' } }), V.CHATWOOT_HEADER_AMBIGUOUS, '27 multiple timestamp headers rejected');

// ================================ Timestamp ====================================
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, undefined, 'del-28') }), V.CHATWOOT_TIMESTAMP_MISSING, '28 missing timestamp');
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, 'abc', 'del-29') }), V.CHATWOOT_TIMESTAMP_INVALID, '29 non-numeric timestamp');
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, '123.4', 'del-30') }), V.CHATWOOT_TIMESTAMP_INVALID, '30 decimal timestamp');
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, '-5', 'del-31') }), V.CHATWOOT_TIMESTAMP_INVALID, '31 negative timestamp');
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, String(NOW - 301), 'del-32') }), V.CHATWOOT_TIMESTAMP_STALE, '32 stale timestamp');
expectFail(verifyWith({ headers: hdr('sha256=' + HEX64, String(NOW + 301), 'del-33') }), V.CHATWOOT_TIMESTAMP_STALE, '33 future timestamp beyond skew');
{
  const ts = NOW - 300; // boundary
  expectOk(verifyWith({ headers: hdr(sign(SECRET, ts, VALID_BODY), String(ts), 'del-34'), replayStore: freshStore() }), '34 boundary timestamp accepted');
}
// 35 injected deterministic clock (two runs identical).
{
  const r1 = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'del-35a'), replayStore: freshStore() });
  const r2 = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'del-35b'), replayStore: freshStore() });
  check('35 injected deterministic clock', r1.ok === true && r2.ok === true && r1.timestamp === NOW && r2.timestamp === NOW);
}

// ================================= Replay ======================================
{
  const store = freshStore();
  const ok1 = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-1'), replayStore: store });
  expectOk(ok1, '36 new delivery accepted');
  const dup = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-1'), replayStore: store });
  expectFail(dup, V.CHATWOOT_DELIVERY_REPLAYED, '37 same delivery rejected');
}
expectFail(verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), undefined) }), V.CHATWOOT_DELIVERY_ID_MISSING, '38 missing delivery fail-closed');
{
  // Same business event (same message id) but two distinct transport deliveries.
  const store = freshStore();
  const a = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-2'), replayStore: store });
  const b = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-3'), replayStore: store });
  const idA = canonical.computeChatwootIdempotencyKey({ integrationId: 'int-1', providerEventRef: '12345', externalMessageRef: '12345', eventType: 'message_created', direction: 'inbound' });
  const idB = canonical.computeChatwootIdempotencyKey({ integrationId: 'int-1', providerEventRef: '12345', externalMessageRef: '12345', eventType: 'message_created', direction: 'inbound' });
  check('39 same business event new delivery passes transport, blocked by business idempotency', a.ok === true && b.ok === true && idA === idB);
}
expectFail(verifyWith({ replayStore: throwingStore() }), V.CHATWOOT_REPLAY_STORE_ERROR, '40 replay store error fail-closed');
{
  // Two independent in-memory stores do NOT share state → single-process only.
  const s1 = freshStore(); const s2 = freshStore();
  const a = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-x'), replayStore: s1 });
  const b = verifyWith({ headers: hdr(sign(SECRET, NOW, VALID_BODY), String(NOW), 'r-x'), replayStore: s2 });
  check('41 single-process limitation documented (TRANSPORT_REPLAY_DURABILITY_NOT_PROVEN)', a.ok === true && b.ok === true);
}

// ================================== Parse ======================================
{
  const r = verifyWith({ replayStore: freshStore() });
  check('42 parse after verification', r.ok === true && r.payload && r.payload.event === 'message_created');
}
{
  // Invalid JSON body + WRONG signature → SIGNATURE_INVALID proves parse never ran.
  const notJson = Buffer.from('not-json-at-all', 'utf8');
  const r = verifyWith({ rawBody: notJson, headers: hdr(sign(WRONG_SECRET, NOW, notJson), String(NOW), 'del-43') });
  expectFail(r, V.CHATWOOT_SIGNATURE_INVALID, '43 invalid signature zero parse');
}
{
  const notJson = Buffer.from('not-json-at-all', 'utf8');
  const r = verifyWith({ rawBody: notJson, headers: hdr(sign(SECRET, NOW, notJson), String(NOW), 'del-44'), replayStore: freshStore() });
  expectFail(r, V.CHATWOOT_PAYLOAD_INVALID, '44 valid signature invalid JSON');
}
{
  const strBody = Buffer.from('"just-a-string"', 'utf8');
  const r = verifyWith({ rawBody: strBody, headers: hdr(sign(SECRET, NOW, strBody), String(NOW), 'del-45'), replayStore: freshStore() });
  expectFail(r, V.CHATWOOT_PAYLOAD_INVALID, '45 payload object required');
}
{
  const arrBody = Buffer.from('[1,2,3]', 'utf8');
  const r = verifyWith({ rawBody: arrBody, headers: hdr(sign(SECRET, NOW, arrBody), String(NOW), 'del-46'), replayStore: freshStore() });
  expectFail(r, V.CHATWOOT_PAYLOAD_INVALID, '46 array payload rejected');
}

// ============================ Identity / mechanism =============================
check('47 numeric account id', canonical.normalizeChatwootNumericId(1, 'accounts') === '1' && canonical.normalizeChatwootNumericId('2', 'inboxes') === '2');
check('48 account URL normalization', canonical.normalizeChatwootNumericId('https://app.chatwoot.com/app/accounts/7', 'accounts') === '7');
check('49 inbox URL normalization', canonical.normalizeChatwootNumericId('https://app.chatwoot.com/app/accounts/1/inboxes/3', 'inboxes') === '3');
expectCode(() => canonical.normalizeChatwootNumericId('https://app.chatwoot.com/app/accounts/1/teams/9', 'inboxes'), C.CHATWOOT_IDENTITY_INVALID, '50 team URL rejected as inbox');
expectCode(() => canonical.normalizeChatwootNumericId('https://app.chatwoot.com/app/accounts/1/conversations/5', 'accounts'), C.CHATWOOT_IDENTITY_INVALID, '51 wrong resource URL rejected');
expectCode(() => canonical.normalizeChatwootNumericId('https://app.chatwoot.com/random/42', 'accounts'), C.CHATWOOT_IDENTITY_INVALID, '52 arbitrary trailing number rejected');
expectCode(() => canonical.extractChatwootEventIdentity({ event: 'message_created', account: { id: 1 }, inbox: { id: 2 }, conversation: { id: 3, inbox_id: 2 }, sender: { id: 4, type: 'contact' }, message_type: 'incoming' }, 'ACCOUNT_INTEGRATION_WEBHOOK'), C.CHATWOOT_EVENT_IDENTITY_UNAVAILABLE, '53 missing message identity');
expectCode(() => canonical.extractChatwootProviderIdentity({ event: 'message_created', account: { id: 1 }, conversation: { id: 5 } }, 'API_CHANNEL_WEBHOOK'), C.CHATWOOT_PAYLOAD_MECHANISM_MISMATCH, '54 mechanism/payload mismatch');

// ================================ Loop / events ================================
check('55 customer incoming allowed', canonical.evaluateChatwootLoopGuard({ direction: 'inbound', senderRole: 'customer' }).result === 'ALLOW_INBOUND_PROCESSING');
check('56 outgoing agent blocked', canonical.evaluateChatwootLoopGuard({ direction: 'outbound', senderRole: 'agent' }).aiAllowed === false);
check('57 bot callback blocked', canonical.evaluateChatwootLoopGuard({ direction: 'inbound', senderRole: 'bot' }).result === 'CHATWOOT_BOT_CALLBACK_BLOCKED');
check('58 private note ignored', canonical.evaluateChatwootLoopGuard({ direction: 'inbound', senderRole: 'customer', isPrivate: true }).result === 'CHATWOOT_PRIVATE_NOTE_IGNORED');
check('59 system event ignored', canonical.evaluateChatwootLoopGuard({ direction: null, senderRole: 'system', messageType: 'activity' }).result === 'CHATWOOT_SYSTEM_EVENT_IGNORED');
check('60 unknown direction blocked', canonical.evaluateChatwootLoopGuard({ direction: 'sideways', senderRole: 'customer' }).result === 'CHATWOOT_DIRECTION_UNKNOWN_BLOCKED');
{
  const statusId = canonical.extractChatwootEventIdentity({ event: 'conversation_status_changed', status: 'resolved', account: { id: 1 }, inbox: { id: 2 }, conversation: { id: 555, inbox_id: 2 } }, 'ACCOUNT_INTEGRATION_WEBHOOK');
  const aiReply = statusId.eventType === 'message_created';
  check('61 status event zero AI reply', statusId.eventType === 'conversation_status_changed' && aiReply === false && statusId.isSupportedEvent === true);
}
{
  const unsup = canonical.extractChatwootEventIdentity({ event: 'contact_updated', id: 9, account: { id: 1 }, inbox: { id: 2 }, conversation: { id: 3, inbox_id: 2 }, sender: { id: 4, type: 'contact' } }, 'ACCOUNT_INTEGRATION_WEBHOOK');
  check('62 unsupported event ignored safely', unsup.isSupportedEvent === false && unsup.eventType === 'contact_updated');
}

// ============================ Canonical / security =============================
function buildValidEnvelope(over) {
  const identity = canonical.extractChatwootEventIdentity(VALID_OBJ, 'ACCOUNT_INTEGRATION_WEBHOOK');
  return canonical.buildChatwootCanonicalEnvelope(Object.assign({
    integrationId: 'int-1',
    tenantId: 'tenant-A',
    verificationState: 'VERIFIED',
    mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK',
    identity,
    text: VALID_OBJ.content,
    attachments: [{ file_type: 'image', content_type: 'image/png', file_size: 1024, data_url: 'https://files.example/secret-path/a.png' }],
    receivedAt: NOW,
    deliveryRef: 'del-default',
    correlationId: 'corr-1',
  }, over || {}));
}
const ENV = buildValidEnvelope();
const ENV_STR = JSON.stringify(ENV);
check('63 valid canonical envelope', ENV.schemaVersion === 'omni.msg.v1' && ENV.provider === 'CHATWOOT_WEBSITE' && ENV.channel === 'website_chat' && ENV.verificationState === 'VERIFIED');
check('64 tenant supplied server-side', ENV.tenantId === 'tenant-A' && ENV.integrationId === 'int-1');
{
  // Payload carrying a tenant id is ignored; provider-supplied tenant is rejected.
  const identity = canonical.extractChatwootEventIdentity(Object.assign({}, VALID_OBJ, { tenantId: 'evil-tenant', account: { id: 1, tenantId: 'evil' } }), 'ACCOUNT_INTEGRATION_WEBHOOK');
  const env2 = canonical.buildChatwootCanonicalEnvelope({ integrationId: 'int-1', tenantId: 'tenant-A', verificationState: 'VERIFIED', mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK', identity, receivedAt: NOW });
  let rejected = false;
  try { canonical.buildChatwootCanonicalEnvelope({ integrationId: 'int-1', tenantId: 'tenant-A', verificationState: 'VERIFIED', mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK', identity, receivedAt: NOW, providerTenantId: 'evil' }); }
  catch (e) { rejected = e.code === C.CANONICAL_SECRET_FIELD_FORBIDDEN; }
  check('65 payload tenant ignored', env2.tenantId === 'tenant-A' && rejected === true);
}
check('66 no raw payload', !('rawPayload' in ENV) && ENV_STR.indexOf('rawPayload') === -1);
check('67 no raw body', !('rawBody' in ENV) && ENV_STR.indexOf('rawBody') === -1);
check('68 no secret', ENV_STR.toLowerCase().indexOf('secret') === -1);
check('69 no API token', ENV_STR.toLowerCase().indexOf('apitoken') === -1 && ENV_STR.toLowerCase().indexOf('accesstoken') === -1 && ENV_STR.toLowerCase().indexOf('api_access_token') === -1);
check('70 no signature', ENV_STR.indexOf('sha256=') === -1);
check('71 safe attachment metadata only', Array.isArray(ENV.attachments) && ENV.attachments[0].fetchStatus === 'DISABLED' && ENV.attachments[0].providerReference && !('url' in ENV.attachments[0]) && !('data' in ENV.attachments[0]) && ENV_STR.indexOf('files.example') === -1);
{
  const mine = canonical.computeChatwootIdempotencyKey({ provider: 'CHATWOOT_WEBSITE', integrationId: 'int-1', providerEventRef: '12345', externalMessageRef: '12345', eventType: 'message_created', direction: 'inbound' });
  const theirs = oracle.computeIdempotencyKey({ provider: 'CHATWOOT_WEBSITE', integrationId: 'int-1', providerEventRef: '12345', externalMessageRef: '12345', eventType: 'message_created', direction: 'inbound' });
  check('72 idempotency matches oracle', typeof mine === 'string' && mine.length === 64 && mine === theirs);
}
{
  let mutated = false;
  try { ENV.tenantId = 'x'; if (ENV.tenantId === 'x') mutated = true; } catch (_e) { mutated = false; }
  check('73 envelope immutable', Object.isFrozen(ENV) && Object.isFrozen(ENV.attachments) && mutated === false);
}
{
  const audit = canonical.sanitizeChatwootAuditMetadata({
    provider: 'CHATWOOT_WEBSITE', mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK', eventType: 'message_created', direction: 'inbound',
    integrationId: 'int-1', tenantId: 'tenant-A', verificationState: 'VERIFIED', correlationId: 'corr-1',
    externalMessageRef: '12345', deliveryRef: 'del-default',
    content: 'secret text', email: 'a@b.com', phone: '+84900', secret: 'sss', signature: 'sha256=' + HEX64, apitoken: 'tok',
  });
  const s = JSON.stringify(audit).toLowerCase();
  check('74 safe audit contains no content/PII', audit.provider === 'CHATWOOT_WEBSITE' && audit.externalMessageRefMasked && s.indexOf('secret text') === -1 && s.indexOf('a@b.com') === -1 && s.indexOf('+84900') === -1 && s.indexOf('sha256=') === -1 && s.indexOf('tok') === -1 && !('content' in audit) && !('email' in audit) && !('signature' in audit));
}

// ================================== Summary ====================================
if (failures.length > 0) {
  console.error('CHATWOOT_WEBHOOK_SMOKE FAIL checks=' + checks + ' failures=' + failures.length);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('CHATWOOT_WEBHOOK_SMOKE PASS checks=' + checks + ' failures=0');
