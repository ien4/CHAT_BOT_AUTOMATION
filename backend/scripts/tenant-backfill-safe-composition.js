'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const {
  LIVE_WRITE_ENABLED,
  APPLY_STATUS,
  ROLLBACK_STATUS,
  computePlanExecHash,
  validatePlan,
} = require('./tenant-backfill-executor');
const {
  ADAPTER_CODE,
} = require('./tenant-backfill-prisma-adapter');
const {
  OPERATIONAL_CODE,
  RECOVERY_STATE,
  JOURNAL_EVENT,
  OperationalSafetyError,
  validateOperationAuthority,
  buildOperationIdentity,
  createPendingJournal,
  appendJournalEvent,
  finalizeRollbackManifest,
  inspectRecoveryState,
  assertNoActionPolicy,
} = require('./tenant-backfill-operational-safety');

const COMPOSITION_CODE = Object.freeze({
  PREPARED: 'PREPARED',
  APPLIED: 'APPLIED',
  ROLLBACK_COMPLETED: 'ROLLBACK_COMPLETED',
  NO_ACTION_REQUIRED: ADAPTER_CODE.NO_ACTION_REQUIRED,
  PLAN_INVALID: 'PLAN_INVALID',
  INVALID_PLAN_HASH: 'INVALID_PLAN_HASH',
  AUTHORITY_REJECTED: 'AUTHORITY_REJECTED',
  APPROVAL_REUSED: OPERATIONAL_CODE.APPROVAL_REUSED,
  TARGET_CONFIRMATION_FAILED: ADAPTER_CODE.TARGET_CONFIRMATION_FAILED,
  OPERATION_PREPARED_REQUIRES_OPERATOR_DECISION: 'OPERATION_PREPARED_REQUIRES_OPERATOR_DECISION',
  MANIFEST_FINALIZED_REQUIRES_OPERATOR_DECISION: 'MANIFEST_FINALIZED_REQUIRES_OPERATOR_DECISION',
  OPERATION_COMPLETED_REJECTED: 'OPERATION_COMPLETED_REJECTED',
  JOURNAL_CORRUPTED: OPERATIONAL_CODE.JOURNAL_CORRUPTED,
  JOURNAL_WRITE_FAILED: OPERATIONAL_CODE.JOURNAL_WRITE_FAILED,
  MANIFEST_ALREADY_EXISTS: OPERATIONAL_CODE.MANIFEST_ALREADY_EXISTS,
  MANIFEST_WRITE_FAILED: OPERATIONAL_CODE.MANIFEST_WRITE_FAILED,
  RECOVERY_REQUIRED: RECOVERY_STATE.RECOVERY_REQUIRED,
  DB_COMMITTED_MANIFEST_PENDING: RECOVERY_STATE.DB_COMMITTED_MANIFEST_PENDING,
  SKIP_WRITE_CONFLICT: APPLY_STATUS.SKIP_WRITE_CONFLICT,
  ACTION_FAILED: 'ACTION_FAILED',
  COMMIT_STATE_UNKNOWN: 'COMMIT_STATE_UNKNOWN',
  COMPLETION_LEDGER_FAILED: 'COMPLETION_LEDGER_FAILED',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  ROLLBACK_AUTHORITY_REJECTED: 'ROLLBACK_AUTHORITY_REJECTED',
  ROLLBACK_CONFLICT: ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT,
  ROLLBACK_FAILED: ROLLBACK_STATUS.ROLLBACK_FAILED,
});

const PHASE = Object.freeze({
  PLAN: 'PLAN',
  AUTHORITY: 'AUTHORITY',
  TARGET: 'TARGET',
  JOURNAL: 'JOURNAL',
  ADAPTER: 'ADAPTER',
  MANIFEST: 'MANIFEST',
  RECOVERY: 'RECOVERY',
  COMPLETION: 'COMPLETION',
  ROLLBACK: 'ROLLBACK',
});

const SAFE_META_KEYS = new Set([
  'operationId',
  'phase',
  'actionIndex',
  'model',
  'maskedRecordId',
  'safeErrorCode',
  'readyCount',
  'applied',
  'conflict',
  'recoverable',
  'requiresOperator',
]);

