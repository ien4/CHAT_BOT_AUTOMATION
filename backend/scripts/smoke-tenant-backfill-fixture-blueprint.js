'use strict';

// Smoke matrix for the deterministic sanitized fixture blueprint.
// Mock-only. No PrismaClient, no network, no environment read, no live mutation.
// All filesystem writes go to an mkdtemp() directory.

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const fb = require('./tenant-backfill-fixture-blueprint');
const executor = require('./tenant-backfill-executor');
const {
  computePlanExecHash,
  validatePlan,
  applyPlan,
} = executor;
const {
  runEntrypoint,
  MODE,
  ENTRYPOINT_CODE,
  validateBackupProof,
  validateTargetDescriptor,
  LIVE_ENTRYPOINT_ENABLED,
} = require('./tenant-backfill-live-entrypoint');
const {
  createFileCompletionLedger,
  LEDGER_CODE,
} = require('./tenant-backfill-completion-ledger');

const NOW = Date.parse('2026-07-19T00:00:00.000Z');
const DEPS = { clock: () => NOW };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeArtifact(dir, name, obj, { bom = false } = {}) {
  const filePath = path.join(dir, name);
  const body = fb.serializeFixtureArtifact(obj);
  const buffer = bom
    ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')])
    : Buffer.from(body, 'utf8');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// Build a temp artifact bundle + argv base for entrypoint runs.
function fixtureArgv(dir, scenarioArtifacts, { mode = MODE.VALIDATE, confirmTarget = fb.TARGET, approval, backup } = {}) {
  const planPath = writeArtifact(dir, 'plan.json', scenarioArtifacts.plan);
  const approvalPath = writeArtifact(dir, 'approval.json', approval || scenarioArtifacts.approval);
  const backupPath = writeArtifact(dir, 'backup.json', backup || scenarioArtifacts.backupProof);
  const descriptorPath = writeArtifact(dir, 'descriptor.json', scenarioArtifacts.targetDescriptor);
  const ledgerDir = path.join(dir, 'ledger');
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, 'ledger.jsonl');
  const argv = [
    '--mode', mode,
    '--plan', planPath,
    '--approval', approvalPath,
    '--backup-proof', backupPath,
    '--target-descriptor', descriptorPath,
    '--confirm-target', confirmTarget,
    '--ledger-path', ledgerPath,
  ];
  return { argv, planPath, approvalPath, backupPath, descriptorPath, ledgerDir, ledgerPath };
}

