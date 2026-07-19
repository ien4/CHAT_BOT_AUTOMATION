'use strict';

// Smoke matrix for the locked tenant backfill live entrypoint.
// Mock-only. No PrismaClient, no network, no environment read, no live mutation.

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const executor = require('./tenant-backfill-executor');
const {
  LIVE_ENTRYPOINT_ENABLED,
  MODE,
  ENTRYPOINT_CODE,
  parseEntrypointArgs,
  loadJsonArtifact,
  validateBackupProof,
  runEntrypoint,
} = require('./tenant-backfill-live-entrypoint');

const NOW = Date.parse('2026-07-18T00:10:00.000Z');
const NOW_ISO = new Date(NOW).toISOString();
const TARGET = 'bbotech-local-sanitized';
const PLAN_HASH = 'a'.repeat(64);

function readyAction(recordId = 'page_1', newTenantId = 'tenant_A') {
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
  return { version: 1, planHash: PLAN_HASH, summary, validationErrors: [], actions };
}

function readyPlan() {
  return buildPlan([readyAction()]);
}

function noActionPlan() {
  return buildPlan([{ model: 'FacebookPage', recordId: 'page_skip', oldTenantId: null, newTenantId: null, status: 'SKIP_NO_MAPPING', mappingSource: null, evidence: [] }]);
}

function makeApproval(plan, overrides = {}) {
  return {
    version: 1,
    approvalId: 'approval-fixture-entry',
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
    expectedDatabaseName: 'bbotech_local_db',
    expectedEnvironmentClass: 'LOCAL',
    ...overrides,
  };
}

function makeBackupProof(overrides = {}) {
  return {
    version: 1,
    backupId: 'backup-fixture-001',
    target: TARGET,
    createdAt: '2026-07-18T00:00:00.000Z',
    artifactType: 'pg-dump',
    artifactPath: 'local-sanitized.dump',
    restoreProcedureRef: 'runbook://local/restore',
    databaseName: 'bbotech_local_db',
    operator: 'operator-fixture',
    ...overrides,
  };
}

function makeTargetDescriptor(overrides = {}) {
  return {
    version: 1,
    target: TARGET,
    environmentClass: 'LOCAL',
    hostClass: 'LOCAL_LOOPBACK',
    databaseName: 'bbotech_local_db',
    provider: 'postgresql',
    ...overrides,
  };
}

function writeJson(dir, name, obj, { bom = false } = {}) {
  const filePath = path.join(dir, name);
  const body = JSON.stringify(obj, null, 2);
  const buffer = bom ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')]) : Buffer.from(body, 'utf8');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function fakeStat({ symlink = false, dir = false, file = true, size = 100 } = {}) {
  return {
    size,
    isSymbolicLink: () => symlink,
    isDirectory: () => dir,
    isFile: () => file,
  };
}

// Build a full valid fixture set and the corresponding argv.
function fixture(dir, { plan = readyPlan(), approval, backup = makeBackupProof(), descriptor = makeTargetDescriptor(), mode = MODE.VALIDATE, extra = {} } = {}) {
  const planPath = writeJson(dir, 'plan.json', plan);
  const approvalPath = writeJson(dir, 'approval.json', approval || makeApproval(plan));
  const backupPath = writeJson(dir, 'backup.json', backup);
  const descriptorPath = writeJson(dir, 'descriptor.json', descriptor);
  const ledgerDir = path.join(dir, 'ledger');
  fs.mkdirSync(ledgerDir, { recursive: true });
  const argv = [
    '--mode', mode,
    '--plan', planPath,
    '--approval', approvalPath,
    '--backup-proof', backupPath,
    '--target-descriptor', descriptorPath,
    '--confirm-target', TARGET,
    '--ledger-path', path.join(ledgerDir, 'ledger.jsonl'),
  ];
  return { argv, planPath, approvalPath, backupPath, descriptorPath, ledgerDir, extra };
}