const HASH_RE = /^[0-9a-f]{64}$/;

function nowIso(clock) {
  if (typeof clock === 'function') return new Date(clock()).toISOString();
  if (clock && typeof clock.now === 'function') return new Date(clock.now()).toISOString();
  return new Date().toISOString();
}

function defaultNonceFactory() {
  return crypto.randomBytes(16).toString('hex');
}

function defaultBaseDir() {
  return path.resolve(__dirname, '..', '..', 'tmp-runtime');
}

function resolveJournalPath(baseDir, operationId) {
  return path.join(baseDir || defaultBaseDir(), 'tenant-backfill-operations', `${operationId}.journal.jsonl`);
}

function resolveManifestPath(baseDir, operationId) {
  return path.join(baseDir || defaultBaseDir(), 'tenant-backfill-manifests', `${operationId}.manifest.json`);
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function createDefaultFilesystemSafety() {
  return {
    createPendingJournal,
    appendJournalEvent,
    finalizeRollbackManifest,
    inspectRecoveryState,
    pathExists,
    async readManifest(manifestPath) {
      return JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    },
  };
}

function normalizeFilesystemSafety(filesystemSafety = {}) {
  const defaults = createDefaultFilesystemSafety();
  return { ...defaults, ...filesystemSafety };
}

function normalizeLedger(completedOperationsLedger = null) {
  return {
    async hasApproval(approvalId) {
      if (!approvalId || !completedOperationsLedger) return false;
      if (typeof completedOperationsLedger.hasApproval === 'function') {
        return Boolean(await completedOperationsLedger.hasApproval(approvalId));
      }
      const rows = Array.isArray(completedOperationsLedger)
        ? completedOperationsLedger
        : Array.isArray(completedOperationsLedger.operations)
          ? completedOperationsLedger.operations
          : [];
      return rows.some((row) => row && row.approvalId === approvalId);
    },
    async recordCompletion(record) {
      if (!completedOperationsLedger || typeof completedOperationsLedger.recordCompletion !== 'function') return;
      await completedOperationsLedger.recordCompletion(record);
    },
  };
}

function safeErrorCode(error, fallback) {
  const code = error && typeof error.code === 'string' ? error.code : fallback;
  return /^[A-Z0-9_]+$/.test(code) ? code : fallback;
}

function compositionResult({
  ok,
  code,
  phase,
  operationId = null,
  actionIndex = null,
  recoverable = false,
  requiresOperator = false,
  safeErrorCode: resultSafeErrorCode = null,
  context = null,
  results = [],
  manifest = null,
  recoveryState = null,
} = {}) {
  return {
    ok: Boolean(ok),
    code,
    phase,
    operationId,
    actionIndex,
    recoverable: Boolean(recoverable),
    requiresOperator: Boolean(requiresOperator),
    safeErrorCode: resultSafeErrorCode || code,
    context,
    results,
    manifest,
    recoveryState,
  };
}

function sanitizeLoggerMeta(meta = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!SAFE_META_KEYS.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

function safeLog(logger, level, label, meta = {}) {
  if (!logger || typeof logger[level] !== 'function') return;
  logger[level](label, sanitizeLoggerMeta(meta));
}

function maskRecordId(recordId) {
  return `id_${crypto.createHash('sha256').update(String(recordId || '')).digest('hex').slice(0, 12)}`;
}

function tenantPresence(value) {
  return value === null || value === undefined ? 'ABSENT' : 'PRESENT';
}

function safeActionPayload(action, actionIndex) {
  return {
    model: action.model,
    maskedRecordId: maskRecordId(action.recordId),
    oldTenantIdPresence: tenantPresence(action.oldTenantId),
    newTenantIdPresence: tenantPresence(action.newTenantId),
    actionIndex,
  };
}

function actionRef(action) {
  return {
    model: action.model,
    recordId: action.recordId,
    oldTenantId: action.oldTenantId ?? null,
    newTenantId: action.newTenantId ?? null,
  };
}

function classifyRepositoryResult(result) {
  if (result === true || result?.applied === true || result?.status === APPLY_STATUS.APPLIED || result?.status === 'APPLIED') {
    return 'APPLIED';
  }
  if (result === false || result?.conflict === true || result?.status === APPLY_STATUS.SKIP_WRITE_CONFLICT || result?.status === 'SKIP_WRITE_CONFLICT') {
    return 'CONFLICT';
  }
  if (result?.commitStateUnknown === true || result?.status === COMPOSITION_CODE.COMMIT_STATE_UNKNOWN) {
    return COMPOSITION_CODE.COMMIT_STATE_UNKNOWN;
  }
  if (result?.failed === true || result?.status === APPLY_STATUS.FAILED || result?.status === 'FAILED') {
    return 'FAILED';
  }
  return COMPOSITION_CODE.COMMIT_STATE_UNKNOWN;
}

function stateToExistingOperationResult(stateResult, operationId) {
  const state = stateResult.state;
  if (state === RECOVERY_STATE.PREPARED_NO_DB_WRITE) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.OPERATION_PREPARED_REQUIRES_OPERATOR_DECISION,
      phase: PHASE.RECOVERY,
      operationId,
      requiresOperator: true,
      recoveryState: state,
    });
  }
  if (state === RECOVERY_STATE.DB_COMMITTED_MANIFEST_PENDING || state === RECOVERY_STATE.RECOVERY_REQUIRED) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.RECOVERY_REQUIRED,
      phase: PHASE.RECOVERY,
      operationId,
      recoverable: true,
      requiresOperator: true,
      recoveryState: state,
    });
  }
  if (state === RECOVERY_STATE.COMPLETED) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.OPERATION_COMPLETED_REJECTED,
      phase: PHASE.COMPLETION,
      operationId,
      requiresOperator: true,
      recoveryState: state,
    });
  }
  if (state === RECOVERY_STATE.JOURNAL_CORRUPTED) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.JOURNAL_CORRUPTED,
      phase: PHASE.JOURNAL,
      operationId,
      recoverable: true,
      requiresOperator: true,
      recoveryState: state,
    });
  }
  if (state === RECOVERY_STATE.MANIFEST_FINALIZED || state === RECOVERY_STATE.CONFLICT_ONLY) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.MANIFEST_FINALIZED_REQUIRES_OPERATOR_DECISION,
      phase: PHASE.RECOVERY,
      operationId,
      requiresOperator: true,
      recoveryState: state,
    });
  }
  return null;
}