async function caseDir(root, label) {
  const dir = path.join(root, label.replace(/[^a-z0-9_-]/gi, '_'));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-fixture-smoke-'));
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

  await record('1 Import has no side effect', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('2 Fixture build deterministic', async () => {
    const a = fb.buildFixtureBundle(DEPS);
    const b = fb.buildFixtureBundle(DEPS);
    assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  });

  await record('3 Fixture IDs schema-compatible', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const check = fb.validateFixtureSpec(bundle.scenarios.A.spec);
    assert.strictEqual(check.ok, true, JSON.stringify(check.errors));
  });

  await record('4 No PII or secret in protocol artifacts', async () => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    // Any secret-shaped key anywhere is a hard failure.
    const raw = JSON.stringify(A);
    assert.ok(!/accessToken|access_token|appSecret|verifyToken|DATABASE_URL|password/i.test(raw), 'secret-like token present');
    // validateFixtureSpec enforces the sanitization contract.
    assert.strictEqual(fb.validateFixtureSpec(A.spec).ok, true);
  });

  await record('5 Happy-path READY greater than zero', async () => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    assert.strictEqual(A.expected.readyCount, 1);
  });

  await record('6 Planner plan deterministic', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const p1 = fb.buildFixturePlan(spec, DEPS);
    const p2 = fb.buildFixturePlan(spec, DEPS);
    assert.strictEqual(JSON.stringify(p1.actions), JSON.stringify(p2.actions));
  });

  await record('7 Plan hash deterministic', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    assert.strictEqual(fb.buildFixturePlan(spec, DEPS).planHash, fb.buildFixturePlan(spec, DEPS).planHash);
  });

  await record('8 Exec hash deterministic', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const h1 = computePlanExecHash(fb.buildFixturePlan(spec, DEPS));
    const h2 = computePlanExecHash(fb.buildFixturePlan(spec, DEPS));
    assert.strictEqual(h1, h2);
    assert.ok(/^[0-9a-f]{64}$/.test(h1));
  });

  await record('9 Strict Mapping has no BOM', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const mapping = fb.buildStrictMappingArtifact(spec);
    const buffer = Buffer.from(fb.serializeFixtureArtifact(mapping), 'utf8');
    assert.ok(!(buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF), 'mapping carries a BOM');
  });

  await record('10 Mapping JSON parse PASS', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const parsed = JSON.parse(fb.serializeFixtureArtifact(fb.buildStrictMappingArtifact(spec)));
    assert.strictEqual(parsed.version, 1);
  });

  await record('11 Duplicate candidate reject', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildDuplicateActionPlan(spec, DEPS);
    const validation = validatePlan(plan);
    assert.strictEqual(validation.ok, false);
    assert.ok(validation.errors.some((e) => e.code === executor.ABORT_CODE.DUPLICATE_ACTION));
  });

  await record('12 Unsupported model reject', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildUnsupportedModelPlan(spec, DEPS);
    const validation = validatePlan(plan);
    assert.strictEqual(validation.ok, false);
    assert.ok(validation.errors.some((e) => e.code === executor.ABORT_CODE.UNSUPPORTED_MODEL));
  });

  await record('13 No-action scenario validate PASS', async (dir) => {
    const B = fb.buildFixtureBundle(DEPS).scenarios.B;
    const { argv } = fixtureArgv(dir, B, { mode: MODE.VALIDATE });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(out.readyCount, 0);
    assert.strictEqual(out.exitCode, 0);
  });

  await record('14 No-action zero repository call', async (dir) => {
    const B = fb.buildFixtureBundle(DEPS).scenarios.B;
    let calls = 0;
    const spyRepository = {
      applyOwnerTransition() { calls += 1; return true; },
      getCurrentOwner() { calls += 1; return null; },
      targetTenantExists() { calls += 1; return true; },
    };
    const { argv } = fixtureArgv(dir, B, { mode: MODE.DRY_RUN });
    const out = await runEntrypoint(argv, { now: NOW, mockRepository: spyRepository, dryRunBaseDir: path.join(dir, 'dry') });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(calls, 0);
  });

  await record('15 Conflict scenario maps to SKIP_WRITE_CONFLICT', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildFixturePlan(spec, DEPS);
    const repository = fb.buildConflictRepository(spec, plan);
    const outcome = applyPlan({ plan, repository, target: fb.TARGET, now: new Date(NOW).toISOString() });
    assert.strictEqual(outcome.aborted, false);
    assert.ok(outcome.results.some((r) => r.status === executor.APPLY_STATUS.SKIP_WRITE_CONFLICT));
    assert.strictEqual(outcome.manifest.actions.length, 0);
  });

  await record('16 Approval binds correct hashes', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildFixturePlan(spec, DEPS);
    const approval = fb.buildFixtureApproval(spec, plan, DEPS);
    assert.strictEqual(approval.planHash, plan.planHash);
    assert.strictEqual(approval.execHash, computePlanExecHash(plan));
    assert.strictEqual(approval.maxActions, 1);
  });

  await record('17 Approval hash mismatch reject', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const tampered = clone(A.approval);
    tampered.execHash = 'b'.repeat(64);
    const { argv } = fixtureArgv(dir, A, { mode: MODE.VALIDATE, approval: tampered });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.APPROVAL_REJECTED);
  });

  await record('18 Backup proof valid', async () => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const check = validateBackupProof(A.backupProof, {
      targetDescriptor: { target: fb.TARGET, databaseName: fb.DATABASE_NAME },
      confirmTarget: fb.TARGET,
      now: NOW,
    });
    assert.strictEqual(check.ok, true, JSON.stringify(check.errors || check.code));
  });

  await record('19 Backup missing reject', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const planPath = writeArtifact(dir, 'plan.json', A.plan);
    const approvalPath = writeArtifact(dir, 'approval.json', A.approval);
    const descriptorPath = writeArtifact(dir, 'descriptor.json', A.targetDescriptor);
    const argv = [
      '--mode', MODE.VALIDATE,
      '--plan', planPath,
      '--approval', approvalPath,
      '--target-descriptor', descriptorPath,
      '--confirm-target', fb.TARGET,
    ];
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING);
  });

  await record('20 Backup stale reject', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const stale = clone(A.backupProof);
    stale.createdAt = new Date(NOW - 48 * 60 * 60 * 1000).toISOString();
    const { argv } = fixtureArgv(dir, A, { mode: MODE.VALIDATE, backup: stale });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_STALE);
  });

  await record('21 Target descriptor valid', async () => {
    const check = validateTargetDescriptor(fb.buildFixtureTargetDescriptor());
    assert.strictEqual(check.ok, true, JSON.stringify(check.errors || check.code));
  });

  await record('22 Target mismatch reject', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const mismatchApproval = clone(A.approval);
    mismatchApproval.target = 'other-sanitized-target';
    const { argv } = fixtureArgv(dir, A, { mode: MODE.VALIDATE, approval: mismatchApproval });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, ENTRYPOINT_CODE.TARGET_CONFIRMATION_FAILED);
  });

  await record('23 Entrypoint validate PASS', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv } = fixtureArgv(dir, A, { mode: MODE.VALIDATE });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.VALIDATION_OK);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.readyCount, 1);
    assert.strictEqual(out.executed, false);
  });

  await record('24 Validate creates no claim or artifact', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv, ledgerPath, ledgerDir } = fixtureArgv(dir, A, { mode: MODE.VALIDATE });
    await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(fs.existsSync(ledgerPath), false, 'ledger file was created');
    assert.strictEqual(fs.existsSync(path.join(ledgerDir, 'claims')), false, 'claims dir was created');
  });

  await record('25 Entrypoint inspect PASS', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv } = fixtureArgv(dir, A, { mode: MODE.INSPECT });
    const out = await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.INSPECT_OK);
    assert.strictEqual(out.ok, true);
  });

  await record('26 Inspect performs no mutation', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv, ledgerPath } = fixtureArgv(dir, A, { mode: MODE.INSPECT });
    await runEntrypoint(argv, { now: NOW });
    assert.strictEqual(fs.existsSync(ledgerPath), false);
  });

  await record('27 Entrypoint dry-run PASS', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
    const out = await runEntrypoint(argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
    assert.strictEqual(out.code, ENTRYPOINT_CODE.DRY_RUN_OK);
    assert.strictEqual(out.ok, true);
  });

  await record('28 Dry-run uses mock repository only', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
    await runEntrypoint(argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('29 Claim is created exclusively', async (dir) => {
    const ledger = createFileCompletionLedger({ ledgerPath: path.join(dir, 'l.jsonl'), clock: () => NOW });
    const first = await ledger.claimApproval('approval-x', 'op_1', { target: fb.TARGET });
    const second = await ledger.claimApproval('approval-x', 'op_2', { target: fb.TARGET });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.code, LEDGER_CODE.APPROVAL_ALREADY_CLAIMED);
  });

  await record('30 Claim released in finally', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv, ledgerDir } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
    await runEntrypoint(argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
    const claimsDir = path.join(ledgerDir, 'claims');
    const remaining = fs.existsSync(claimsDir)
      ? (await fsp.readdir(claimsDir)).filter((n) => n.endsWith('.claim.json'))
      : [];
    assert.deepStrictEqual(remaining, []);
  });

  await record('31 No completion ledger record in dry-run', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const { argv, ledgerPath } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
    await runEntrypoint(argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
    assert.strictEqual(fs.existsSync(ledgerPath), false, 'a completion record was persisted');
  });

  await record('32 Temporary journal/manifest isolated', async (dir) => {
    const A = fb.buildFixtureBundle(DEPS).scenarios.A;
    const dryBase = path.join(dir, 'dry');
    const { argv } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
    await runEntrypoint(argv, { now: NOW, dryRunBaseDir: dryBase });
    assert.ok(fs.existsSync(path.join(dryBase, 'tenant-backfill-operations')), 'journal not isolated to temp base');
  });

  await record('33 Cleanup manifest deterministic', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildFixturePlan(spec, DEPS);
    const m1 = fb.buildFixtureCleanupManifest(spec, plan);
    const m2 = fb.buildFixtureCleanupManifest(spec, plan);
    assert.strictEqual(JSON.stringify(m1), JSON.stringify(m2));
    assert.deepStrictEqual(m1.cleanupOrder, ['Appointment', 'Conversation', 'FacebookPage', 'Tenant']);
  });

  await record('34 Rollback expectation deterministic', async () => {
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildFixturePlan(spec, DEPS);
    const r1 = fb.buildFixtureRollbackExpectation(spec, plan);
    const r2 = fb.buildFixtureRollbackExpectation(spec, plan);
    assert.strictEqual(JSON.stringify(r1), JSON.stringify(r2));
    assert.ok(r1.expectations.every((e) => e.restoreTenantId === null));
  });

  await record('35 Bundle is not mutated by validate/dry-run', async (dir) => {
    const bundle = fb.buildFixtureBundle(DEPS);
    const before = JSON.stringify(bundle.scenarios.A);
    const { argv } = fixtureArgv(dir, bundle.scenarios.A, { mode: MODE.VALIDATE });
    await runEntrypoint(argv, { now: NOW });
    const dry = fixtureArgv(await caseDir(root, '35b'), bundle.scenarios.A, { mode: MODE.DRY_RUN });
    await runEntrypoint(dry.argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
    assert.strictEqual(JSON.stringify(bundle.scenarios.A), before);
    assert.ok(Object.isFrozen(bundle.scenarios.A.plan));
  });

  await record('36 Logger redaction PASS', async () => {
    const safe = fb.sanitizeFixtureLogMeta({
      fixtureId: 'x', scenario: 'A', model: 'FacebookPage', accessToken: 'SECRET',
      approval: { secret: 1 }, rawPlan: {}, count: 3,
    });
    assert.deepStrictEqual(Object.keys(safe).sort(), ['count', 'fixtureId', 'model', 'scenario']);
  });

  await record('37 No PrismaClient after full build', async () => {
    fb.buildFixtureBundle(DEPS);
    const spec = fb.buildFixtureSpec({ ...DEPS, scenario: 'A' });
    const plan = fb.buildFixturePlan(spec, DEPS);
    fb.buildFixtureApproval(spec, plan, DEPS);
    fb.buildConflictRepository(spec, plan);
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('38 No environment read', async (dir) => {
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
      const A = fb.buildFixtureBundle(DEPS).scenarios.A;
      const { argv } = fixtureArgv(dir, A, { mode: MODE.VALIDATE });
      await runEntrypoint(argv, { now: NOW });
      assert.deepStrictEqual(hits, []);
    } finally {
      Object.defineProperty(process, 'env', { value: realEnv, configurable: true });
    }
  });

  await record('39 No network call', async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
    try {
      const A = fb.buildFixtureBundle(DEPS).scenarios.A;
      const { argv } = fixtureArgv(dir, A, { mode: MODE.DRY_RUN });
      await runEntrypoint(argv, { now: NOW, dryRunBaseDir: path.join(dir, 'dry') });
      assert.strictEqual(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await record('40 Two live locks remain false', async () => {
    const bundle = fb.buildFixtureBundle(DEPS);
    assert.strictEqual(LIVE_ENTRYPOINT_ENABLED, false);
    assert.strictEqual(executor.LIVE_WRITE_ENABLED, false);
    assert.strictEqual(bundle.liveLocks.LIVE_ENTRYPOINT_ENABLED, false);
    assert.strictEqual(bundle.liveLocks.LIVE_WRITE_ENABLED, false);
  });

  await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
  for (const line of results) console.log(line);
  console.log(`tenant-backfill-fixture-blueprint-smoke: MOCK_PASS (${results.length} checks)`);
}

run().catch((error) => {
  console.error(`tenant-backfill-fixture-blueprint-smoke: FAIL`);
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
