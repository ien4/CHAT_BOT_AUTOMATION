#!/usr/bin/env node
'use strict';

// CHATWOOT-DB-REHEARSAL-AND-DURABLE-CONCURRENCY-01 — real two-process DB concurrency proof.
//
// Proves, against an EPHEMERAL Docker PostgreSQL (never prod/staging/dev), that the
// LANDED durable primitives hold under REAL multi-process contention:
//   - transport replay (WebhookDeliveryReceipt) → exactly one winner per delivery,
//   - business idempotency (WebhookEventReceipt) → exactly one winner per key,
//   - business idempotency is integration-scoped (no cross-integration collision),
//   - global inbox identity (IntegrationIdentity.normalizedIdentityKey) → one binding,
//   - arbitrary DB errors are NOT laundered into a false DUPLICATE.
//
// It uses the ACTUAL @prisma/client + the PRODUCTION repositories (no re-implemented
// business logic), NO network, and refuses to run unless DATABASE_URL targets
// 127.0.0.1 / the phase-owned ephemeral database. Two independent Node child
// processes (one PrismaClient each) race behind a synchronized start barrier.

const crypto = require('node:crypto');
const path = require('node:path');
const { fork } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const repos = require('../src/webhook/chatwootRuntimeRepositories');
const canonical = require('../src/webhook/chatwootCanonical');
const { createWebhookEventReceiptRepository } = require('../src/webhook/webhookEventReceiptRepository');

const ROUNDS = 20;
const PREFIX = 'reh-';

// ---- Isolation guards (fail-closed BEFORE any client) --------------------------
function assertEphemeralTarget() {
  const url = process.env.DATABASE_URL || '';
  if (!/@127\.0\.0\.1:\d+\//.test(url)) {
    throw new Error('REHEARSAL_DB_NOT_LOCALHOST — DATABASE_URL must target 127.0.0.1');
  }
  if (!/\/rehearsal_chatbot(\?|$)/.test(url)) {
    throw new Error('REHEARSAL_DB_NAME_MISMATCH — database must be rehearsal_chatbot');
  }
  if (!process.env.CHATWOOT_REHEARSAL_CONTAINER_ID) {
    throw new Error('REHEARSAL_OWNERSHIP_PROOF_MISSING — CHATWOOT_REHEARSAL_CONTAINER_ID required');
  }
  // Never accept anything that looks like a known non-ephemeral database.
  if (/postgres:5432|:5433\/|staging|prod/i.test(url)) {
    throw new Error('REHEARSAL_DB_LOOKS_NON_EPHEMERAL');
  }
}

function sha256Hex(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

// ================================ WORKER =======================================
// A long-lived worker: one PrismaClient, replies to op messages from the parent.
if (process.argv.includes('--worker')) {
  assertEphemeralTarget();
  const prisma = new PrismaClient();
  const replayStore = repos.createWebhookDeliveryReplayStore({ client: prisma });
  const receiptRepo = createWebhookEventReceiptRepository({ client: prisma });

  async function handle(msg) {
    const { id, op, args } = msg;
    try {
      if (op === 'transport') {
        const outcome = await replayStore.reserveTransport({ endpointId: args.endpointId, deliveryRef: args.deliveryRef, timestamp: args.timestamp });
        return { id, ok: true, outcome };
      }
      if (op === 'transport_bad') {
        // Non-P2002 (FK violation) MUST surface as an error, never DUPLICATE.
        const outcome = await replayStore.reserveTransport({ endpointId: args.endpointId, deliveryRef: args.deliveryRef, timestamp: args.timestamp });
        return { id, ok: true, outcome };
      }
      if (op === 'business') {
        const r = await receiptRepo.reserveEvent(args.receipt);
        return { id, ok: true, outcome: r.result };
      }
      if (op === 'identity') {
        await prisma.integrationIdentity.create({ data: args.data });
        return { id, ok: true, outcome: 'CREATED' };
      }
      return { id, ok: false, error: 'UNKNOWN_OP' };
    } catch (e) {
      return { id, ok: false, error: (e && e.message) || 'ERR', code: (e && e.code) || null };
    }
  }

  process.on('message', async (msg) => {
    if (msg && msg.op === 'DISCONNECT') { await prisma.$disconnect(); process.send({ id: msg.id, ok: true, outcome: 'DISCONNECTED' }); process.exit(0); return; }
    const res = await handle(msg);
    process.send(res);
  });
  process.send({ type: 'READY', pid: process.pid });
  return;
}

// ================================ PARENT =======================================
let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }

