'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const executor = require('./tenant-backfill-executor');
const {
  ADAPTER_CODE,
} = require('./tenant-backfill-prisma-adapter');
const safety = require('./tenant-backfill-operational-safety');
const {
  COMPOSITION_CODE,
  LIVE_WRITE_ENABLED,
  prepareTenantBackfillOperation,
  composeTenantBackfillApply,
  composeTenantBackfillRollback,
  recoverTenantBackfillOperation,
} = require('./tenant-backfill-safe-composition');

const NOW = '2026-07-18T00:10:00.000Z';
const TARGET = 'bbotech-local-sanitized';
const PLAN_HASH = 'a'.repeat(64);
const TARGET_IDENTITY = {
  target: TARGET,
  environmentClass: 'LOCAL',
  hostClass: 'LOCAL',
  databaseName: 'bbotech_local_db',
  provider: 'postgresql',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function action(recordId, newTenantId = 'tenant_A') {
  return {
    model: 'FacebookPage',
    recordId,
    oldTenantId: null,
    newTenantId,
    status: 'READY',
    mappingSource: 'fixture',
    evidence: ['fixture'],
  };
}

function buildPlan(actions) {
  const summary = actions.reduce((acc, item) => {
    acc.total += 1;
    acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
    acc.byModel[item.model] = (acc.byModel[item.model] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {}, byModel: {} });
  return {
    version: 1,
    planHash: PLAN_HASH,
    summary,
    validationErrors: [],
    actions,
  };
}

function noActionPlan() {
  return buildPlan([
    {
      model: 'FacebookPage',
      recordId: 'page_skip',
      oldTenantId: null,
      newTenantId: null,
      status: 'SKIP_NO_MAPPING',
      mappingSource: null,
      evidence: [],
    },
  ]);
}

function makeApproval(plan, overrides = {}) {
  return {
    version: 1,
    approvalId: 'approval-fixture',
    target: TARGET,
    planHash: plan.planHash,
    execHash: executor.computePlanExecHash(plan),
    approvedBy: 'operator-fixture',
    approvedAt: '2026-07-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:50:00.000Z',
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

function baseArgs({ baseDir, plan, approval, repository, filesystemSafety, ledger, nonce = 'nonce-fixture', logger = null } = {}) {
  const targetPlan = plan || buildPlan([action('page_1')]);
  return {
    plan: targetPlan,
    expectedExecHash: executor.computePlanExecHash(targetPlan),
    approval: approval || makeApproval(targetPlan),
    target: TARGET,
    confirmTarget: TARGET,
    targetIdentity: TARGET_IDENTITY,
    baseDir,
    repository,
    filesystemSafety,
    clock: () => NOW,
    nonceFactory: () => nonce,
    logger,
    completedOperationsLedger: ledger,
  };
}

function createRepository({ applyResults = [], rollbackResults = [], applyError = null, rollbackError = null, trace = [] } = {}) {
  const applyQueue = [...applyResults];
  const rollbackQueue = [...rollbackResults];
  const calls = [];
  return {
    calls,
    async applyOwnerTransition(input) {
      trace.push(`repo.apply:${input.recordId}`);
      calls.push({ method: 'applyOwnerTransition', input: clone(input) });
      if (applyError) throw applyError;
      if (applyQueue.length > 0) {
        const next = applyQueue.shift();
        if (next instanceof Error) throw next;
        return next;
      }
      return true;
    },
    async rollbackOwnerTransition(input) {
      trace.push(`repo.rollback:${input.recordId}`);
      calls.push({ method: 'rollbackOwnerTransition', input: clone(input) });
      if (rollbackError) throw rollbackError;
      if (rollbackQueue.length > 0) {
        const next = rollbackQueue.shift();
        if (next instanceof Error) throw next;
        return next;
      }
      return true;
    },
  };
}

function createFsSafety({ trace = [], failAppend = null, failFinalize = false } = {}) {
  return {
    async createPendingJournal(args) {
      trace.push('fs.createPendingJournal:before');
      const result = await safety.createPendingJournal(args);
      trace.push('fs.createPendingJournal:after');
      return result;
    },
    async appendJournalEvent(args) {
      trace.push(`fs.append:${args.eventType}:before`);
      if (failAppend && failAppend(args)) {
        throw new safety.OperationalSafetyError(safety.OPERATIONAL_CODE.JOURNAL_WRITE_FAILED, 'Injected append failure');
      }
      const result = await safety.appendJournalEvent(args);
      trace.push(`fs.append:${args.eventType}:after`);
      return result;
    },
    async finalizeRollbackManifest(args) {
      trace.push('fs.finalizeManifest:before');
      if (failFinalize) {
        throw new safety.OperationalSafetyError(safety.OPERATIONAL_CODE.MANIFEST_WRITE_FAILED, 'Injected manifest failure');
      }
      const result = await safety.finalizeRollbackManifest(args);
      trace.push('fs.finalizeManifest:after');
      return result;
    },
    async inspectRecoveryState(args) {
      trace.push('fs.inspectRecoveryState');
      return safety.inspectRecoveryState(args);
    },
    async pathExists(filePath) {
      return fs.existsSync(filePath);
    },
    async readManifest(manifestPath) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    },
  };
}

function createLogger() {
  const calls = [];
  return {
    calls,
    info(label, safeMeta) { calls.push({ level: 'info', label, safeMeta }); },
    warn(label, safeMeta) { calls.push({ level: 'warn', label, safeMeta }); },
    error(label, safeMeta) { calls.push({ level: 'error', label, safeMeta }); },
  };
}

function createLedger({ hasApproval = false, trace = [] } = {}) {
  const records = [];
  return {
    records,
    async hasApproval() {
      return hasApproval;
    },
    async recordCompletion(record) {
      trace.push('ledger.recordCompletion');
      records.push(clone(record));
    },
  };
}

function readEvents(journalPath) {
  return fs.readFileSync(journalPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function eventTypes(journalPath) {
  return readEvents(journalPath).map((event) => event.eventType);
}

function indexOfTrace(trace, pattern) {
  return trace.findIndex((entry) => entry.includes(pattern));
}

function hasUnsafeLoggerKey(value) {
  const unsafe = /(secret|token|databaseurl|connectionstring|raw|payload|message|content|phone|email|fbuserid|fbusername|customername|customerid)/i;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasUnsafeLoggerKey);
  return Object.entries(value).some(([key, item]) => unsafe.test(key) || hasUnsafeLoggerKey(item));
}

async function caseBase(tmpRoot, label) {
  const dir = path.join(tmpRoot, label.replace(/[^a-z0-9_-]/gi, '_'));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function run() {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-safe-composition-'));
  const results = [];
  const record = async (name, fn) => {
    await fn(await caseBase(tmpRoot, name));
    results.push(`PASS - ${name}`);
  };

  await record('1 Valid authority prepares operation', async (baseDir) => {
    const repo = createRepository();
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, repository: repo }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, COMPOSITION_CODE.PREPARED);
    assert.ok(result.context.operationId);
    assert.strictEqual(result.context.readyActions.length, 1);
    assert.strictEqual(fs.existsSync(result.context.journalPath), true);
    assert.deepStrictEqual(eventTypes(result.context.journalPath), [safety.JOURNAL_EVENT.OPERATION_PREPARED]);
    assert.strictEqual(repo.calls.length, 0);
  });

  await record('2 Invalid approval -> zero journal/repository call', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace });
    const plan = buildPlan([action('page_2')]);
    const result = await prepareTenantBackfillOperation(baseArgs({
      baseDir,
      plan,
      approval: makeApproval(plan, { planHash: 'b'.repeat(64) }),
      repository: repo,
      filesystemSafety: createFsSafety({ trace }),
    }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.phase, 'AUTHORITY');
    assert.strictEqual(repo.calls.length, 0);
    assert.strictEqual(trace.some((entry) => entry.includes('createPendingJournal')), false);
  });

  await record('3 Target mismatch -> zero journal/repository call', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace });
    const args = baseArgs({ baseDir, repository: repo, filesystemSafety: createFsSafety({ trace }) });
    const result = await prepareTenantBackfillOperation({ ...args, confirmTarget: 'other-target' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.TARGET_CONFIRMATION_FAILED);
    assert.strictEqual(repo.calls.length, 0);
    assert.strictEqual(trace.some((entry) => entry.includes('createPendingJournal')), false);
  });

  await record('4 Existing completed approval -> reject', async (baseDir) => {
    const ledger = createLedger({ hasApproval: true });
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, ledger }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.APPROVAL_REUSED);
  });

  await record('5 NO_ACTION_REQUIRED -> zero repository call', async (baseDir) => {
    const plan = noActionPlan();
    const repo = createRepository();
    const result = await prepareTenantBackfillOperation(baseArgs({
      baseDir,
      plan,
      approval: makeApproval(plan, { allowedModels: [], maxActions: 0 }),
      repository: repo,
    }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, ADAPTER_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(repo.calls.length, 0);
    assert.strictEqual(result.context.journalPath, null);
  });

  await record('6 ACTION_PENDING durable before mutation', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace });
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: repo, filesystemSafety: createFsSafety({ trace }) }));
    assert.strictEqual(result.ok, true);
    assert.ok(indexOfTrace(trace, 'fs.append:ACTION_PENDING:after') < indexOfTrace(trace, 'repo.apply:page_1'));
  });

  await record('7 Mutation not called if journal append fail', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace });
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: repo,
      filesystemSafety: createFsSafety({
        trace,
        failAppend: (args) => args.eventType === safety.JOURNAL_EVENT.ACTION_PENDING,
      }),
    }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.JOURNAL_WRITE_FAILED);
    assert.strictEqual(repo.calls.length, 0);
  });

  await record('8 ACTION_DB_COMMITTED only after APPLIED', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace, applyResults: [true] });
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: repo, filesystemSafety: createFsSafety({ trace }) }));
    assert.strictEqual(result.ok, true);
    assert.ok(indexOfTrace(trace, 'repo.apply:page_1') < indexOfTrace(trace, 'fs.append:ACTION_DB_COMMITTED:before'));
  });

  await record('9 Manifest finalize before ACTION_MANIFEST_RECORDED', async (baseDir) => {
    const trace = [];
    const repo = createRepository({ trace });
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: repo, filesystemSafety: createFsSafety({ trace }) }));
    assert.strictEqual(result.ok, true);
    assert.ok(indexOfTrace(trace, 'fs.finalizeManifest:after') < indexOfTrace(trace, 'fs.append:ACTION_MANIFEST_RECORDED:before'));
  });

  await record('10 OPERATION_COMPLETED is last event', async (baseDir) => {
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: createRepository() }));
    assert.strictEqual(result.ok, true);
    const types = eventTypes(result.context.journalPath);
    assert.strictEqual(types.at(-1), safety.JOURNAL_EVENT.OPERATION_COMPLETED);
  });

  await record('11 Happy path one action', async (baseDir) => {
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: createRepository() }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.manifest.actions.length, 1);
  });

  await record('12 Happy path multiple actions', async (baseDir) => {
    const plan = buildPlan([action('page_12a'), action('page_12b', 'tenant_B')]);
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      plan,
      approval: makeApproval(plan),
      repository: createRepository(),
      nonce: 'multi',
    }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results.length, 2);
    assert.strictEqual(result.manifest.actions.length, 2);
  });

  await record('13 Write conflict -> ACTION_CONFLICT no manifest entry', async (baseDir) => {
    const plan = buildPlan([action('page_conflict'), action('page_apply')]);
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      plan,
      approval: makeApproval(plan),
      repository: createRepository({ applyResults: [false, true] }),
      nonce: 'conflict',
    }));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results[0].status, executor.APPLY_STATUS.SKIP_WRITE_CONFLICT);
    assert.strictEqual(result.manifest.actions.length, 1);
    assert.strictEqual(result.manifest.actions[0].recordId, 'page_apply');
    assert.ok(eventTypes(result.context.journalPath).includes(safety.JOURNAL_EVENT.ACTION_CONFLICT));
  });

  await record('14 Adapter failure -> ACTION_FAILED stop', async (baseDir) => {
    const error = new Error('raw adapter text must not escape');
    error.code = 'DATABASE_UNAVAILABLE';
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: createRepository({ applyError: error }),
    }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.ACTION_FAILED);
    assert.ok(eventTypes(result.context.journalPath).includes(safety.JOURNAL_EVENT.ACTION_FAILED));
  });

  await record('15 Commit unknown -> RECOVERY_REQUIRED no retry', async (baseDir) => {
    const repo = createRepository({ applyResults: [{ status: COMPOSITION_CODE.COMMIT_STATE_UNKNOWN }] });
    const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: repo }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.COMMIT_STATE_UNKNOWN);
    assert.strictEqual(repo.calls.length, 1);
    assert.ok(eventTypes(result.context.journalPath).includes(safety.JOURNAL_EVENT.OPERATION_RECOVERY_REQUIRED));
  });

  await record('16 DB applied + manifest fail -> recovery required', async (baseDir) => {
    const trace = [];
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: createRepository({ trace }),
      filesystemSafety: createFsSafety({ trace, failFinalize: true }),
    }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.RECOVERY_REQUIRED);
    assert.ok(eventTypes(result.context.journalPath).includes(safety.JOURNAL_EVENT.OPERATION_RECOVERY_REQUIRED));
  });

  await record('17 Completion ledger only after completed', async (baseDir) => {
    const trace = [];
    const ledger = createLedger({ trace });
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: createRepository({ trace }),
      filesystemSafety: createFsSafety({ trace }),
      ledger,
    }));
    assert.strictEqual(result.ok, true);
    assert.ok(indexOfTrace(trace, 'fs.append:OPERATION_COMPLETED:after') < indexOfTrace(trace, 'ledger.recordCompletion'));
    assert.strictEqual(ledger.records.length, 1);
  });

  await record('18 Existing PREPARED_NO_DB_WRITE -> operator decision required', async (baseDir) => {
    await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-prepared' }));
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-prepared' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.OPERATION_PREPARED_REQUIRES_OPERATOR_DECISION);
  });

  await record('19 Existing DB_COMMITTED_MANIFEST_PENDING -> recovery required', async (baseDir) => {
    const prepared = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-pending' }));
    await safety.appendJournalEvent({ journalPath: prepared.context.journalPath, operation: prepared.context.operation, eventType: safety.JOURNAL_EVENT.ACTION_PENDING, timestamp: NOW });
    await safety.appendJournalEvent({ journalPath: prepared.context.journalPath, operation: prepared.context.operation, eventType: safety.JOURNAL_EVENT.ACTION_DB_COMMITTED, timestamp: NOW });
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-pending' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.RECOVERY_REQUIRED);
  });

  await record('20 Existing completed journal -> reject reuse', async (baseDir) => {
    const prepared = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-completed' }));
    await safety.appendJournalEvent({ journalPath: prepared.context.journalPath, operation: prepared.context.operation, eventType: safety.JOURNAL_EVENT.OPERATION_COMPLETED, timestamp: NOW });
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'existing-completed' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.OPERATION_COMPLETED_REJECTED);
  });

  await record('21 Corrupted journal -> stop', async (baseDir) => {
    const prepared = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'corrupt' }));
    const corrupted = fs.readFileSync(prepared.context.journalPath, 'utf8').replace(safety.JOURNAL_EVENT.OPERATION_PREPARED, safety.JOURNAL_EVENT.ACTION_FAILED);
    fs.writeFileSync(prepared.context.journalPath, corrupted, 'utf8');
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, nonce: 'corrupt' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.JOURNAL_CORRUPTED);
  });

  await record('22 Existing immutable manifest -> no overwrite', async (baseDir) => {
    const plan = buildPlan([action('page_manifest')]);
    const approval = makeApproval(plan);
    const operation = safety.buildOperationIdentity({
      approval,
      planHash: plan.planHash,
      execHash: executor.computePlanExecHash(plan),
      target: TARGET,
      targetIdentity: TARGET_IDENTITY,
      nonce: 'manifest-exists',
      now: NOW,
    });
    const manifestDir = path.join(baseDir, 'tenant-backfill-manifests');
    const manifestPath = path.join(manifestDir, `${operation.operationId}.manifest.json`);
    await fsp.mkdir(manifestDir, { recursive: true });
    fs.writeFileSync(manifestPath, '{"immutable":true}\n', 'utf8');
    const result = await prepareTenantBackfillOperation(baseArgs({ baseDir, plan, approval, nonce: 'manifest-exists' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, COMPOSITION_CODE.MANIFEST_ALREADY_EXISTS);
    assert.strictEqual(fs.readFileSync(manifestPath, 'utf8'), '{"immutable":true}\n');
  });

  async function makeAppliedForRollback(baseDir, label = 'rollback') {
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: createRepository(),
      nonce: label,
    }));
    assert.strictEqual(result.ok, true);
    return result;
  }

  await record('23 Rollback only manifest actions', async (baseDir) => {
    const applied = await makeAppliedForRollback(baseDir, 'rollback-only');
    const trace = [];
    const repo = createRepository({ trace, rollbackResults: [true] });
    const result = await composeTenantBackfillRollback({
      manifest: applied.manifest,
      journalPath: applied.context.journalPath,
      repository: repo,
      approval: makeApproval(buildPlan([action('page_1')])),
      confirmTarget: TARGET,
      targetIdentity: TARGET_IDENTITY,
      clock: () => NOW,
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(repo.calls.map((call) => call.input.recordId), ['page_1']);
  });

  await record('24 Rollback conflict does not overwrite', async (baseDir) => {
    const applied = await makeAppliedForRollback(baseDir, 'rollback-conflict');
    const result = await composeTenantBackfillRollback({
      manifest: applied.manifest,
      journalPath: applied.context.journalPath,
      repository: createRepository({ rollbackResults: [false] }),
      approval: makeApproval(buildPlan([action('page_1')])),
      confirmTarget: TARGET,
      targetIdentity: TARGET_IDENTITY,
      clock: () => NOW,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.results[0].status, executor.ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT);
  });

  await record('25 Rollback adapter failure recorded safely', async (baseDir) => {
    const applied = await makeAppliedForRollback(baseDir, 'rollback-fail');
    const error = new Error('raw rollback error');
    error.code = 'DATABASE_UNAVAILABLE';
    const result = await composeTenantBackfillRollback({
      manifest: applied.manifest,
      journalPath: applied.context.journalPath,
      repository: createRepository({ rollbackError: error }),
      approval: makeApproval(buildPlan([action('page_1')])),
      confirmTarget: TARGET,
      targetIdentity: TARGET_IDENTITY,
      clock: () => NOW,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.safeErrorCode, 'DATABASE_UNAVAILABLE');
    assert.ok(eventTypes(applied.context.journalPath).includes(safety.JOURNAL_EVENT.ACTION_FAILED));
  });

  await record('26 Rollback does not use action outside manifest', async (baseDir) => {
    const applied = await makeAppliedForRollback(baseDir, 'rollback-outside');
    const manifest = clone(applied.manifest);
    manifest.actions = [manifest.actions[0]];
    const repo = createRepository({ rollbackResults: [true] });
    const result = await composeTenantBackfillRollback({
      manifest,
      journalPath: applied.context.journalPath,
      repository: repo,
      approval: makeApproval(buildPlan([action('page_1')])),
      confirmTarget: TARGET,
      targetIdentity: TARGET_IDENTITY,
      clock: () => NOW,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(repo.calls.length, 1);
    assert.strictEqual(repo.calls[0].input.recordId, manifest.actions[0].recordId);
  });

  await record('27 Import module has no side effect', async () => {
    require('./tenant-backfill-safe-composition');
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('28 No PrismaClient', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('29 No external call', async (baseDir) => {
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    global.fetch = () => { fetchCalls += 1; throw new Error('network forbidden'); };
    try {
      const result = await composeTenantBackfillApply(baseArgs({ baseDir, repository: createRepository(), nonce: 'no-network' }));
      assert.strictEqual(result.ok, true);
      assert.strictEqual(fetchCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await record('30 Logger receives no unsafe fields', async (baseDir) => {
    const logger = createLogger();
    const result = await composeTenantBackfillApply(baseArgs({
      baseDir,
      repository: createRepository(),
      logger,
      nonce: 'logger',
    }));
    assert.strictEqual(result.ok, true);
    assert.ok(logger.calls.length > 0);
    for (const call of logger.calls) {
      assert.strictEqual(hasUnsafeLoggerKey(call.safeMeta), false);
      assert.strictEqual(JSON.stringify(call.safeMeta).includes('page_1'), false);
    }
  });

  await record('31 Live lock remains active', async () => {
    assert.strictEqual(LIVE_WRITE_ENABLED, false);
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
    assert.strictEqual(executor.assertLiveApplyGate({ plan: 'p', expectedPlanHash: 'h', approvalFile: 'a', manifestOutput: 'm', confirmTarget: 't' }).blocked, true);
  });

  await fsp.rm(tmpRoot, { recursive: true, force: true });
  return results;
}

run()
  .then((results) => {
    for (const line of results) console.log(line);
    console.log(`tenant-backfill-safe-composition-smoke: MOCK_PASS (${results.length} checks)`);
    process.exit(0);
  })
  .catch(() => {
    console.error('tenant-backfill-safe-composition-smoke: FAIL - ASSERTION_FAILED');
    process.exit(1);
  });