async function prepareTenantBackfillOperation({
  plan,
  expectedExecHash = null,
  approval,
  target = null,
  confirmTarget = null,
  targetIdentity = {},
  baseDir = null,
  filesystemSafety = null,
  clock = null,
  nonceFactory = null,
  logger = null,
  completedOperationsLedger = null,
  requireNoActionAudit = false,
} = {}) {
  const fsSafety = normalizeFilesystemSafety(filesystemSafety);
  const ledger = normalizeLedger(completedOperationsLedger);
  const timestamp = nowIso(clock);

  const validation = validatePlan(plan);
  if (!validation.ok) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.PLAN_INVALID,
      phase: PHASE.PLAN,
      safeErrorCode: validation.errors[0]?.code || COMPOSITION_CODE.PLAN_INVALID,
    });
  }

  const execHash = computePlanExecHash(plan);
  if (expectedExecHash && expectedExecHash !== execHash) {
    return compositionResult({ ok: false, code: COMPOSITION_CODE.INVALID_PLAN_HASH, phase: PHASE.PLAN });
  }

  if (await ledger.hasApproval(approval?.approvalId || null)) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.APPROVAL_REUSED,
      phase: PHASE.AUTHORITY,
      requiresOperator: true,
    });
  }

  const targetName = confirmTarget || target || approval?.target || targetIdentity?.target || null;
  const readyActions = validation.readyActions;
  const authority = validateOperationAuthority({
    approval,
    planHash: plan.planHash,
    execHash,
    target: targetName,
    confirmTarget: targetName,
    targetIdentity,
    readyActions,
    now: timestamp,
  });
  if (!authority.ok) {
    const phase = authority.code === ADAPTER_CODE.TARGET_CONFIRMATION_FAILED ? PHASE.TARGET : PHASE.AUTHORITY;
    return compositionResult({
      ok: false,
      code: authority.code === ADAPTER_CODE.TARGET_CONFIRMATION_FAILED
        ? COMPOSITION_CODE.TARGET_CONFIRMATION_FAILED
        : COMPOSITION_CODE.AUTHORITY_REJECTED,
      phase,
      safeErrorCode: authority.code,
      requiresOperator: true,
    });
  }

  const noAction = assertNoActionPolicy({ plan, expectedExecHash: execHash, requireArtifact: requireNoActionAudit });
  if (noAction.ok && noAction.code === ADAPTER_CODE.NO_ACTION_REQUIRED) {
    safeLog(logger, 'info', 'tenant_backfill_no_action', { phase: PHASE.COMPLETION, readyCount: 0 });
    return compositionResult({
      ok: true,
      code: COMPOSITION_CODE.NO_ACTION_REQUIRED,
      phase: PHASE.COMPLETION,
      context: {
        operationId: null,
        planHash: plan.planHash,
        execHash,
        approvalHash: authority.approvalHash,
        targetIdentity,
        readyActions: [],
        journalPath: null,
        manifestPath: null,
      },
    });
  }

  const nonce = typeof nonceFactory === 'function' ? nonceFactory() : defaultNonceFactory();
  const operation = buildOperationIdentity({
    approval,
    planHash: plan.planHash,
    execHash,
    target: targetName,
    targetIdentity,
    nonce,
    now: timestamp,
  });
  const journalPath = resolveJournalPath(baseDir, operation.operationId);
  const manifestPath = resolveManifestPath(baseDir, operation.operationId);

  if (await fsSafety.pathExists(journalPath)) {
    const recovery = await fsSafety.inspectRecoveryState({ journalPath, manifestPath });
    const existingResult = stateToExistingOperationResult(recovery, operation.operationId);
    if (existingResult) return existingResult;
  }

  if (await fsSafety.pathExists(manifestPath)) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.MANIFEST_ALREADY_EXISTS,
      phase: PHASE.MANIFEST,
      operationId: operation.operationId,
      requiresOperator: true,
    });
  }

  let prepared;
  try {
    prepared = await fsSafety.createPendingJournal({ baseDir, operation, timestamp });
  } catch (error) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.JOURNAL_WRITE_FAILED,
      phase: PHASE.JOURNAL,
      operationId: operation.operationId,
      recoverable: true,
      safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.JOURNAL_WRITE_FAILED),
    });
  }

  const context = {
    operationId: operation.operationId,
    planHash: plan.planHash,
    execHash,
    approvalHash: authority.approvalHash,
    targetIdentity,
    readyActions,
    journalPath: prepared.journalPath || journalPath,
    manifestPath,
    operation,
    approvalId: approval.approvalId,
  };
  safeLog(logger, 'info', 'tenant_backfill_prepared', {
    operationId: operation.operationId,
    phase: PHASE.JOURNAL,
    readyCount: readyActions.length,
  });
  return compositionResult({
    ok: true,
    code: COMPOSITION_CODE.PREPARED,
    phase: PHASE.JOURNAL,
    operationId: operation.operationId,
    context,
  });
}

