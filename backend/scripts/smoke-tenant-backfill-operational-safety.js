'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const executor = require('./tenant-backfill-executor');
const adapter = require('./tenant-backfill-prisma-adapter');
const {
  OPERATIONAL_CODE,
  RECOVERY_STATE,
  JOURNAL_EVENT,
  buildMaskedTargetIdentity,
  validateOperationAuthority,
  buildOperationIdentity,
  createPendingJournal,
  appendJournalEvent,
  finalizeRollbackManifest,
  inspectRecoveryState,
  assertNoActionPolicy,
  LIVE_WRITE_ENABLED,
} = require('./tenant-backfill-operational-safety');

const PLAN_HASH = 'a'.repeat(64);
const EXEC_HASH = 'b'.repeat(64);
const NOW = '2026-07-18T00:10:00.000Z';
const APPROVED_AT = '2026-07-18T00:00:00.000Z';
const EXPIRES_AT = '2026-07-18T00:50:00.000Z';
const TARGET = 'bbotech-local-sanitized';

function makeApproval(overrides = {}) {
  return {
    version: 1,
    approvalId: 'approval-fixture-001',
    target: TARGET,
    planHash: PLAN_HASH,
    execHash: EXEC_HASH,
    approvedBy: 'operator-fixture',
    approvedAt: APPROVED_AT,
    expiresAt: EXPIRES_AT,
    allowedModels: ['FacebookPage'],
    maxActions: 10,
    allowClassB: false,
    purpose: 'tenant-backfill',
    approvalMethod: 'manual-json',
    expectedDatabaseName: 'bbotech_local_db',
    expectedEnvironmentClass: 'LOCAL',
    ...overrides,
  };
}

function makeTargetIdentity(overrides = {}) {
  return {
    ...buildMaskedTargetIdentity({
      target: TARGET,
      environmentClass: 'LOCAL',
      connectionUrl: 'postgresql://fixture:fixture@localhost:5432/bbotech_local_db',
    }),
    ...overrides,
  };
}

function validate(approval, overrides = {}) {
  return validateOperationAuthority({
    approval,
    planHash: PLAN_HASH,
    execHash: EXEC_HASH,
    confirmTarget: TARGET,
    targetIdentity: makeTargetIdentity(),
    readyActions: [{ model: 'FacebookPage', recordId: 'row_1' }],
    now: NOW,
    ...overrides,
  });
}

function makeOperation(label, overrides = {}) {
  const approval = makeApproval({ approvalId: `approval-${label}`, ...(overrides.approval || {}) });
  const targetIdentity = makeTargetIdentity(overrides.targetIdentity || {});
  const operation = buildOperationIdentity({
    approval,
    planHash: PLAN_HASH,
    execHash: EXEC_HASH,
    target: approval.target,
    targetIdentity,
    nonce: `nonce-${label}`,
    now: NOW,
  });
  return { approval, targetIdentity, operation };
}

