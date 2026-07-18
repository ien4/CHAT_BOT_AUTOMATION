'use strict';

// P0-TENANT-BACKFILL-EXECUTOR-DESIGN-01
// Mock-only, reversible, deterministic ownership transition engine.
// LIVE WRITE IS LOCKED. This file never performs a real DB write.
// The live adapter is intentionally NOT wired in this design phase.

const fs = require('fs');
const path = require('path');

// Reuse the deterministic hasher + status vocabulary from the landed planner.
// No planner logic is modified; only pure helpers are consumed.
const { stableHash, STATUS: PLAN_STATUS } = require('./tenant-backfill-planner');

// Hard lock. No flag, env var, or argument in this file can flip this to true.
// A live adapter is a separate, explicitly-reviewed landing (see report Phase 30).
const LIVE_WRITE_ENABLED = false;

const APPLY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  READY: 'READY',
  APPLYING: 'APPLYING',
  APPLIED: 'APPLIED',
  SKIP_WRITE_CONFLICT: 'SKIP_WRITE_CONFLICT',
  FAILED: 'FAILED',
});

const ROLLBACK_STATUS = Object.freeze({
  ROLLBACK_PENDING: 'ROLLBACK_PENDING',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLED_BACK: 'ROLLED_BACK',
  SKIP_ROLLBACK_CONFLICT: 'SKIP_ROLLBACK_CONFLICT',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
});

const ROLLBACK_SUMMARY = Object.freeze({
  ROLLED_BACK: 'ROLLED_BACK',
  PARTIAL_ROLLBACK_WITH_CONFLICTS: 'PARTIAL_ROLLBACK_WITH_CONFLICTS',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
});

const ABORT_CODE = Object.freeze({
  PLAN_MALFORMED: 'PLAN_MALFORMED',
  PLAN_VERSION_UNSUPPORTED: 'PLAN_VERSION_UNSUPPORTED',
  INVALID_PLAN_HASH: 'INVALID_PLAN_HASH',
  DUPLICATE_ACTION: 'DUPLICATE_ACTION',
  UNSUPPORTED_MODEL: 'UNSUPPORTED_MODEL',
  MALFORMED_READY_ACTION: 'MALFORMED_READY_ACTION',
  INVALID_TARGET_TENANT: 'INVALID_TARGET_TENANT',
  FAILED_TARGET_TENANT_MISSING: 'FAILED_TARGET_TENANT_MISSING',
  MANIFEST_OUTPUT_EXISTS: 'MANIFEST_OUTPUT_EXISTS',
  BLOCKED_LIVE_APPLY_NOT_ENABLED: 'BLOCKED_LIVE_APPLY_NOT_ENABLED',
  BLOCKED_LIVE_ROLLBACK_NOT_ENABLED: 'BLOCKED_LIVE_ROLLBACK_NOT_ENABLED',
});

const SUPPORTED_MODELS = Object.freeze(['FacebookPage', 'Conversation', 'Appointment']);
const HASH_RE = /^[0-9a-f]{64}$/;
const PLAN_VERSION = 1;
const MANIFEST_VERSION = 1;

function normTenant(value) {
  return value === undefined ? null : value;
}

function actionKey(action) {
  return `${action.model}:${action.recordId}`;
}

function actionRef(action) {
  return {
    model: action.model,
    recordId: action.recordId,
    oldTenantId: normTenant(action.oldTenantId),
    newTenantId: normTenant(action.newTenantId),
  };
}

// Deterministic digest over the plan's executable surface only.
// Excludes volatile fields (generatedAt). Any tampering with actions,
// summary, or validationErrors changes this hash. Recomputable from the
// persisted plan file alone (unlike the planner-internal planHash).
function computePlanExecHash(plan) {
  return stableHash({
    version: plan && plan.version != null ? plan.version : null,
    summary: plan && plan.summary != null ? plan.summary : null,
    validationErrors: plan && Array.isArray(plan.validationErrors) ? plan.validationErrors : [],
    actions: plan && Array.isArray(plan.actions) ? plan.actions : [],
  });
}