async function appendSafeEvent(fsSafety, args) {
  return fsSafety.appendJournalEvent(args);
}

async function markRecoveryRequired({ fsSafety, journalPath, operation, timestamp, safeError }) {
  try {
    await appendSafeEvent(fsSafety, {
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.OPERATION_RECOVERY_REQUIRED,
      timestamp,
      payload: { reason: safeError || COMPOSITION_CODE.RECOVERY_REQUIRED },
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function composeTenantBackfillApply({
  repository,
  filesystemSafety = null,
  logger = null,
  completedOperationsLedger = null,
  clock = null,
  nonceFactory = null,
  ...prepareArgs
} = {}) {
  const fsSafety = normalizeFilesystemSafety(filesystemSafety);
  const ledger = normalizeLedger(completedOperationsLedger);
  const timestamp = nowIso(clock);
  const prepared = await prepareTenantBackfillOperation({
    ...prepareArgs,
    filesystemSafety: fsSafety,
    logger,
    completedOperationsLedger,
    clock,
    nonceFactory,
  });
  if (!prepared.ok || prepared.code === COMPOSITION_CODE.NO_ACTION_REQUIRED) return prepared;
  if (!repository || typeof repository.applyOwnerTransition !== 'function') {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.ACTION_FAILED,
      phase: PHASE.ADAPTER,
      operationId: prepared.operationId,
      safeErrorCode: 'REPOSITORY_REQUIRED',
    });
  }

  const { context } = prepared;
  const { operation, journalPath, targetIdentity, readyActions } = context;
  const results = [];
  const appliedActions = [];

  for (let actionIndex = 0; actionIndex < readyActions.length; actionIndex += 1) {
    const action = readyActions[actionIndex];
    const safeAction = safeActionPayload(action, actionIndex);
    try {
      await appendSafeEvent(fsSafety, {
        journalPath,
        operation,
        eventType: JOURNAL_EVENT.ACTION_PENDING,
        timestamp,
        payload: { action: safeAction },
      });
    } catch (error) {
      return compositionResult({
        ok: false,
        code: COMPOSITION_CODE.JOURNAL_WRITE_FAILED,
        phase: PHASE.JOURNAL,
        operationId: operation.operationId,
        actionIndex,
        recoverable: true,
        safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.JOURNAL_WRITE_FAILED),
        context,
        results,
      });
    }
    safeLog(logger, 'info', 'tenant_backfill_action_pending', {
      operationId: operation.operationId,
      phase: PHASE.JOURNAL,
      actionIndex,
      model: action.model,
      maskedRecordId: safeAction.maskedRecordId,
    });

    let repositoryResult;
    try {
      repositoryResult = await repository.applyOwnerTransition(actionRef(action));
    } catch (error) {
      const code = safeErrorCode(error, COMPOSITION_CODE.ACTION_FAILED);
      try {
        await appendSafeEvent(fsSafety, {
          journalPath,
          operation,
          eventType: JOURNAL_EVENT.ACTION_FAILED,
          timestamp,
          payload: { action: safeAction, errorCode: code },
        });
      } catch (_) {}
      safeLog(logger, 'warn', 'tenant_backfill_action_failed', {
        operationId: operation.operationId,
        phase: PHASE.ADAPTER,
        actionIndex,
        model: action.model,
        maskedRecordId: safeAction.maskedRecordId,
        safeErrorCode: code,
      });
      return compositionResult({
        ok: false,
        code: COMPOSITION_CODE.ACTION_FAILED,
        phase: PHASE.ADAPTER,
        operationId: operation.operationId,
        actionIndex,
        safeErrorCode: code,
        context,
        results,
      });
    }

    const classification = classifyRepositoryResult(repositoryResult);
    if (classification === 'APPLIED') {
      const commitEvent = await appendSafeEvent(fsSafety, {
        journalPath,
        operation,
        eventType: JOURNAL_EVENT.ACTION_DB_COMMITTED,
        timestamp,
        payload: { action: safeAction, result: APPLY_STATUS.APPLIED },
      });
      const applied = {
        ...actionRef(action),
        appliedAt: timestamp,
        result: APPLY_STATUS.APPLIED,
        journalSequence: commitEvent.event.sequence,
      };
      appliedActions.push(applied);
      results.push({ ...actionRef(action), status: APPLY_STATUS.APPLIED });
      safeLog(logger, 'info', 'tenant_backfill_action_applied', {
        operationId: operation.operationId,
        phase: PHASE.ADAPTER,
        actionIndex,
        model: action.model,
        maskedRecordId: safeAction.maskedRecordId,
        applied: true,
      });
      continue;
    }

    if (classification === 'CONFLICT') {
      await appendSafeEvent(fsSafety, {
        journalPath,
        operation,
        eventType: JOURNAL_EVENT.ACTION_CONFLICT,
        timestamp,
        payload: { action: safeAction, conflict: true },
      });
      results.push({ ...actionRef(action), status: APPLY_STATUS.SKIP_WRITE_CONFLICT });
      safeLog(logger, 'warn', 'tenant_backfill_action_conflict', {
        operationId: operation.operationId,
        phase: PHASE.ADAPTER,
        actionIndex,
        model: action.model,
        maskedRecordId: safeAction.maskedRecordId,
        conflict: true,
      });
      continue;
    }

    if (classification === COMPOSITION_CODE.COMMIT_STATE_UNKNOWN) {
      await markRecoveryRequired({
        fsSafety,
        journalPath,
        operation,
        timestamp,
        safeError: COMPOSITION_CODE.COMMIT_STATE_UNKNOWN,
      });
      return compositionResult({
        ok: false,
        code: COMPOSITION_CODE.COMMIT_STATE_UNKNOWN,
        phase: PHASE.RECOVERY,
        operationId: operation.operationId,
        actionIndex,
        recoverable: true,
        requiresOperator: true,
        context,
        results,
      });
    }

    await appendSafeEvent(fsSafety, {
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.ACTION_FAILED,
      timestamp,
      payload: { action: safeAction, errorCode: COMPOSITION_CODE.ACTION_FAILED },
    });
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.ACTION_FAILED,
      phase: PHASE.ADAPTER,
      operationId: operation.operationId,
      actionIndex,
      context,
      results,
    });
  }

  let finalized = null;
  if (appliedActions.length > 0) {
    try {
      finalized = await fsSafety.finalizeRollbackManifest({
        baseDir: prepareArgs.baseDir || null,
        operation,
        targetIdentity,
        actions: appliedActions,
        status: 'COMPLETED',
        finalizedAt: timestamp,
      });
      await appendSafeEvent(fsSafety, {
        journalPath,
        operation,
        eventType: JOURNAL_EVENT.ACTION_MANIFEST_RECORDED,
        timestamp,
        payload: { manifestRecorded: true, appliedCount: appliedActions.length },
      });
    } catch (error) {
      await markRecoveryRequired({
        fsSafety,
        journalPath,
        operation,
        timestamp,
        safeError: safeErrorCode(error, COMPOSITION_CODE.MANIFEST_WRITE_FAILED),
      });
      return compositionResult({
        ok: false,
        code: COMPOSITION_CODE.RECOVERY_REQUIRED,
        phase: PHASE.RECOVERY,
        operationId: operation.operationId,
        recoverable: true,
        requiresOperator: true,
        safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.MANIFEST_WRITE_FAILED),
        context,
        results,
      });
    }
  }

  let completedEvent;
  try {
    completedEvent = await appendSafeEvent(fsSafety, {
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.OPERATION_COMPLETED,
      timestamp,
      payload: { appliedCount: appliedActions.length, conflictCount: results.filter((result) => result.status === APPLY_STATUS.SKIP_WRITE_CONFLICT).length },
    });
  } catch (error) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.JOURNAL_WRITE_FAILED,
      phase: PHASE.COMPLETION,
      operationId: operation.operationId,
      recoverable: true,
      safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.JOURNAL_WRITE_FAILED),
      context,
      results,
    });
  }

  try {
    await ledger.recordCompletion({
      approvalId: context.approvalId,
      operationId: operation.operationId,
      planHash: operation.planHash,
      execHash: operation.execHash,
      target: operation.target,
      completedAt: completedEvent.event.timestamp,
    });
  } catch (error) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.COMPLETION_LEDGER_FAILED,
      phase: PHASE.COMPLETION,
      operationId: operation.operationId,
      recoverable: true,
      safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.COMPLETION_LEDGER_FAILED),
      context,
      results,
      manifest: finalized?.manifest || null,
    });
  }

  safeLog(logger, 'info', 'tenant_backfill_completed', {
    operationId: operation.operationId,
    phase: PHASE.COMPLETION,
    readyCount: readyActions.length,
  });
  return compositionResult({
    ok: true,
    code: COMPOSITION_CODE.APPLIED,
    phase: PHASE.COMPLETION,
    operationId: operation.operationId,
    context,
    results,
    manifest: finalized?.manifest || null,
  });
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
  if (manifest.version !== 1) return false;
  if (!manifest.operationId || typeof manifest.operationId !== 'string') return false;
  if (!HASH_RE.test(String(manifest.planHash || ''))) return false;
  if (!HASH_RE.test(String(manifest.execHash || ''))) return false;
  if (!HASH_RE.test(String(manifest.approvalHash || ''))) return false;
  if (!Array.isArray(manifest.actions)) return false;
  return manifest.actions.every((action) => action && action.model && action.recordId);
}

