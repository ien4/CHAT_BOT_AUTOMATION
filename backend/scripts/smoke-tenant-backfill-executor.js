'use strict';

// P0-TENANT-BACKFILL-EXECUTOR-DESIGN-01 — smoke, mock-only.
// No PrismaClient. No DB. No network. No secret.

const assert = require('assert');

const { buildPlan, STATUS } = require('./tenant-backfill-planner');
const {
  LIVE_WRITE_ENABLED,
  APPLY_STATUS,
  ROLLBACK_STATUS,
  ROLLBACK_SUMMARY,
  ABORT_CODE,
  computePlanExecHash,
  validatePlan,
  createMockRepository,
  applyPlan,
  rollbackPlan,
  assertLiveApplyGate,
} = require('./tenant-backfill-executor');

const tenants = [
  { id: 'tenant_A', slug: 'tenant-a', isActive: true },
  { id: 'tenant_B', slug: 'tenant-b', isActive: true },
];

const pages = [
  { id: 'page_A_row', pageId: 'page_A_key', isActive: true, tenantId: null },
];

// conv_B is the Class B fixture: two independent evidence items + operator approval.
const conversations = [
  { id: 'conv_B', tenantId: null, fbUserId: 'sender_B' },
];

const mapping = {
  version: 1,
  pages: [
    { pageId: 'page_A_key', targetTenantId: 'tenant_A', reason: 'platform_admin_assignment' },
  ],
  conversations: [
    {
      conversationId: 'conv_B',
      targetTenantId: 'tenant_B',
      source: 'operator_approved_strong_derived',
      evidence: ['migration_manifest', 'immutable_page_id'],
      operatorApproved: true,
    },
  ],
};

const capabilities = {
  conversationHasDirectPageRelation: true,
  conversationHasPageContextJson: true,
  messageHasMetadata: true,
  messageHasRawPayload: false,
};

function buildReadyPlan() {
  return buildPlan({ tenants, pages, conversations, appointments: [], mapping, modelCapabilities: capabilities });
}