// Structural validation. Any error here MUST abort before any write (Phase 5).
function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, errors: [{ code: ABORT_CODE.PLAN_MALFORMED, detail: 'plan is not an object' }], readyActions: [] };
  }
  if (plan.version !== PLAN_VERSION) {
    errors.push({ code: ABORT_CODE.PLAN_VERSION_UNSUPPORTED, detail: `expected version ${PLAN_VERSION}` });
  }
  if (!Array.isArray(plan.actions)) {
    errors.push({ code: ABORT_CODE.PLAN_MALFORMED, detail: 'actions is not an array' });
    return { ok: false, errors, readyActions: [] };
  }
  if (typeof plan.planHash !== 'string' || !HASH_RE.test(plan.planHash)) {
    errors.push({ code: ABORT_CODE.INVALID_PLAN_HASH, detail: 'planHash is not a sha256 hex string' });
  }

  const seen = new Set();
  for (const action of plan.actions) {
    if (!action || typeof action !== 'object') {
      errors.push({ code: ABORT_CODE.PLAN_MALFORMED, detail: 'action is not an object' });
      continue;
    }
    if (!SUPPORTED_MODELS.includes(action.model)) {
      errors.push({ code: ABORT_CODE.UNSUPPORTED_MODEL, detail: String(action.model) });
    }
    const key = actionKey(action);
    if (seen.has(key)) errors.push({ code: ABORT_CODE.DUPLICATE_ACTION, detail: key });
    seen.add(key);
  }

  const readyActions = plan.actions.filter((action) => action && action.status === PLAN_STATUS.READY);
  for (const action of readyActions) {
    if (!action.recordId || normTenant(action.newTenantId) === null) {
      errors.push({ code: ABORT_CODE.MALFORMED_READY_ACTION, detail: actionKey(action) });
    }
  }

  return { ok: errors.length === 0, errors, readyActions };
}

// In-memory repository. This is the ONLY repository shipped in this phase.
// Implements the executor repository contract with an optimistic write guard.
function createMockRepository({ owners = {}, tenants = [] } = {}) {
  const store = new Map(Object.entries(owners).map(([key, value]) => [key, normTenant(value)]));
  const tenantSet = new Set(tenants);
  return {
    getCurrentOwner(model, recordId) {
      const key = `${model}:${recordId}`;
      return store.has(key) ? store.get(key) : null;
    },
    targetTenantExists(tenantId) {
      return tenantSet.has(tenantId);
    },
    // Optimistic transition: equivalent to
    //   UPDATE ... SET tenant_id = newTenantId WHERE id = recordId AND tenant_id = oldTenantId
    // Returns true only when exactly the expected owner matched (1 row).
    applyOwnerTransition(action) {
      const key = `${action.model}:${action.recordId}`;
      const current = store.has(key) ? store.get(key) : null;
      if (current !== normTenant(action.oldTenantId)) return false;
      store.set(key, normTenant(action.newTenantId));
      return true;
    },
    // Rollback transition: only reverses when current owner still equals newTenantId.
    rollbackOwnerTransition(action) {
      const key = `${action.model}:${action.recordId}`;
      const current = store.has(key) ? store.get(key) : null;
      if (current !== normTenant(action.newTenantId)) return false;
      store.set(key, normTenant(action.oldTenantId));
      return true;
    },
    // Test-only helpers (mock introspection; not part of the live contract).
    _snapshot() {
      return Object.fromEntries(store);
    },
    _dropTenant(tenantId) {
      tenantSet.delete(tenantId);
    },
    _setOwner(model, recordId, tenantId) {
      store.set(`${model}:${recordId}`, normTenant(tenantId));
    },
  };
}