async function loadManifest({ manifest, manifestPath, filesystemSafety }) {
  if (manifest) return manifest;
  if (!manifestPath) return null;
  return filesystemSafety.readManifest(manifestPath);
}

async function composeTenantBackfillRollback({
  manifest = null,
  manifestPath = null,
  journalPath = null,
  repository,
  approval,
  confirmTarget = null,
  targetIdentity = null,
  expectedOperationId = null,
  expectedPlanHash = null,
  expectedExecHash = null,
  filesystemSafety = null,
  logger = null,
  clock = null,
} = {}) {
  const fsSafety = normalizeFilesystemSafety(filesystemSafety);
  const timestamp = nowIso(clock);
  let loadedManifest;
  try {
    loadedManifest = await loadManifest({ manifest, manifestPath, filesystemSafety: fsSafety });
  } catch (error) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.MANIFEST_INVALID,
      phase: PHASE.MANIFEST,
      safeErrorCode: safeErrorCode(error, COMPOSITION_CODE.MANIFEST_INVALID),
    });
  }
  if (!validateManifest(loadedManifest)) {
    return compositionResult({ ok: false, code: COMPOSITION_CODE.MANIFEST_INVALID, phase: PHASE.MANIFEST });
  }
  if (expectedOperationId && loadedManifest.operationId !== expectedOperationId) {
    return compositionResult({ ok: false, code: COMPOSITION_CODE.MANIFEST_INVALID, phase: PHASE.MANIFEST, operationId: loadedManifest.operationId });
  }
  if (expectedPlanHash && loadedManifest.planHash !== expectedPlanHash) {
    return compositionResult({ ok: false, code: COMPOSITION_CODE.INVALID_PLAN_HASH, phase: PHASE.MANIFEST, operationId: loadedManifest.operationId });
  }
  if (expectedExecHash && loadedManifest.execHash !== expectedExecHash) {
    return compositionResult({ ok: false, code: COMPOSITION_CODE.INVALID_PLAN_HASH, phase: PHASE.MANIFEST, operationId: loadedManifest.operationId });
  }

  const resolvedTargetIdentity = targetIdentity || loadedManifest.targetIdentity || {};
  const targetName = confirmTarget || resolvedTargetIdentity.target || approval?.target || null;
  const authority = validateOperationAuthority({
    approval,
    planHash: loadedManifest.planHash,
    execHash: loadedManifest.execHash,
    confirmTarget: targetName,
    targetIdentity: resolvedTargetIdentity,
    readyActions: loadedManifest.actions,
    now: timestamp,
  });
  if (!authority.ok) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.ROLLBACK_AUTHORITY_REJECTED,
      phase: PHASE.AUTHORITY,
      operationId: loadedManifest.operationId,
      safeErrorCode: authority.code,
      requiresOperator: true,
    });
  }
  if (!journalPath) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.JOURNAL_WRITE_FAILED,
      phase: PHASE.JOURNAL,
      operationId: loadedManifest.operationId,
      requiresOperator: true,
      safeErrorCode: 'JOURNAL_REQUIRED',
    });
  }
  const recovery = await fsSafety.inspectRecoveryState({ journalPath, manifestPath });
  if (recovery.state === RECOVERY_STATE.JOURNAL_CORRUPTED) {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.JOURNAL_CORRUPTED,
      phase: PHASE.JOURNAL,
      operationId: loadedManifest.operationId,
      recoverable: true,
      requiresOperator: true,
      recoveryState: recovery.state,
    });
  }
  if (!repository || typeof repository.rollbackOwnerTransition !== 'function') {
    return compositionResult({
      ok: false,
      code: COMPOSITION_CODE.ROLLBACK_FAILED,
      phase: PHASE.ROLLBACK,
      operationId: loadedManifest.operationId,
      safeErrorCode: 'REPOSITORY_REQUIRED',
    });
  }

  const operation = {
    operationId: loadedManifest.operationId,
    planHash: loadedManifest.planHash,
    execHash: loadedManifest.execHash,
    approvalHash: loadedManifest.approvalHash,
    target: resolvedTargetIdentity.target || targetName || null,
    targetIdentity: resolvedTargetIdentity,
  };
  const results = [];

  for (let actionIndex = 0; actionIndex < loadedManifest.actions.length; actionIndex += 1) {
    const action = loadedManifest.actions[actionIndex];
    const safeAction = safeActionPayload(action, actionIndex);
    await appendSafeEvent(fsSafety, {
      journalPath,
      operation,
      eventType: JOURNAL_EVENT.ACTION_PENDING,
      timestamp,
      payload: { rollback: safeAction },
    });
    try {
      const rollbackResult = await repository.rollbackOwnerTransition(actionRef(action));
      if (rollbackResult === true || rollbackResult?.status === ROLLBACK_STATUS.ROLLED_BACK || rollbackResult?.rolledBack === true) {
        await appendSafeEvent(fsSafety, {
          journalPath,
          operation,
          eventType: JOURNAL_EVENT.ACTION_DB_COMMITTED,
          timestamp,
          payload: { rollback: safeAction, result: ROLLBACK_STATUS.ROLLED_BACK },
        });
        results.push({ ...actionRef(action), status: ROLLBACK_STATUS.ROLLED_BACK });
      } else {
        await appendSafeEvent(fsSafety, {
          journalPath,
          operation,
          eventType: JOURNAL_EVENT.ACTION_CONFLICT,
          timestamp,
          payload: { rollback: safeAction, conflict: true },
        });
        results.push({ ...actionRef(action), status: ROLLBACK_STATUS.SKIP_ROLLBACK_CONFLICT });
      }
    } catch (error) {
      const code = safeErrorCode(error, COMPOSITION_CODE.ROLLBACK_FAILED);
      await appendSafeEvent(fsSafety, {
        journalPath,
        operation,
        eventType: JOURNAL_EVENT.ACTION_FAILED,
        timestamp,
        payload: { rollback: safeAction, errorCode: code },
      });
      safeLog(logger, 'warn', 'tenant_backfill_rollback_failed', {
        operationId: operation.operationId,
        phase: PHASE.ROLLBACK,
        actionIndex,
        model: action.model,
        maskedRecordId: safeAction.maskedRecordId,
        safeErrorCode: code,
      });
      return compositionResult({
        ok: false,
        code: COMPOSITION_CODE.ROLLBACK_FAILED,
        phase: PHASE.ROLLBACK,
        operationId: operation.operationId,
        actionIndex,
        safeErrorCode: code,
        results,
      });
    }
  }

  return compositionResult({
    ok: true,
    code: COMPOSITION_CODE.ROLLBACK_COMPLETED,
    phase: PHASE.ROLLBACK,
    operationId: loadedManifest.operationId,
    results,
    manifest: loadedManifest,
  });
}

async function recoverTenantBackfillOperation({
  journalPath,
  manifestPath = null,
  filesystemSafety = null,
} = {}) {
  const fsSafety = normalizeFilesystemSafety(filesystemSafety);
  const recovery = await fsSafety.inspectRecoveryState({ journalPath, manifestPath });
  if (recovery.state === RECOVERY_STATE.CLEAN_NOT_STARTED) {
    return compositionResult({ ok: true, code: RECOVERY_STATE.CLEAN_NOT_STARTED, phase: PHASE.RECOVERY, recoveryState: recovery.state });
  }
  const mapped = stateToExistingOperationResult(recovery, recovery.events?.[0]?.operationId || null);
  if (mapped) return mapped;
  return compositionResult({
    ok: false,
    code: recovery.state,
    phase: PHASE.RECOVERY,
    recoverable: true,
    requiresOperator: true,
    recoveryState: recovery.state,
  });
}

module.exports = {
  COMPOSITION_CODE,
  PHASE,
  LIVE_WRITE_ENABLED,
  createDefaultFilesystemSafety,
  prepareTenantBackfillOperation,
  composeTenantBackfillApply,
  composeTenantBackfillRollback,
  recoverTenantBackfillOperation,
  maskRecordId,
};