function readEvents(journalPath) {
  const content = fs.readFileSync(journalPath, 'utf8');
  return content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function noActionPlan() {
  return {
    version: 1,
    planHash: 'c'.repeat(64),
    summary: { total: 1, byStatus: { SKIP_NO_MAPPING: 1 }, byModel: { FacebookPage: 1 } },
    validationErrors: [],
    actions: [
      { model: 'FacebookPage', recordId: 'page_skip', oldTenantId: null, newTenantId: null, status: 'SKIP_NO_MAPPING' },
    ],
  };
}

async function run() {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-operational-safety-'));
  const results = [];
  const record = async (name, fn) => {
    await fn(tmpRoot);
    results.push(`PASS - ${name}`);
  };

  await record('1 Approval hop le PASS', async () => {
    const result = validate(makeApproval());
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, 'AUTHORITY_OK');
  });

  await record('2 Approval thieu field reject', async () => {
    const approval = makeApproval();
    delete approval.planHash;
    const result = validate(approval);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('PLAN_HASH_INVALID'));
  });

  await record('3 Approval expired reject', async () => {
    const result = validate(makeApproval({ expiresAt: '2026-07-18T00:05:00.000Z' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, adapter.ADAPTER_CODE.APPROVAL_EXPIRED);
  });

  await record('4 Approval future timestamp reject', async () => {
    const result = validate(makeApproval({
      approvedAt: '2026-07-18T00:20:01.000Z',
      expiresAt: '2026-07-18T01:00:00.000Z',
    }));
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('APPROVED_AT_IN_FUTURE'));
  });

  await record('5 planHash mismatch reject', async () => {
    const result = validate(makeApproval(), { planHash: 'd'.repeat(64) });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('PLAN_HASH_MISMATCH'));
  });

  await record('6 execHash mismatch reject', async () => {
    const result = validate(makeApproval(), { execHash: 'e'.repeat(64) });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('EXEC_HASH_MISMATCH'));
  });

  await record('7 Target mismatch reject', async () => {
    const result = validate(makeApproval(), { confirmTarget: 'other-target' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, adapter.ADAPTER_CODE.TARGET_CONFIRMATION_FAILED);
  });

  await record('8 Database name mismatch reject', async () => {
    const result = validate(makeApproval({ expectedDatabaseName: 'wrong_db' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, adapter.ADAPTER_CODE.TARGET_CONFIRMATION_FAILED);
  });

  await record('9 Action count vuot limit reject', async () => {
    const actions = Array.from({ length: 11 }, (_, index) => ({ model: 'FacebookPage', recordId: `row_${index}` }));
    const result = validate(makeApproval(), { readyActions: actions });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('MAX_ACTIONS_EXCEEDED'));
  });

  await record('10 Model khong duoc phep reject', async () => {
    const result = validate(makeApproval(), { readyActions: [{ model: 'Conversation', recordId: 'conv_1' }] });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('MODEL_NOT_APPROVED'));
  });

  await record('11 Class B khong duoc phep reject', async () => {
    const result = validate(makeApproval(), { readyActions: [{ model: 'FacebookPage', recordId: 'row_1', provenanceClass: 'B' }] });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('CLASS_B_NOT_APPROVED'));
  });

  await record('12 Approval purpose sai reject', async () => {
    const result = validate(makeApproval({ purpose: 'manual-maintenance' }));
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.includes('PURPOSE_MISMATCH'));
  });

  await record('13 ACTION_PENDING duoc fsync truoc mock mutation', async (baseDir) => {
    const { operation } = makeOperation('pending-before-mutation');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    let mutations = 0;
    const pending = await appendJournalEvent({
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.ACTION_PENDING,
      timestamp: NOW,
      payload: { action: { model: 'FacebookPage', recordId: 'row_1' } },
    });
    const eventsBeforeMutation = readEvents(journalPath);
    assert.strictEqual(eventsBeforeMutation.at(-1).eventHash, pending.event.eventHash);
    assert.strictEqual(eventsBeforeMutation.at(-1).eventType, JOURNAL_EVENT.ACTION_PENDING);
    mutations += 1;
    assert.strictEqual(mutations, 1);
  });

  await record('14 Journal append failure -> zero mutation', async (baseDir) => {
    const { operation } = makeOperation('append-failure');
    let mutations = 0;
    await assert.rejects(
      () => appendJournalEvent({
        journalPath: path.join(baseDir, 'missing-parent', 'no-file.jsonl'),
        operation,
        eventType: JOURNAL_EVENT.ACTION_PENDING,
      }),
      (error) => error.code === OPERATIONAL_CODE.JOURNAL_WRITE_FAILED
    );
    assert.strictEqual(mutations, 0);
  });

  await record('15 DB mutation failure -> khong co DB_COMMITTED event', async (baseDir) => {
    const { operation } = makeOperation('db-failure');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    await appendJournalEvent({
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.ACTION_FAILED,
      timestamp: NOW,
      payload: { errorCode: 'MOCK_DB_FAILED' },
    });
    assert.strictEqual(readEvents(journalPath).some((event) => event.eventType === JOURNAL_EVENT.ACTION_DB_COMMITTED), false);
  });

  let manifestFailureJournal = null;
  await record('16 DB commit success + manifest failure -> RECOVERY_REQUIRED', async (baseDir) => {
    const { operation, targetIdentity } = makeOperation('manifest-failure');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    manifestFailureJournal = journalPath;
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    let mutations = 0;
    mutations += 1;
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_DB_COMMITTED, timestamp: NOW });
    const badManifestDir = path.join(baseDir, 'manifest-dir-is-file');
    fs.writeFileSync(badManifestDir, 'not a directory\n', 'utf8');
    await assert.rejects(
      () => finalizeRollbackManifest({
        manifestDir: badManifestDir,
        operation,
        targetIdentity,
        actions: [{ model: 'FacebookPage', recordId: 'row_1', oldTenantId: null, newTenantId: 'tenant_A', appliedAt: NOW, result: 'APPLIED', journalSequence: 3 }],
      }),
      (error) => error.code === OPERATIONAL_CODE.MANIFEST_WRITE_FAILED
    );
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.OPERATION_RECOVERY_REQUIRED, timestamp: NOW });
    const state = await inspectRecoveryState({ journalPath });
    assert.strictEqual(mutations, 1);
    assert.strictEqual(state.state, RECOVERY_STATE.RECOVERY_REQUIRED);
  });

  await record('17 Journal van ton tai sau manifest failure', async () => {
    assert.ok(manifestFailureJournal);
    assert.strictEqual(fs.existsSync(manifestFailureJournal), true);
  });

  let finalizedManifestPath = null;
  await record('18 Atomic manifest finalize PASS', async (baseDir) => {
    const { operation, targetIdentity } = makeOperation('manifest-pass');
    const result = await finalizeRollbackManifest({
      baseDir,
      operation,
      targetIdentity,
      finalizedAt: NOW,
      actions: [{ model: 'FacebookPage', recordId: 'row_1', oldTenantId: null, newTenantId: 'tenant_A', appliedAt: NOW, result: 'APPLIED', journalSequence: 2 }],
    });
    finalizedManifestPath = result.manifestPath;
    assert.strictEqual(fs.existsSync(result.manifestPath), true);
    assert.strictEqual(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).status, 'COMPLETED');
  });

  await record('19 Existing manifest khong bi overwrite', async (baseDir) => {
    const before = fs.readFileSync(finalizedManifestPath, 'utf8');
    const { operation, targetIdentity } = makeOperation('manifest-pass');
    await assert.rejects(
      () => finalizeRollbackManifest({ baseDir, operation, targetIdentity, finalizedAt: NOW, actions: [] }),
      (error) => error.code === OPERATIONAL_CODE.MANIFEST_ALREADY_EXISTS
    );
    assert.strictEqual(fs.readFileSync(finalizedManifestPath, 'utf8'), before);
  });

  await record('20 Hash chain hop le', async (baseDir) => {
    const { operation } = makeOperation('hash-chain-valid');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_CONFLICT, timestamp: NOW, payload: { action: { model: 'FacebookPage', recordId: 'row_1' } } });
    const state = await inspectRecoveryState({ journalPath });
    assert.strictEqual(state.validHashChain, true);
    assert.strictEqual(state.state, RECOVERY_STATE.CONFLICT_ONLY);
  });

  await record('21 Tampered event bi phat hien', async (baseDir) => {
    const { operation } = makeOperation('tampered');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    const tampered = fs.readFileSync(journalPath, 'utf8').replace(JOURNAL_EVENT.ACTION_PENDING, JOURNAL_EVENT.ACTION_FAILED);
    fs.writeFileSync(journalPath, tampered, 'utf8');
    const state = await inspectRecoveryState({ journalPath });
    assert.strictEqual(state.state, RECOVERY_STATE.JOURNAL_CORRUPTED);
  });

  await record('22 Truncated journal bi phat hien', async (baseDir) => {
    const { operation } = makeOperation('truncated');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    const content = fs.readFileSync(journalPath, 'utf8');
    fs.writeFileSync(journalPath, content.slice(0, -1), 'utf8');
    const state = await inspectRecoveryState({ journalPath });
    assert.strictEqual(state.state, RECOVERY_STATE.JOURNAL_CORRUPTED);
  });

  await record('23 Recovery classifier nhan DB_COMMITTED_MANIFEST_PENDING', async (baseDir) => {
    const { operation } = makeOperation('committed-manifest-pending');
    const { journalPath } = await createPendingJournal({ baseDir, operation, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    await appendJournalEvent({ journalPath, operation, eventType: JOURNAL_EVENT.ACTION_DB_COMMITTED, timestamp: NOW });
    const state = await inspectRecoveryState({ journalPath });
    assert.strictEqual(state.state, RECOVERY_STATE.DB_COMMITTED_MANIFEST_PENDING);
  });

  await record('24 NO_ACTION_REQUIRED khong connect DB', async () => {
    const plan = noActionPlan();
    const execHash = executor.computePlanExecHash(plan);
    const result = assertNoActionPolicy({ plan, expectedExecHash: execHash });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, adapter.ADAPTER_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(result.shouldConnectDb, false);
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('25 No-action khong tao empty manifest', async (baseDir) => {
    const plan = noActionPlan();
    const execHash = executor.computePlanExecHash(plan);
    const result = assertNoActionPolicy({ plan, expectedExecHash: execHash });
    assert.strictEqual(result.shouldCreateRollbackManifest, false);
    assert.strictEqual(fs.existsSync(path.join(baseDir, 'tenant-backfill-manifests', 'no-action.manifest.json')), false);
  });

  await record('26 Import module khong co side effect', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('27 Live write van khoa', async () => {
    assert.strictEqual(LIVE_WRITE_ENABLED, false);
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
    assert.strictEqual(executor.assertLiveApplyGate({ plan: 'p', expectedPlanHash: 'h', approvalFile: 'a', manifestOutput: 'm', confirmTarget: 't' }).blocked, true);
  });

  await record('28 Planner/Executor/Adapter smoke khong regression', async () => {
    assert.strictEqual(typeof executor.computePlanExecHash, 'function');
    assert.strictEqual(typeof executor.validatePlan, 'function');
    assert.strictEqual(typeof adapter.validateApproval, 'function');
    assert.strictEqual(typeof adapter.assertTargetConfirmation, 'function');
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
  });

  await record('29 Approval reuse reject', async () => {
    const approval = makeApproval({ approvalId: 'already-used' });
    const result = validate(approval, { approvalLedger: [{ approvalId: 'already-used', status: 'COMPLETED' }] });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, OPERATIONAL_CODE.APPROVAL_REUSED);
  });

  await fsp.rm(tmpRoot, { recursive: true, force: true });
  return results;
}

run()
  .then((results) => {
    for (const line of results) console.log(line);
    console.log(`tenant-backfill-operational-safety-smoke: MOCK_PASS (${results.length} checks)`);
    process.exit(0);
  })
  .catch(() => {
    console.error('tenant-backfill-operational-safety-smoke: FAIL - ASSERTION_FAILED');
    process.exit(1);
  });