async function caseDir(root, label) {
  const dir = path.join(root, label.replace(/[^a-z0-9_-]/gi, '_'));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-entrypoint-smoke-'));
  const results = [];
  const record = async (name, fn) => {
    try {
      await fn(await caseDir(root, name));
    } catch (error) {
      error.message = `[${name}] ${error.message}`;
      throw error;
    }
    results.push(`PASS - ${name}`);
  };
  const deps = { now: NOW };

  await record('1 Import has no side effect', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('2 Default mode does not execute', async (dir) => {
    const out = await runEntrypoint(['--plan', writeJson(dir, 'plan.json', readyPlan())], deps);
    assert.strictEqual(out.executed, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.USAGE);
    assert.notStrictEqual(out.mode, 'apply');
  });

  await record('3 Explicit validate PASS', async (dir) => {
    const { argv } = fixture(dir);
    const out = await runEntrypoint(argv, deps);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.VALIDATION_OK);
    assert.strictEqual(out.readyCount, 1);
  });

  await record('4 Inspect creates no artifact', async (dir) => {
    const ledgerDir = path.join(dir, 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    const before = fs.readdirSync(ledgerDir);
    const out = await runEntrypoint(['--mode', 'inspect', '--ledger-path', path.join(ledgerDir, 'ledger.jsonl')], deps);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.INSPECT_OK);
    assert.deepStrictEqual(fs.readdirSync(ledgerDir), before);
  });

  await record('5 dry-run uses mock repository', async (dir) => {
    const { argv } = fixture(dir, { mode: MODE.DRY_RUN });
    const calls = [];
    const mockRepository = {
      async applyOwnerTransition(input) { calls.push(input.recordId); return true; },
      async rollbackOwnerTransition() { return true; },
    };
    const out = await runEntrypoint(argv, { ...deps, mockRepository });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.DRY_RUN_OK);
    assert.deepStrictEqual(calls, ['page_1']);
  });

  await record('6 --execute blocked', async () => {
    const out = await runEntrypoint(['--mode', 'validate', '--execute'], deps);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED);
    assert.strictEqual(out.executed, false);
  });

  await record('7 --live blocked', async () => {
    const out = await runEntrypoint(['--live', '--mode', 'validate'], deps);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED);
  });

  await record('8 --apply blocked', async () => {
    const out = await runEntrypoint(['--apply', '--mode', 'dry-run'], deps);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED);
  });

  await record('8b --rollback and --yes blocked', async () => {
    for (const flag of ['--rollback', '--yes', '--live-execute']) {
      const out = await runEntrypoint([flag, '--mode', 'validate'], deps);
      assert.strictEqual(out.code, ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED);
    }
  });

  await record('9 Missing plan reject', async (dir) => {
    const out = await runEntrypoint(['--mode', 'validate', '--confirm-target', TARGET, '--ledger-path', path.join(dir, 'ledger.jsonl')], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.ARTIFACT_MISSING);
  });

  await record('10 Missing backup proof reject', async (dir) => {
    const plan = readyPlan();
    const planPath = writeJson(dir, 'plan.json', plan);
    const approvalPath = writeJson(dir, 'approval.json', makeApproval(plan));
    const descriptorPath = writeJson(dir, 'descriptor.json', makeTargetDescriptor());
    const out = await runEntrypoint([
      '--mode', 'validate', '--plan', planPath, '--approval', approvalPath,
      '--target-descriptor', descriptorPath, '--confirm-target', TARGET,
      '--ledger-path', path.join(dir, 'ledger.jsonl'),
    ], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING);
  });

  await record('11 Backup stale reject', async (dir) => {
    const { argv } = fixture(dir, { backup: makeBackupProof({ createdAt: '2026-07-01T00:00:00.000Z' }) });
    const out = await runEntrypoint([...argv, '--max-backup-age-hours', '24'], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_STALE);
  });

  await record('12 Backup target mismatch reject', async (dir) => {
    const { argv } = fixture(dir, { backup: makeBackupProof({ target: 'other-target' }) });
    const out = await runEntrypoint(argv, deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING);
  });

  await record('13 Missing approval with READY actions reject', async (dir) => {
    const plan = readyPlan();
    const planPath = writeJson(dir, 'plan.json', plan);
    const backupPath = writeJson(dir, 'backup.json', makeBackupProof());
    const descriptorPath = writeJson(dir, 'descriptor.json', makeTargetDescriptor());
    const out = await runEntrypoint([
      '--mode', 'validate', '--plan', planPath, '--backup-proof', backupPath,
      '--target-descriptor', descriptorPath, '--confirm-target', TARGET,
      '--ledger-path', path.join(dir, 'ledger.jsonl'),
    ], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_APPROVAL_MISSING);
  });

  await record('14 No-action needs no approval claim', async (dir) => {
    const plan = noActionPlan();
    const planPath = writeJson(dir, 'plan.json', plan);
    let claimCalls = 0;
    const ledger = {
      async hasApproval() { return false; },
      async claimApproval() { claimCalls += 1; return { ok: true }; },
      async releaseClaim() { return { ok: true }; },
      async inspect() { return { ok: true }; },
    };
    const out = await runEntrypoint([
      '--mode', 'dry-run', '--plan', planPath, '--confirm-target', TARGET,
    ], { ...deps, ledger });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(claimCalls, 0);
  });

  await record('15 No-action zero repository call', async (dir) => {
    const plan = noActionPlan();
    const planPath = writeJson(dir, 'plan.json', plan);
    const calls = [];
    const mockRepository = { async applyOwnerTransition(i) { calls.push(i); return true; }, async rollbackOwnerTransition() { return true; } };
    const out = await runEntrypoint(['--mode', 'dry-run', '--plan', planPath, '--confirm-target', TARGET], { ...deps, mockRepository });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(calls.length, 0);
  });

  await record('16 Target mismatch reject', async (dir) => {
    const { argv } = fixture(dir);
    const rewritten = argv.map((v) => (v === TARGET ? 'wrong-target' : v));
    const out = await runEntrypoint(rewritten, deps);
    assert.strictEqual(out.ok, false);
    // confirm-target no longer matches approval/backup/descriptor targets.
    assert.ok([ENTRYPOINT_CODE.TARGET_CONFIRMATION_FAILED, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING].includes(out.code));
  });

  await record('17 Existing completed approval reject', async (dir) => {
    const { argv } = fixture(dir);
    const ledger = {
      async hasApproval() { return true; },
      async claimApproval() { return { ok: true }; },
      async releaseClaim() { return { ok: true }; },
      async inspect() { return { ok: true }; },
    };
    const out = await runEntrypoint(argv, { ...deps, ledger });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.APPROVAL_ALREADY_COMPLETED);
  });

  await record('18 Existing claim reject', async (dir) => {
    const { argv } = fixture(dir, { mode: MODE.DRY_RUN });
    const ledger = {
      async hasApproval() { return false; },
      async claimApproval() { return { ok: false, code: 'APPROVAL_ALREADY_CLAIMED' }; },
      async releaseClaim() { return { ok: true }; },
      async inspect() { return { ok: true }; },
    };
    const out = await runEntrypoint(argv, { ...deps, ledger });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.APPROVAL_ALREADY_CLAIMED);
  });

  await record('19 BOM plan parses in memory', async (dir) => {
    const planPath = writeJson(dir, 'plan.json', readyPlan(), { bom: true });
    const loaded = await loadJsonArtifact(planPath);
    assert.strictEqual(loaded.hadBom, true);
    assert.strictEqual(loaded.parsedValue.version, 1);
  });

  await record('20 BOM source file not modified', async (dir) => {
    const planPath = writeJson(dir, 'plan.json', readyPlan(), { bom: true });
    const beforeBuf = fs.readFileSync(planPath);
    const beforeMtime = fs.statSync(planPath).mtimeMs;
    await loadJsonArtifact(planPath);
    const afterBuf = fs.readFileSync(planPath);
    assert.strictEqual(Buffer.compare(beforeBuf, afterBuf), 0);
    assert.strictEqual(beforeBuf[0], 0xEF);
    assert.strictEqual(fs.statSync(planPath).mtimeMs, beforeMtime);
  });

  await record('21 Invalid JSON after BOM reject', async (dir) => {
    const planPath = path.join(dir, 'plan.json');
    fs.writeFileSync(planPath, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{ not json', 'utf8')]));
    await assert.rejects(() => loadJsonArtifact(planPath), (err) => err.code === ENTRYPOINT_CODE.ARTIFACT_PARSE_FAILED);
  });

  await record('22 Symlink artifact reject', async (dir) => {
    const { argv } = fixture(dir);
    const planPath = argv[argv.indexOf('--plan') + 1];
    const fsProbe = {
      lstat: async (p) => (p === path.resolve(planPath) ? fakeStat({ symlink: true }) : fsp.lstat(p)),
    };
    const out = await runEntrypoint(argv, { ...deps, fsProbe });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.ARTIFACT_SYMLINK);
  });

  await record('23 Oversized artifact reject', async (dir) => {
    const { argv } = fixture(dir);
    const planPath = argv[argv.indexOf('--plan') + 1];
    const fsProbe = {
      lstat: async (p) => (p === path.resolve(planPath) ? fakeStat({ size: 10 * 1024 * 1024 }) : fsp.lstat(p)),
    };
    const out = await runEntrypoint(argv, { ...deps, fsProbe });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.ARTIFACT_OVERSIZED);
  });

  await record('24 Journal collision reject', async (dir) => {
    const { argv } = fixture(dir);
    const journalFile = path.join(dir, 'journal-collide.json');
    fs.writeFileSync(journalFile, '{}');
    const out = await runEntrypoint([...argv, '--journal-dir', journalFile], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.JOURNAL_COLLISION);
  });

  await record('25 Manifest collision reject', async (dir) => {
    const { argv } = fixture(dir);
    const manifestFile = path.join(dir, 'manifest-collide.json');
    fs.writeFileSync(manifestFile, '{}');
    const out = await runEntrypoint([...argv, '--manifest-dir', manifestFile], deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.MANIFEST_COLLISION);
  });

  await record('26 Ledger corruption reject', async (dir) => {
    const { argv, ledgerDir } = fixture(dir);
    // Corrupt the ledger file so hasApproval throws -> LEDGER_UNAVAILABLE.
    fs.writeFileSync(path.join(ledgerDir, 'ledger.jsonl'), 'not-json-no-newline');
    const out = await runEntrypoint(argv, deps);
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.LEDGER_UNAVAILABLE);
  });

  await record('27 Gates run before Safe Composition', async (dir) => {
    // Invalid approval must be rejected before any repository call in dry-run.
    const plan = readyPlan();
    const { argv } = fixture(dir, { mode: MODE.DRY_RUN, approval: makeApproval(plan, { planHash: 'c'.repeat(64) }) });
    const calls = [];
    const mockRepository = { async applyOwnerTransition(i) { calls.push(i); return true; }, async rollbackOwnerTransition() { return true; } };
    const out = await runEntrypoint(argv, { ...deps, mockRepository });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.APPROVAL_REJECTED);
    assert.strictEqual(calls.length, 0);
  });

  await record('28 Safe Composition receives mock repository only', async (dir) => {
    const { argv } = fixture(dir, { mode: MODE.DRY_RUN });
    const out = await runEntrypoint(argv, deps);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.DRY_RUN_OK);
    // Real Prisma client was never loaded by the dry-run.
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('29 Does not load @prisma/client', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('30 Does not read process.env', async (dir) => {
    // Provide the dry-run temp dir explicitly so os.tmpdir()'s internal TEMP
    // lookup is not exercised; this isolates the module's own env behavior.
    const { argv } = fixture(dir, { mode: MODE.DRY_RUN });
    const dryRunBaseDir = path.join(dir, 'dryrun-base');
    fs.mkdirSync(dryRunBaseDir, { recursive: true });
    const hits = [];
    const realEnv = process.env;
    const trap = new Proxy(realEnv, {
      get(target, prop) {
        if (typeof prop === 'string' && prop !== 'then') hits.push(prop);
        return target[prop];
      },
    });
    Object.defineProperty(process, 'env', { value: trap, configurable: true });
    try {
      await runEntrypoint(argv, { ...deps, dryRunBaseDir });
      assert.deepStrictEqual(hits, []);
    } finally {
      Object.defineProperty(process, 'env', { value: realEnv, configurable: true });
    }
  });

  await record('31 Does not call network', async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
    try {
      const { argv } = fixture(dir, { mode: MODE.DRY_RUN });
      const out = await runEntrypoint(argv, deps);
      assert.strictEqual(out.ok, true);
      assert.strictEqual(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await record('32 Logger redaction', async (dir) => {
    const { argv } = fixture(dir);
    const calls = [];
    const logger = {
      info: (label, meta) => calls.push(meta),
      warn: (label, meta) => calls.push(meta),
    };
    const out = await runEntrypoint(argv, { ...deps, logger });
    assert.strictEqual(out.ok, true);
    const unsafe = /(secret|token|databaseurl|connectionstring|approvalid|raw|payload|password)/i;
    for (const meta of calls) {
      for (const key of Object.keys(meta || {})) {
        assert.strictEqual(unsafe.test(key), false);
      }
      assert.strictEqual(JSON.stringify(meta).includes('approval-fixture-entry'), false);
    }
  });

  await record('33 Executor live lock false', async () => {
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
  });

  await record('34 Entrypoint live lock false', async () => {
    assert.strictEqual(LIVE_ENTRYPOINT_ENABLED, false);
  });

  await record('35 parse rejects unknown flag', async () => {
    const parsed = parseEntrypointArgs(['--mode', 'validate', '--bogus']);
    assert.strictEqual(parsed.unknownFlag, '--bogus');
    const out = await runEntrypoint(['--mode', 'validate', '--bogus'], deps);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.UNKNOWN_ARGUMENT);
  });

  await record('36 validateBackupProof direct missing fields', async () => {
    const check = validateBackupProof({ version: 1, backupId: 'x' }, { now: NOW });
    assert.strictEqual(check.ok, false);
    assert.strictEqual(check.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING);
  });

  await fsp.rm(root, { recursive: true, force: true });
  return results;
}

run()
  .then((results) => {
    for (const line of results) console.log(line);
    console.log(`tenant-backfill-live-entrypoint-smoke: MOCK_PASS (${results.length} checks)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('tenant-backfill-live-entrypoint-smoke: FAIL - ASSERTION_FAILED');
    console.error(String(error && error.message ? error.message : error).split('\n')[0]);
    process.exit(1);
  });