function summarize(results) {
  return results.reduce((acc, result) => {
    acc.total += 1;
    acc.byStatus[result.status] = (acc.byStatus[result.status] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {} });
}

// Apply engine. Per-record atomic. Structural failures abort before any write.
// State conflicts skip-and-continue. Never a global/bulk update.
function applyPlan({ plan, repository, expectedPlanHash = null, target = null, dryRun = false, now = null }) {
  const validation = validatePlan(plan);
  if (!validation.ok) {
    return { aborted: true, abortCode: validation.errors[0].code, errors: validation.errors, mutations: 0, manifest: null, results: [], summary: summarize([]) };
  }

  const execHash = computePlanExecHash(plan);
  if (expectedPlanHash != null && expectedPlanHash !== execHash) {
    return { aborted: true, abortCode: ABORT_CODE.INVALID_PLAN_HASH, errors: [{ code: ABORT_CODE.INVALID_PLAN_HASH, detail: 'execHash mismatch' }], mutations: 0, manifest: null, results: [], summary: summarize([]) };
  }

  const ready = validation.readyActions;

  // FK precondition: every target tenant must exist BEFORE any write (Phase 8).
  for (const action of ready) {
    if (!repository.targetTenantExists(normTenant(action.newTenantId))) {
      return { aborted: true, abortCode: ABORT_CODE.INVALID_TARGET_TENANT, errors: [{ code: ABORT_CODE.INVALID_TARGET_TENANT, detail: actionKey(action) }], mutations: 0, manifest: null, results: [], summary: summarize([]) };
    }
  }

  const appliedAt = now || new Date().toISOString();

  if (dryRun) {
    const projected = ready.map((action) => ({ ...actionRef(action), status: APPLY_STATUS.READY }));
    return {
      aborted: false,
      dryRun: true,
      mutations: 0,
      execHash,
      planHash: plan.planHash || null,
      readyCount: ready.length,
      results: projected,
      manifest: null,
      summary: summarize(projected),
    };
  }

  const results = [];
  const manifestActions = [];
  let mutations = 0;

  for (const action of ready) {
    // Concurrent target deletion guard (Phase 8): abort batch, no APPLIED manifest entry.
    if (!repository.targetTenantExists(normTenant(action.newTenantId))) {
      return {
        aborted: true,
        abortCode: ABORT_CODE.FAILED_TARGET_TENANT_MISSING,
        errors: [{ code: ABORT_CODE.FAILED_TARGET_TENANT_MISSING, detail: actionKey(action) }],
        mutations,
        manifest: buildManifest({ plan, execHash, target, generatedAt: appliedAt, actions: manifestActions }),
        results,
        summary: summarize(results),
      };
    }

    const current = repository.getCurrentOwner(action.model, action.recordId);
    // Optimistic write contract (Phase 6): only apply when current === oldTenantId.
    if (current !== normTenant(action.oldTenantId)) {
      results.push({ ...actionRef(action), status: APPLY_STATUS.SKIP_WRITE_CONFLICT, observedOwner: current });
      continue;
    }

    const ok = repository.applyOwnerTransition(actionRef(action));
    if (!ok) {
      results.push({ ...actionRef(action), status: APPLY_STATUS.SKIP_WRITE_CONFLICT, observedOwner: repository.getCurrentOwner(action.model, action.recordId) });
      continue;
    }

    mutations += 1;
    manifestActions.push({
      model: action.model,
      recordId: action.recordId,
      oldTenantId: normTenant(action.oldTenantId),
      newTenantId: normTenant(action.newTenantId),
      appliedAt,
      planHash: plan.planHash || null,
      status: APPLY_STATUS.APPLIED,
    });
    results.push({ ...actionRef(action), status: APPLY_STATUS.APPLIED });
  }

  return {
    aborted: false,
    mutations,
    execHash,
    manifest: buildManifest({ plan, execHash, target, generatedAt: appliedAt, actions: manifestActions }),
    results,
    summary: summarize(results),
  };
}

function buildManifest({ plan, execHash, target, generatedAt, actions }) {
  return {
    version: MANIFEST_VERSION,
    planHash: (plan && plan.planHash) || null,
    execHash,
    target: target || null,
    generatedAt,
    actions,
  };
}

// Rollback engine. continue-on-conflict. Only reverses records present in the
// manifest, and only when the current owner still equals newTenantId.
function rollbackPlan({ manifest, repository, now = null }) {
  if (!manifest || manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.actions)) {
    return { aborted: true, abortCode: ABORT_CODE.PLAN_MALFORMED, mutations: 0, results: [], finalStatus: ROLLBACK_SUMMARY.ROLLBACK_FAILED, summary: summarize([]) };
  }
  const rolledAt = now || new Date().toISOString();
  const results = [];
  let mutations = 0;

  for (const entry of manifest.actions) {
    const current = repository.getCurrentOwner(entry.model, entry.recordId);
    if (current !== normTenant(entry.newTenantId)) {
      results.push({ model: entry.model, recordId: entry.recordId, status: ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT, observedOwner: current });
      continue;
    }
    const ok = repository.rollbackOwnerTransition(entry);
    if (!ok) {
      results.push({ model: entry.model, recordId: entry.recordId, status: ROLLBACK_STATUS.ROLLBACK_FAILED });
      continue;
    }
    mutations += 1;
    results.push({ model: entry.model, recordId: entry.recordId, status: ROLLBACK_STATUS.ROLLED_BACK, rolledAt });
  }

  let finalStatus = ROLLBACK_SUMMARY.ROLLED_BACK;
  if (results.some((r) => r.status === ROLLBACK_STATUS.ROLLBACK_FAILED)) {
    finalStatus = ROLLBACK_SUMMARY.ROLLBACK_FAILED;
  } else if (results.some((r) => r.status === ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT)) {
    finalStatus = ROLLBACK_SUMMARY.PARTIAL_ROLLBACK_WITH_CONFLICTS;
  }

  return { aborted: false, mutations, results, finalStatus, summary: summarize(results) };
}