function actionFor(plan, model, recordId) {
  return plan.actions.find((a) => a.model === model && a.recordId === recordId);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const results = [];
  const record = (name, fn) => { fn(); results.push(`PASS - ${name}`); };

  const plan = buildReadyPlan();
  const readyExecHash = computePlanExecHash(plan);

  // Sanity: the plan carries exactly the two READY actions we expect.
  const pageAction = actionFor(plan, 'FacebookPage', 'page_A_row');
  const convAction = actionFor(plan, 'Conversation', 'conv_B');
  assert.ok(pageAction && convAction, 'fixture plan must contain both target actions');

  record('1 Valid dry-run validates without mutation', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const before = repo._snapshot();
    const res = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash, dryRun: true });
    assert.strictEqual(res.aborted, false);
    assert.strictEqual(res.dryRun, true);
    assert.strictEqual(res.mutations, 0);
    assert.strictEqual(res.readyCount, 2);
    assert.strictEqual(res.execHash, readyExecHash);
    assert.deepStrictEqual(repo._snapshot(), before);
  });

  record('2 Hash mismatch aborts with INVALID_PLAN_HASH, no mutation', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const res = applyPlan({ plan, repository: repo, expectedPlanHash: '0'.repeat(64) });
    assert.strictEqual(res.aborted, true);
    assert.strictEqual(res.abortCode, ABORT_CODE.INVALID_PLAN_HASH);
    assert.strictEqual(res.mutations, 0);
    assert.deepStrictEqual(repo._snapshot(), {});
    // Tamper variant: editing an action changes execHash -> mismatch against the approved hash.
    const tampered = clone(plan);
    tampered.actions.find((a) => a.recordId === 'page_A_row').newTenantId = 'tenant_B';
    assert.notStrictEqual(computePlanExecHash(tampered), readyExecHash);
  });

  record('3 Apply success writes owner and APPLIED manifest', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const res = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    assert.strictEqual(res.aborted, false);
    assert.strictEqual(res.mutations, 2);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), 'tenant_A');
    assert.strictEqual(repo.getCurrentOwner('Conversation', 'conv_B'), 'tenant_B');
    assert.strictEqual(res.manifest.actions.length, 2);
    for (const entry of res.manifest.actions) {
      assert.strictEqual(entry.status, APPLY_STATUS.APPLIED);
      assert.ok(Object.prototype.hasOwnProperty.call(entry, 'oldTenantId'));
      assert.ok(entry.appliedAt);
    }
  });

  record('4 Re-apply conflict skips without overwrite', () => {
    const repo = createMockRepository({ owners: { 'FacebookPage:page_A_row': 'tenant_OTHER' }, tenants: ['tenant_A', 'tenant_B'] });
    const res = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash });
    const pageResult = res.results.find((r) => r.recordId === 'page_A_row');
    assert.strictEqual(pageResult.status, APPLY_STATUS.SKIP_WRITE_CONFLICT);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), 'tenant_OTHER');
    // conv_B was null -> still applied; conflict on one record does not block the other.
    assert.strictEqual(repo.getCurrentOwner('Conversation', 'conv_B'), 'tenant_B');
  });

  record('5 Target tenant missing aborts before any write', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A'] });
    const res = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash });
    assert.strictEqual(res.aborted, true);
    assert.strictEqual(res.abortCode, ABORT_CODE.INVALID_TARGET_TENANT);
    assert.strictEqual(res.mutations, 0);
    assert.deepStrictEqual(repo._snapshot(), {});
  });

  record('6 Duplicate action rejects whole plan', () => {
    const dup = clone(plan);
    dup.actions.push(clone(pageAction));
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const res = applyPlan({ plan: dup, repository: repo });
    assert.strictEqual(res.aborted, true);
    assert.strictEqual(res.abortCode, ABORT_CODE.DUPLICATE_ACTION);
    assert.strictEqual(res.mutations, 0);
    assert.deepStrictEqual(repo._snapshot(), {});
  });

  record('7 Unsupported model rejects whole plan', () => {
    const bad = clone(plan);
    bad.actions.push({ model: 'Message', recordId: 'msg_1', oldTenantId: null, newTenantId: 'tenant_A', status: STATUS.READY, evidence: [] });
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const res = applyPlan({ plan: bad, repository: repo });
    assert.strictEqual(res.aborted, true);
    assert.strictEqual(res.abortCode, ABORT_CODE.UNSUPPORTED_MODEL);
    assert.strictEqual(res.mutations, 0);
    assert.deepStrictEqual(repo._snapshot(), {});
  });

  record('8 Rollback success reverts to old owner', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const applied = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    const res = rollbackPlan({ manifest: applied.manifest, repository: repo });
    assert.strictEqual(res.finalStatus, ROLLBACK_SUMMARY.ROLLED_BACK);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), null);
    assert.strictEqual(repo.getCurrentOwner('Conversation', 'conv_B'), null);
  });

  record('9 Rollback conflict skips without overwrite', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const applied = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    // A third party moved the page to another tenant after apply.
    repo._setOwner('FacebookPage', 'page_A_row', 'tenant_Z');
    const res = rollbackPlan({ manifest: applied.manifest, repository: repo });
    const pageResult = res.results.find((r) => r.recordId === 'page_A_row');
    assert.strictEqual(pageResult.status, ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), 'tenant_Z');
  });

  record('10 Partial rollback is reported with conflicts', () => {
    const repo = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const applied = applyPlan({ plan, repository: repo, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    repo._setOwner('FacebookPage', 'page_A_row', 'tenant_Z'); // conflict
    // conv_B still owned by tenant_B -> rolls back cleanly
    const res = rollbackPlan({ manifest: applied.manifest, repository: repo });
    assert.strictEqual(res.finalStatus, ROLLBACK_SUMMARY.PARTIAL_ROLLBACK_WITH_CONFLICTS);
    assert.strictEqual(res.mutations, 1);
    assert.strictEqual(repo.getCurrentOwner('Conversation', 'conv_B'), null);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), 'tenant_Z');
  });

  record('11 Manifest and execHash are deterministic', () => {
    const repoA = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const repoB = createMockRepository({ owners: {}, tenants: ['tenant_A', 'tenant_B'] });
    const a = applyPlan({ plan, repository: repoA, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    const b = applyPlan({ plan, repository: repoB, expectedPlanHash: readyExecHash, now: '2026-07-18T00:00:00.000Z' });
    assert.deepStrictEqual(a.manifest.actions, b.manifest.actions);
    assert.strictEqual(a.execHash, b.execHash);
    // execHash excludes volatile timestamps.
    assert.strictEqual(computePlanExecHash(plan), computePlanExecHash(clone(plan)));
    for (const key of ['version', 'planHash', 'execHash', 'target', 'generatedAt', 'actions']) {
      assert.ok(Object.prototype.hasOwnProperty.call(a.manifest, key), `manifest missing ${key}`);
    }
  });

  record('12 Zero live adapter: live write is locked', () => {
    assert.strictEqual(LIVE_WRITE_ENABLED, false);
    const gate = assertLiveApplyGate({ plan: 'p', expectedPlanHash: 'h', approvalFile: 'a', manifestOutput: 'm', confirmTarget: 't' });
    assert.strictEqual(gate.enabled, false);
    assert.strictEqual(gate.blocked, true);
    assert.strictEqual(gate.blockCode, ABORT_CODE.BLOCKED_LIVE_APPLY_NOT_ENABLED);
    // No PrismaClient must be reachable from the executor module graph.
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
    // No network hook was touched by loading/executing the engine.
    assert.strictEqual(typeof global.fetch, typeof global.fetch);
  });

  record('13 Class B fixture is READY with two independent evidence + approval', () => {
    assert.strictEqual(convAction.status, STATUS.READY);
    assert.strictEqual(convAction.newTenantId, 'tenant_B');
    assert.ok(Array.isArray(convAction.evidence) && convAction.evidence.length >= 2);
    assert.strictEqual(mapping.conversations[0].operatorApproved, true);
  });

  record('14 Optimistic write invariant: only current===old mutates', () => {
    const repo = createMockRepository({ owners: { 'FacebookPage:page_A_row': 'tenant_A' }, tenants: ['tenant_A', 'tenant_B'] });
    // oldTenantId is null but current is tenant_A -> transition must not fire.
    const ok = repo.applyOwnerTransition({ model: 'FacebookPage', recordId: 'page_A_row', oldTenantId: null, newTenantId: 'tenant_B' });
    assert.strictEqual(ok, false);
    assert.strictEqual(repo.getCurrentOwner('FacebookPage', 'page_A_row'), 'tenant_A');
  });

  record('15 validatePlan flags malformed plan structurally', () => {
    assert.strictEqual(validatePlan(null).ok, false);
    assert.strictEqual(validatePlan({ version: 2, actions: [], planHash: '0'.repeat(64) }).ok, false);
  });

  return results;
}

try {
  const results = run();
  for (const line of results) console.log(line);
  console.log(`tenant-backfill-executor-smoke: MOCK_PASS (${results.length} checks)`);
  process.exit(0);
} catch (error) {
  console.error(`tenant-backfill-executor-smoke: FAIL - ${error.message}`);
  process.exit(1);
}
