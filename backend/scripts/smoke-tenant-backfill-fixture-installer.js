'use strict';

// Smoke matrix for the locked, idempotent, manifest-scoped fixture installer.
// Mock-only. No PrismaClient, no network, no environment read, no DB mutation.
// All filesystem writes go to an mkdtemp() directory.

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const fb = require('./tenant-backfill-fixture-blueprint');
const executor = require('./tenant-backfill-executor');
const { LIVE_ENTRYPOINT_ENABLED } = require('./tenant-backfill-live-entrypoint');
const inst = require('./tenant-backfill-fixture-installer');

const {
  FIXTURE_INSTALL_ENABLED,
  INSTALLER_LOCKS,
  INSTALLATION_CODE,
  RECOVERY_STATE,
  JOURNAL_EVENT,
  validateInstallationRequest,
  assertTargetGate,
  assertBackupGate,
  validateFixtureBundleForInstall,
  buildFixtureInstallationPlan,
  preflightFixtureInstallation,
  installFixtureBundle,
  inspectFixtureInstallation,
  classifyFixtureRecoveryState,
  cleanupFixtureInstallation,
  computeBundleHash,
  sanitizeInstallerLogMeta,
  createMockInstallerRepository,
} = inst;

const NOW = Date.parse('2026-07-19T00:00:00.000Z');
const CLOCK = () => NOW;
const DEPS = { clock: CLOCK };

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function makeRequest(bundle, dir, overrides = {}) {
  const A = bundle.scenarios.A;
  return {
    fixtureBundle: bundle,
    targetDescriptor: A.targetDescriptor,
    backupProof: A.backupProof,
    confirmTarget: fb.TARGET,
    installationDirectory: dir,
    operatorConfirmation: true,
    ...overrides,
  };
}

function seedFromPlan(plan) {
  return plan.entities.map((e) => ({ model: e.model, recordId: e.recordId, payload: e.payload }));
}