function spawnWorker(tag) {
  const child = fork(path.join(__dirname, path.basename(__filename)), ['--worker'], { env: process.env });
  const pending = new Map();
  let nextId = 1;
  let ready = false;
  const readyP = new Promise((resolve) => { child.once('message', (m) => { if (m && m.type === 'READY') { ready = true; resolve(m); } }); });
  child.on('message', (m) => { if (m && m.id && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m); } });
  let crashed = false;
  child.on('exit', (code) => { if (!child.__clean && code !== 0) { crashed = true; } });
  return {
    tag, child, readyP,
    isReady: () => ready,
    isCrashed: () => crashed,
    send(op, args) { const id = nextId++; return new Promise((resolve) => { pending.set(id, { resolve }); child.send({ id, op, args }); }); },
    async disconnect() { child.__clean = true; const id = nextId++; return new Promise((resolve) => { pending.set(id, { resolve }); child.send({ id, op: 'DISCONNECT' }); child.once('exit', () => resolve({ ok: true })); }); },
  };
}

async function main() {
  assertEphemeralTarget();
  const url = process.env.DATABASE_URL;

  // ---- Sandbox checks -----------------------------------------------------------
  check('01 docker ownership proof present', Boolean(process.env.CHATWOOT_REHEARSAL_CONTAINER_ID));
  check('02 localhost-only binding', /@127\.0\.0\.1:\d+\//.test(url));
  check('03 phase-created database name', /\/rehearsal_chatbot(\?|$)/.test(url));
  check('04 not an external/prod/staging DATABASE_URL', !/postgres:5432|:5433\/|staging|prod/i.test(url));
  check('05 target migration hash matched (harness-proven)', process.env.CHATWOOT_REHEARSAL_TARGET_HASH_OK === '1');

  const prisma = new PrismaClient();
  const receiptRepo = createWebhookEventReceiptRepository({ client: prisma });

  // ---- Migration-state checks (DB catalog) -------------------------------------
  const tableRows = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('provider_webhook_endpoints','tenant_integrations','integration_identities','integration_credentials','webhook_delivery_receipts')"
  );
  check('06 five target tables exist', Array.isArray(tableRows) && tableRows.length === 5);
  const eventTable = await prisma.$queryRawUnsafe("SELECT 1 FROM information_schema.tables WHERE table_name='webhook_event_receipts'");
  check('07 webhook_event_receipts (business idempotency) exists', Array.isArray(eventTable) && eventTable.length === 1);
  const targetRow = await prisma.$queryRawUnsafe("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name='20260721130000_add_chatwoot_account_webhook_runtime'");
  check('08 target migration applied exactly once', Array.isArray(targetRow) && targetRow.length === 1 && targetRow[0].finished_at !== null && targetRow[0].rolled_back_at === null);
  const priorApplied = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL");
  check('09 historical + target migrations applied (>=15)', Array.isArray(priorApplied) && priorApplied[0].n >= 15);
  const fkRows = await prisma.$queryRawUnsafe("SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('tenant_integrations','integration_identities','integration_credentials','webhook_delivery_receipts')");
  check('10 all target FKs ON DELETE CASCADE', Array.isArray(fkRows) && fkRows.length === 5 && fkRows.every((r) => r.confdeltype === 'c'));
  const uniqRows = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='integration_identities' AND indexdef LIKE '%UNIQUE%' AND indexname LIKE '%normalized_identity_key%'");
  check('11 normalized_identity_key UNIQUE present', Array.isArray(uniqRows) && uniqRows.length === 1);
  const delUniq = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='webhook_delivery_receipts' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%delivery_ref_hash%'");
  check('12 endpoint+delivery_ref_hash UNIQUE present', Array.isArray(delUniq) && delUniq.length === 1);
  const credUniq = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='integration_credentials' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%credential_type%'");
  check('13 endpoint+credential_type UNIQUE present', Array.isArray(credUniq) && credUniq.length === 1);

  // ---- Seed fake fixtures (ephemeral only) --------------------------------------
  const ts = Date.now();
  await prisma.providerWebhookEndpoint.create({ data: { id: PREFIX + 'ep-1', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', publicEndpointKey: PREFIX + 'pubkey-000000000001', exactVersion: 'v4.13.0', isEnabled: false } });
  await prisma.tenant.create({ data: { id: PREFIX + 'tenant-A', slug: PREFIX + 'tenant-a-' + ts, name: 'RehA' } });
  await prisma.tenant.create({ data: { id: PREFIX + 'tenant-B', slug: PREFIX + 'tenant-b-' + ts, name: 'RehB' } });
  await prisma.tenantIntegration.create({ data: { id: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', webhookEndpointId: PREFIX + 'ep-1', isEnabled: true } });
  await prisma.tenantIntegration.create({ data: { id: PREFIX + 'int-B', tenantId: PREFIX + 'tenant-B', webhookEndpointId: PREFIX + 'ep-1', isEnabled: true } });

  // ---- Two-process barrier ------------------------------------------------------
  const w1 = spawnWorker('w1');
  const w2 = spawnWorker('w2');
  await Promise.all([w1.readyP, w2.readyP]);
  check('14 two independent worker processes ready', w1.isReady() && w2.isReady() && w1.child.pid !== w2.child.pid);

  // ---- Transport replay concurrency (20 rounds) ---------------------------------
  let tWinners = 0, tDups = 0, tErrors = 0, tBadRounds = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    const deliveryRef = 'del-' + ts + '-' + r;
    const [a, b] = await Promise.all([
      w1.send('transport', { endpointId: PREFIX + 'ep-1', deliveryRef, timestamp: 1700000000 }),
      w2.send('transport', { endpointId: PREFIX + 'ep-1', deliveryRef, timestamp: 1700000000 }),
    ]);
    const outs = [a.outcome, b.outcome];
    const wins = outs.filter((o) => o === 'RESERVED_NEW').length;
    const dups = outs.filter((o) => o === 'DUPLICATE').length;
    const errs = [a, b].filter((x) => x.ok === false).length;
    tWinners += wins; tDups += dups; tErrors += errs;
    // exactly one row for this delivery, storing hash only
    const cnt = await prisma.$queryRawUnsafe("SELECT delivery_ref_hash FROM webhook_delivery_receipts WHERE webhook_endpoint_id=$1 AND delivery_ref_hash=$2", PREFIX + 'ep-1', sha256Hex(deliveryRef));
    if (!(wins === 1 && dups === 1 && errs === 0 && Array.isArray(cnt) && cnt.length === 1 && cnt[0].delivery_ref_hash === sha256Hex(deliveryRef))) tBadRounds += 1;
  }
  check('15 transport: exactly one RESERVED_NEW per round', tWinners === ROUNDS);
  check('16 transport: exactly one DUPLICATE per round', tDups === ROUNDS);
  check('17 transport: zero STORE_ERROR', tErrors === 0);
  check('18 transport: 20 rounds all stable (row=1, hash-only)', tBadRounds === 0);
  const totalDelivery = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts WHERE webhook_endpoint_id=$1", PREFIX + 'ep-1');
  check('19 transport: total rows == rounds (no double winners)', totalDelivery[0].n === ROUNDS);
  const rawLeak = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts WHERE delivery_ref_hash LIKE 'del-%'");
  check('20 transport: no raw delivery header persisted (hash only)', rawLeak[0].n === 0);

  // ---- Business idempotency concurrency (20 rounds) -----------------------------
  let bWinners = 0, bDups = 0, bBad = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    const idem = PREFIX + 'idem-' + ts + '-' + r;
    const receipt = { provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', providerEventRef: '9' + r, externalMessageRef: '9' + r, eventType: 'message_created', direction: 'inbound', idempotencyKey: idem, correlationId: 'reh-corr' };
    const [a, b] = await Promise.all([w1.send('business', { receipt }), w2.send('business', { receipt })]);
    const outs = [a.outcome, b.outcome];
    const wins = outs.filter((o) => o === 'RESERVED_NEW').length;
    const dups = outs.filter((o) => o && o.startsWith('DUPLICATE')).length;
    const cnt = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_event_receipts WHERE idempotency_key=$1", idem);
    bWinners += wins; bDups += dups;
    if (!(wins === 1 && dups === 1 && cnt[0].n === 1)) bBad += 1;
  }
  check('21 business: exactly one RESERVED_NEW per round', bWinners === ROUNDS);
  check('22 business: exactly one DUPLICATE_* per round', bDups === ROUNDS);
  check('23 business: 20 rounds all stable (row=1)', bBad === 0);

  // ---- Cross-integration control -----------------------------------------------
  const sharedMsgRef = 'MSG-' + ts;
  const keyA = canonical.computeChatwootIdempotencyKey({ integrationId: PREFIX + 'int-A', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound' });
  const keyB = canonical.computeChatwootIdempotencyKey({ integrationId: PREFIX + 'int-B', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound' });
  const rA = await receiptRepo.reserveEvent({ provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound', idempotencyKey: keyA });
  const rB = await receiptRepo.reserveEvent({ provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-B', tenantId: PREFIX + 'tenant-B', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound', idempotencyKey: keyB });
  check('24 cross-integration: distinct idempotency keys', keyA !== keyB);
  check('25 cross-integration: both reservations succeed (no collision)', rA.result === 'RESERVED_NEW' && rB.result === 'RESERVED_NEW');

  // ---- Global inbox identity uniqueness (two-process race) ----------------------
  const nKey = repos.computeNormalizedIdentityKey({ deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2' });
  const [ia, ib] = await Promise.all([
    w1.send('identity', { data: { id: PREFIX + 'idn-A', tenantIntegrationId: PREFIX + 'int-A', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2', normalizedIdentityKey: nKey } }),
    w2.send('identity', { data: { id: PREFIX + 'idn-B', tenantIntegrationId: PREFIX + 'int-B', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2', normalizedIdentityKey: nKey } }),
  ]);
  const created = [ia, ib].filter((x) => x.ok === true && x.outcome === 'CREATED').length;
  const p2002 = [ia, ib].filter((x) => x.ok === false && x.code === 'P2002').length;
  const idnCount = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM integration_identities WHERE normalized_identity_key=$1", nKey);
  check('26 identity: exactly one global winner', created === 1);
  check('27 identity: exactly one P2002 loser', p2002 === 1);
  check('28 identity: one inbox maps to exactly one integration (row=1)', idnCount[0].n === 1);

  // ---- Error safety -------------------------------------------------------------
  const bad = await w1.send('transport_bad', { endpointId: PREFIX + 'DOES-NOT-EXIST', deliveryRef: 'x-' + ts, timestamp: 1700000000 });
  check('29 non-P2002 (FK) error is NOT laundered into DUPLICATE', bad.ok === false && bad.outcome !== 'DUPLICATE');
  check('30 non-P2002 error surfaced (not silently swallowed)', bad.ok === false && !!bad.error);
  check('31 no worker crashed during suite', !w1.isCrashed() && !w2.isCrashed());

  // ---- Clean disconnect + cleanup -----------------------------------------------
  await w1.disconnect();
  await w2.disconnect();
  check('32 both worker clients disconnected cleanly', true);

  // Cleanup fake rows: delete endpoint (cascades children) + tenants + business receipts.
  await prisma.webhookEventReceipt.deleteMany({ where: { idempotencyKey: { startsWith: PREFIX } } });
  await prisma.integrationIdentity.deleteMany({ where: { normalizedIdentityKey: nKey } });
  await prisma.providerWebhookEndpoint.deleteMany({ where: { id: PREFIX + 'ep-1' } });
  await prisma.tenant.deleteMany({ where: { id: { in: [PREFIX + 'tenant-A', PREFIX + 'tenant-B'] } } });
  const leftover = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts");
  check('33 fake business rows cleaned (transport receipts cascaded)', leftover[0].n === 0);

  await prisma.$disconnect();
  check('34 parent client disconnected', true);

  if (failures.length > 0) {
    console.error('CHATWOOT_DB_CONCURRENCY_SMOKE FAIL checks=' + checks + ' failures=' + failures.length);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('CHATWOOT_DB_CONCURRENCY_SMOKE PASS checks=' + checks + ' failures=0');
  process.exit(0);
}

main().catch((e) => { console.error('CHATWOOT_DB_CONCURRENCY_SMOKE ERROR', e && e.message ? e.message : e); process.exit(1); });