// Live apply safety gate (Phase 4). Designed but LOCKED. Even when every flag
// is present, live write stays blocked because LIVE_WRITE_ENABLED is false and
// no live adapter is wired in this phase.
function assertLiveApplyGate(args) {
  const required = ['plan', 'expectedPlanHash', 'approvalFile', 'manifestOutput', 'confirmTarget'];
  const missing = required.filter((key) => !args || !args[key]);
  return {
    enabled: false,
    blocked: true,
    blockCode: ABORT_CODE.BLOCKED_LIVE_APPLY_NOT_ENABLED,
    missingFlags: missing,
    requiredFlags: ['--apply', '--plan', '--expected-plan-hash', '--approval-file', '--manifest-output', '--confirm-target'],
  };
}

function parseArgs(argv) {
  const args = { mode: null, plan: null, expectedPlanHash: null, approvalFile: null, manifestOutput: null, confirmTarget: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.mode = 'dry-run';
    else if (arg === '--apply') args.mode = 'apply';
    else if (arg === '--rollback') args.mode = 'rollback';
    else if (arg === '--plan') { args.plan = argv[i + 1] || null; i += 1; }
    else if (arg === '--expected-plan-hash') { args.expectedPlanHash = argv[i + 1] || null; i += 1; }
    else if (arg === '--approval-file') { args.approvalFile = argv[i + 1] || null; i += 1; }
    else if (arg === '--manifest-output') { args.manifestOutput = argv[i + 1] || null; i += 1; }
    else if (arg === '--confirm-target') { args.confirmTarget = argv[i + 1] || null; i += 1; }
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printUsage() {
  console.log('Usage: node scripts/tenant-backfill-executor.js --dry-run --plan <path> [--expected-plan-hash <hash>]');
  console.log('Live --apply / --rollback are LOCKED in this phase (BLOCKED_LIVE_APPLY_NOT_ENABLED).');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.mode) {
    printUsage();
    return;
  }

  if (args.mode === 'apply' || args.mode === 'rollback') {
    const gate = assertLiveApplyGate(args);
    const blockCode = args.mode === 'apply'
      ? ABORT_CODE.BLOCKED_LIVE_APPLY_NOT_ENABLED
      : ABORT_CODE.BLOCKED_LIVE_ROLLBACK_NOT_ENABLED;
    console.error(`tenant-backfill-executor: ${blockCode}`);
    console.error(`live write enabled: ${LIVE_WRITE_ENABLED}`);
    console.error(`required flags: ${gate.requiredFlags.join(' ')}`);
    process.exitCode = 3;
    return;
  }

  // dry-run: plan validation + hash only. No DB adapter is wired.
  if (!args.plan) {
    console.error('tenant-backfill-executor: DRY_RUN_REQUIRES_PLAN');
    process.exitCode = 2;
    return;
  }
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(path.resolve(args.plan), 'utf8'));
  } catch (error) {
    console.error('tenant-backfill-executor: PLAN_READ_FAILED');
    console.error(String(error && error.message ? error.message : error).split('\n')[0]);
    process.exitCode = 2;
    return;
  }

  const validation = validatePlan(plan);
  const execHash = computePlanExecHash(plan);
  if (!validation.ok) {
    console.error('tenant-backfill-executor: PLAN_INVALID');
    console.error(validation.errors.map((e) => e.code).join(','));
    process.exitCode = 2;
    return;
  }
  if (args.expectedPlanHash && args.expectedPlanHash !== execHash) {
    console.error(`tenant-backfill-executor: ${ABORT_CODE.INVALID_PLAN_HASH}`);
    process.exitCode = 2;
    return;
  }

  console.log('tenant-backfill-executor: DRY_RUN_OK (no DB adapter, no mutation)');
  console.log(`execHash: ${execHash}`);
  console.log(`readyActions: ${validation.readyActions.length}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  LIVE_WRITE_ENABLED,
  APPLY_STATUS,
  ROLLBACK_STATUS,
  ROLLBACK_SUMMARY,
  ABORT_CODE,
  SUPPORTED_MODELS,
  computePlanExecHash,
  validatePlan,
  createMockRepository,
  applyPlan,
  rollbackPlan,
  buildManifest,
  summarize,
  assertLiveApplyGate,
  parseArgs,
};