async function readJournalEvents(dir, fixtureId) {
  const p = path.join(dir, 'fixture-installations', `${fixtureId}.installation.journal.jsonl`);
  const content = await fsp.readFile(p, 'utf8');
  return content.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'fixture-installer-smoke-'));
  const results = [];
  let caseIndex = 0;
  const record = async (name, fn) => {
    caseIndex += 1;
    const dir = path.join(root, `c${caseIndex}`);
    await fsp.mkdir(dir, { recursive: true });
    try { await fn(dir); }
    catch (error) { error.message = `[${name}] ${error.message}`; throw error; }
    results.push(`PASS - ${name}`);
  };

  await record('1 Import has no side effect', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('2 Fixture Installer lock false', async () => {
    assert.strictEqual(FIXTURE_INSTALL_ENABLED, false);
  });

  await record('3 Tenant Backfill locks remain false', async () => {
    assert.strictEqual(INSTALLER_LOCKS.LIVE_ENTRYPOINT_ENABLED, false);
    assert.strictEqual(INSTALLER_LOCKS.LIVE_WRITE_ENABLED, false);
    assert.strictEqual(LIVE_ENTRYPOINT_ENABLED, false);
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
  });

  await record('4 Valid bundle validation PASS', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const check = validateFixtureBundleForInstall(bundle);
    assert.strictEqual(check.ok, true, JSON.stringify(check.errors));
    assert.deepStrictEqual(check.expectedCounts, { Tenant: 1, FacebookPage: 2, Conversation: 1, Appointment: 1 });
  });

  await record('5 Invalid bundle hash reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const check = validateFixtureBundleForInstall(bundle, { expectedBundleHash: 'deadbeef' });
    assert.strictEqual(check.code, INSTALLATION_CODE.BUNDLE_HASH_MISMATCH);
  });

  await record('6 Schema fingerprint mismatch reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const check = validateFixtureBundleForInstall(bundle, { expectedSchemaFingerprint: 'wrong-fingerprint' });
    assert.strictEqual(check.code, INSTALLATION_CODE.SCHEMA_FINGERPRINT_MISMATCH);
  });

  await record('7 Target mismatch reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const A = bundle.scenarios.A;
    const gate = assertTargetGate({ confirmTarget: 'other-target', fixtureBundle: bundle, targetDescriptor: A.targetDescriptor, backupProof: A.backupProof });
    assert.strictEqual(gate.code, INSTALLATION_CODE.TARGET_CONFIRMATION_FAILED);
  });

  await record('8 Production target reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const A = bundle.scenarios.A;
    const prodDescriptor = { ...clone(A.targetDescriptor), environmentClass: 'PRODUCTION', hostClass: 'REMOTE' };
    const gate = assertTargetGate({ confirmTarget: fb.TARGET, fixtureBundle: bundle, targetDescriptor: prodDescriptor, backupProof: A.backupProof });
    assert.strictEqual(gate.code, INSTALLATION_CODE.BLOCKED_PRODUCTION_TARGET);
  });

  await record('9 Backup missing reject', async () => {
    assert.strictEqual(assertBackupGate(null, { clock: CLOCK }).code, INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_MISSING);
  });

  await record('10 Backup stale reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const stale = clone(bundle.scenarios.A.backupProof);
    stale.createdAt = new Date(NOW - 48 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(assertBackupGate(stale, { clock: CLOCK }).code, INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_STALE);
  });

  await record('11 Backup hash mismatch reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const proof = clone(bundle.scenarios.A.backupProof);
    proof.artifactHash = 'a'.repeat(64);
    const gate = assertBackupGate(proof, { clock: CLOCK, expectedArtifactHash: 'b'.repeat(64) });
    assert.strictEqual(gate.code, INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_HASH_MISMATCH);
  });

  await record('12 Preflight uses exact-ID query only', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    let getCalls = 0;
    const spy = createMockInstallerRepository();
    for (const m of ['getTenantById', 'getFacebookPageById', 'getConversationById', 'getAppointmentById']) {
      const orig = spy[m];
      spy[m] = async (id) => { getCalls += 1; assert.ok(typeof id === 'string' && id.length > 0); return orig(id); };
    }
    await preflightFixtureInstallation({ plan, repository: spy });
    assert.strictEqual(getCalls, plan.entities.length);
  });

  await record('13 Empty DB gives INSTALLATION_READY', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const pf = await preflightFixtureInstallation({ plan, repository: createMockInstallerRepository() });
    assert.strictEqual(pf.code, INSTALLATION_CODE.INSTALLATION_READY);
  });

  await record('14 Fully matching gives FIXTURE_ALREADY_INSTALLED', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository({ seed: seedFromPlan(plan) });
    const pf = await preflightFixtureInstallation({ plan, repository: repo });
    assert.strictEqual(pf.code, INSTALLATION_CODE.FIXTURE_ALREADY_INSTALLED);
  });

  await record('15 ID collision reject', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const seed = seedFromPlan(plan).map((s) => clone(s));
    seed[0].payload = { ...seed[0].payload, slug: 'tampered-slug' }; // same id, different state
    const repo = createMockInstallerRepository({ seed });
    const pf = await preflightFixtureInstallation({ plan, repository: repo });
    assert.strictEqual(pf.code, INSTALLATION_CODE.FIXTURE_ID_COLLISION);
  });

  await record('16 Partial fixture gives operator review', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository({ seed: [seedFromPlan(plan)[0]] }); // only Tenant present
    const pf = await preflightFixtureInstallation({ plan, repository: repo });
    assert.strictEqual(pf.code, INSTALLATION_CODE.PARTIAL_FIXTURE_STATE_DETECTED);
  });

  await record('17 Zero create before full preflight', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository({ seed: [seedFromPlan(plan)[0]] });
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    assert.strictEqual(out.code, INSTALLATION_CODE.PARTIAL_FIXTURE_STATE_DETECTED);
    assert.strictEqual(repo._counts().createCalls, 0);
  });

  await record('18 Create order correct', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    const events = await readJournalEvents(dir, bundle.identity.fixtureId);
    const createdModels = events.filter((e) => e.eventType === JOURNAL_EVENT.ENTITY_CREATED).map((e) => e.model);
    assert.deepStrictEqual(createdModels, ['Tenant', 'FacebookPage', 'FacebookPage', 'Conversation', 'Appointment']);
  });

  await record('19 Pending journal before each create', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
    const events = await readJournalEvents(dir, bundle.identity.fixtureId);
    // For every ENTITY_CREATED at sequence N, an ENTITY_CREATE_PENDING at sequence N precedes it.
    for (const created of events.filter((e) => e.eventType === JOURNAL_EVENT.ENTITY_CREATED)) {
      const pendingIdx = events.findIndex((e) => e.eventType === JOURNAL_EVENT.ENTITY_CREATE_PENDING && e.sequence === created.sequence);
      const createdIdx = events.indexOf(created);
      assert.ok(pendingIdx >= 0 && pendingIdx < createdIdx, `pending must precede create seq ${created.sequence}`);
    }
  });

  await record('20 Happy-path installation mock PASS', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
    assert.strictEqual(out.code, INSTALLATION_CODE.INSTALLATION_COMPLETED);
    assert.strictEqual(out.createdCount, 5);
  });

  await record('21 Installation manifest finalized', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
    const manifest = JSON.parse(await fsp.readFile(out.manifestPath, 'utf8'));
    assert.strictEqual(manifest.status, INSTALLATION_CODE.INSTALLATION_COMPLETED);
    assert.strictEqual(manifest.entities.length, 5);
    assert.deepStrictEqual(manifest.cleanupOrder, ['Appointment', 'Conversation', 'FacebookPage', 'Tenant']);
  });

  await record('22 Retry gives zero create', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    const before = repo._counts().createCalls;
    const retry = await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    assert.strictEqual(retry.code, INSTALLATION_CODE.FIXTURE_ALREADY_INSTALLED);
    assert.strictEqual(repo._counts().createCalls, before);
  });

  await record('23 First create failure gives no-mutation failure', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository({ failOn: { model: 'Tenant' } });
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    assert.strictEqual(out.code, INSTALLATION_CODE.INSTALLATION_FAILED_NO_MUTATION);
    assert.strictEqual(out.createdCount, 0);
  });

  await record('24 Mid-install failure gives recovery required', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository({ failOn: { model: 'Conversation' } });
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    assert.strictEqual(out.code, INSTALLATION_CODE.INSTALLATION_RECOVERY_REQUIRED);
    assert.strictEqual(out.createdCount, 3);
  });

  await record('25 No automatic retry', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository({ failOn: { model: 'Conversation' } });
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    // 3 successful creates + 1 failed attempt = 4, and no retry beyond that.
    assert.strictEqual(repo._counts().createCalls, 4);
  });

  await record('26 No automatic cleanup', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const repo = createMockInstallerRepository({ failOn: { model: 'Conversation' } });
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    assert.strictEqual(repo._counts().deleteCalls, 0);
  });

  await record('27 Recovery classifier partial state', async () => {
    const events = [
      { eventType: JOURNAL_EVENT.INSTALLATION_PREPARED },
      { eventType: JOURNAL_EVENT.ENTITY_CREATE_PENDING },
      { eventType: JOURNAL_EVENT.ENTITY_CREATED },
    ];
    assert.strictEqual(classifyFixtureRecoveryState({ events, manifestExists: false }), RECOVERY_STATE.PARTIALLY_INSTALLED);
  });

  await record('28 Corrupted journal detected', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const d = path.join(dir, 'fixture-installations');
    await fsp.mkdir(d, { recursive: true });
    await fsp.writeFile(path.join(d, `${bundle.identity.fixtureId}.installation.journal.jsonl`), '{not-json without newline');
    const insp = await inspectFixtureInstallation({ fixtureId: bundle.identity.fixtureId, installationDirectory: dir });
    assert.strictEqual(insp.journalCorrupted, true);
    assert.strictEqual(insp.state, RECOVERY_STATE.INSTALLATION_JOURNAL_CORRUPTED);
  });

  await record('29 Cleanup only by manifest', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const out = await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true }, { repository: createMockInstallerRepository(), clock: CLOCK });
    assert.strictEqual(out.code, INSTALLATION_CODE.FIXTURE_NOT_INSTALLED);
  });

  await record('30 Cleanup deletes exact IDs only', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    const cl = await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    assert.strictEqual(cl.code, INSTALLATION_CODE.CLEANUP_COMPLETED);
    assert.strictEqual(repo._counts().deleteCalls, 5);
  });

  await record('31 Cleanup verifies state (conflict on tamper)', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    // Tamper the first cleanup entity (Appointment) so its state hash diverges.
    const appt = plan.entities.find((e) => e.model === 'Appointment');
    repo._setRecord('Appointment', appt.recordId, { ...appt.payload, tenantId: 'tampered-tenant' });
    const cl = await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    assert.strictEqual(cl.code, INSTALLATION_CODE.CLEANUP_CONFLICT);
    assert.strictEqual(cl.deletedCount, 0);
  });

  await record('32 Cleanup conflict stops', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    const appt = plan.entities.find((e) => e.model === 'Appointment');
    repo._setRecord('Appointment', appt.recordId, { ...appt.payload, tenantId: 'tampered' });
    await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    // Nothing deleted after the conflict stop (all 5 still present).
    const snap = repo._snapshot();
    const total = snap.Tenant.length + snap.FacebookPage.length + snap.Conversation.length + snap.Appointment.length;
    assert.strictEqual(total, 5);
  });

  await record('33 Cleanup order correct', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    const events = await readJournalEvents(dir, bundle.identity.fixtureId);
    const deletedModels = events.filter((e) => e.eventType === JOURNAL_EVENT.ENTITY_DELETED).map((e) => e.model);
    assert.deepStrictEqual(deletedModels, ['Appointment', 'Conversation', 'FacebookPage', 'FacebookPage', 'Tenant']);
  });

  await record('34 Record outside manifest not deleted', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    repo._setRecord('Tenant', 'unrelated-tenant-id', { id: 'unrelated-tenant-id', slug: 'not-a-fixture', name: 'x', isActive: true });
    await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    assert.deepStrictEqual(repo._snapshot().Tenant, ['unrelated-tenant-id']);
  });

  await record('35 Partial cleanup gives recovery required', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    // Install cleanly to produce a manifest on disk.
    await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
    // Cleanup against a repo that holds installed state but fails the Conversation delete.
    const failing = createMockInstallerRepository({ failOn: { model: 'Conversation' } });
    for (const e of plan.entities) failing._setRecord(e.model, e.recordId, e.payload);
    const cl = await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: failing, clock: CLOCK });
    assert.strictEqual(cl.code, INSTALLATION_CODE.CLEANUP_RECOVERY_REQUIRED);
  });

  await record('36 Cleanup retry idempotent', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    const cleanupReq = { ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan };
    await cleanupFixtureInstallation(cleanupReq, { repository: repo, clock: CLOCK });
    const retry = await cleanupFixtureInstallation(cleanupReq, { repository: repo, clock: CLOCK });
    assert.strictEqual(retry.code, INSTALLATION_CODE.CLEANUP_ALREADY_COMPLETED);
  });

  await record('37 Logger redaction PASS', async () => {
    const safe = sanitizeInstallerLogMeta({ fixtureId: 'x', model: 'Tenant', accessToken: 'SECRET', rawBundle: {}, count: 5, status: 'OK' });
    assert.deepStrictEqual(Object.keys(safe).sort(), ['count', 'fixtureId', 'model', 'status']);
  });

  await record('38 No PrismaClient after full lifecycle', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('39 No environment read', async (dir) => {
    const hits = [];
    const realEnv = process.env;
    const trap = new Proxy(realEnv, { get(t, p) { if (typeof p === 'string' && p !== 'then') hits.push(p); return t[p]; } });
    Object.defineProperty(process, 'env', { value: trap, configurable: true });
    try {
      const bundle = fb.buildFixtureBundle(DEPS);
      await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
      assert.deepStrictEqual(hits, []);
    } finally {
      Object.defineProperty(process, 'env', { value: realEnv, configurable: true });
    }
  });

  await record('40 No network call', async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
    try {
      const bundle = fb.buildFixtureBundle(DEPS);
      await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
      assert.strictEqual(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await record('41 No raw SQL surface', async () => {
    const repo = createMockInstallerRepository();
    assert.strictEqual(repo.$queryRaw, undefined);
    assert.strictEqual(repo.$executeRaw, undefined);
  });

  await record('42 No deleteMany surface', async () => {
    const repo = createMockInstallerRepository();
    assert.strictEqual(repo.deleteMany, undefined);
    assert.strictEqual(repo.createMany, undefined);
    assert.strictEqual(typeof repo.deleteTenant, 'function');
  });

  await record('43 No persistent output outside installation directory', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const out = await installFixtureBundle(makeRequest(bundle, dir), { repository: createMockInstallerRepository(), clock: CLOCK });
    assert.ok(out.manifestPath.startsWith(dir), 'manifest must live under installation directory');
  });

  await record('44 Blueprint bundle not mutated', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const before = JSON.stringify(bundle);
    const plan = buildFixtureInstallationPlan(bundle, DEPS);
    const repo = createMockInstallerRepository();
    await installFixtureBundle(makeRequest(bundle, dir), { repository: repo, clock: CLOCK });
    await cleanupFixtureInstallation({ ...makeRequest(bundle, dir), fixtureId: bundle.identity.fixtureId, allowCleanup: true, plan }, { repository: repo, clock: CLOCK });
    assert.strictEqual(JSON.stringify(bundle), before);
  });

  await record('45 Import cache has no Prisma', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('46 No live CLI or package mutation entrypoint', async () => {
    assert.strictEqual(inst.main, undefined);
    assert.strictEqual(FIXTURE_INSTALL_ENABLED, false);
  });

  await record('47 Request validation rejects missing operator confirmation', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const check = validateInstallationRequest({ ...makeRequest(bundle, dir), operatorConfirmation: false });
    assert.strictEqual(check.ok, false);
    assert.ok(check.errors.includes('OPERATOR_CONFIRMATION_REQUIRED'));
  });

  await record('48 Bundle hash deterministic', async () => {
    const b1 = fb.buildFixtureBundle(DEPS);
    const b2 = fb.buildFixtureBundle(DEPS);
    assert.strictEqual(computeBundleHash(b1), computeBundleHash(b2));
  });

  await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
  for (const line of results) console.log(line);
  console.log(`tenant-backfill-fixture-installer-smoke: MOCK_PASS (${results.length} checks)`);
}

run().catch((error) => {
  console.error('tenant-backfill-fixture-installer-smoke: FAIL');
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
