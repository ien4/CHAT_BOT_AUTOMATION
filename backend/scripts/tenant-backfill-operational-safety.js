'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const {
  ADAPTER_CODE,
  validateApproval,
  assertTargetConfirmation,
  evaluateNoActionPolicy,
} = require('./tenant-backfill-prisma-adapter');
const {
  LIVE_WRITE_ENABLED,
  computePlanExecHash,
  validatePlan,
} = require('./tenant-backfill-executor');

const DEFAULT_AUTHORITY_POLICY = Object.freeze({
  maxApprovalAgeMs: 60 * 60 * 1000,
  allowedClockSkewMs: 5 * 60 * 1000,
  purpose: 'tenant-backfill',
});

const OPERATIONAL_CODE = Object.freeze({
  AUTHORITY_OK: 'AUTHORITY_OK',
  APPROVAL_REUSED: 'APPROVAL_REUSED',
  JOURNAL_ALREADY_EXISTS: 'JOURNAL_ALREADY_EXISTS',
  JOURNAL_WRITE_FAILED: 'JOURNAL_WRITE_FAILED',
  JOURNAL_CORRUPTED: 'JOURNAL_CORRUPTED',
  MANIFEST_ALREADY_EXISTS: 'MANIFEST_ALREADY_EXISTS',
  MANIFEST_WRITE_FAILED: 'MANIFEST_WRITE_FAILED',
  MANIFEST_FINALIZED: 'MANIFEST_FINALIZED',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
});

const RECOVERY_STATE = Object.freeze({
  CLEAN_NOT_STARTED: 'CLEAN_NOT_STARTED',
  PREPARED_NO_DB_WRITE: 'PREPARED_NO_DB_WRITE',
  DB_COMMITTED_MANIFEST_PENDING: 'DB_COMMITTED_MANIFEST_PENDING',
  MANIFEST_FINALIZED: 'MANIFEST_FINALIZED',
  COMPLETED: 'COMPLETED',
  CONFLICT_ONLY: 'CONFLICT_ONLY',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  JOURNAL_CORRUPTED: 'JOURNAL_CORRUPTED',
});

const JOURNAL_EVENT = Object.freeze({
  OPERATION_PREPARED: 'OPERATION_PREPARED',
  ACTION_PENDING: 'ACTION_PENDING',
  ACTION_DB_COMMITTED: 'ACTION_DB_COMMITTED',
  ACTION_MANIFEST_RECORDED: 'ACTION_MANIFEST_RECORDED',
  ACTION_CONFLICT: 'ACTION_CONFLICT',
  ACTION_FAILED: 'ACTION_FAILED',
  OPERATION_NO_ACTION: 'OPERATION_NO_ACTION',
  OPERATION_COMPLETED: 'OPERATION_COMPLETED',
  OPERATION_RECOVERY_REQUIRED: 'OPERATION_RECOVERY_REQUIRED',
});

const HASH_RE = /^[0-9a-f]{64}$/;
const UNSAFE_KEY_RE = /(secret|token|databaseurl|connectionstring|raw|payload|message|content|phone|email|fbuserid|fbusername|customername|customerid)/i;

class OperationalSafetyError extends Error {
  constructor(code, safeMessage, details = {}) {
    super(safeMessage || code);
    this.name = 'OperationalSafetyError';
    this.code = code;
    this.safeMessage = safeMessage || code;
    this.details = details;
  }
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashObject(value) {
  return sha256Hex(stableStringify(value));
}

function isoNow(now = null) {
  if (now) return new Date(now).toISOString();
  return new Date().toISOString();
}

function parseTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function defaultBaseDir() {
  return path.resolve(__dirname, '..', '..', 'tmp-runtime');
}

function classifyHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return 'UNKNOWN';
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '127.0.0.1') return 'LOCAL';
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map((part) => Number(part));
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'LOCAL';
    return 'REMOTE';
  }
  return 'REMOTE';
}

function buildMaskedTargetIdentity({
  target,
  environmentClass,
  connectionUrl = null,
  provider = null,
  databaseName = null,
  hostClass = null,
} = {}) {
  let parsedProvider = provider || null;
  let parsedDatabase = databaseName || null;
  let parsedHostClass = hostClass || null;

  if (connectionUrl) {
    try {
      const parsed = new URL(String(connectionUrl));
      parsedProvider = parsedProvider || parsed.protocol.replace(/:$/, '');
      parsedDatabase = parsedDatabase || decodeURIComponent(parsed.pathname || '').replace(/^\//, '') || null;
      parsedHostClass = parsedHostClass || classifyHost(parsed.hostname);
    } catch (_) {
      parsedProvider = parsedProvider || null;
      parsedDatabase = parsedDatabase || null;
      parsedHostClass = parsedHostClass || 'UNKNOWN';
    }
  }

  return {
    target: target || null,
    environmentClass: environmentClass || null,
    hostClass: parsedHostClass || null,
    databaseName: parsedDatabase || null,
    provider: parsedProvider || null,
  };
}

function actionModel(action) {
  return action && action.model ? String(action.model) : null;
}

function actionIsClassB(action) {
  const value = String(action?.provenanceClass || action?.classification || action?.mappingClass || action?.class || '').toUpperCase();
  return value === 'B' || value === 'CLASS_B';
}

function ledgerHasCompletedApproval(ledger, approvalId) {
  if (!approvalId || !ledger) return false;
  const rows = Array.isArray(ledger)
    ? ledger
    : Array.isArray(ledger.operations)
      ? ledger.operations
      : [];
  return rows.some((row) => row && row.approvalId === approvalId && (
    row.status === 'COMPLETED' ||
    row.eventType === JOURNAL_EVENT.OPERATION_COMPLETED ||
    row.completed === true
  ));
}

function validateOperationAuthority({
  approval,
  planHash,
  execHash,
  target,
  confirmTarget,
  targetIdentity,
  readyActions = [],
  requiredModels = null,
  approvalLedger = null,
  policy = {},
  now = null,
} = {}) {
  const effectivePolicy = { ...DEFAULT_AUTHORITY_POLICY, ...policy };
  const nowIso = isoNow(now);
  const models = requiredModels || unique((readyActions || []).map(actionModel));
  const targetName = confirmTarget || target || approval?.target || null;
  const errors = [];

  const baseValidation = validateApproval(approval, {
    now: nowIso,
    target: targetName,
    planHash,
    execHash,
    readyCount: Array.isArray(readyActions) ? readyActions.length : 0,
    requiredModels: models,
  });
  if (!baseValidation.ok) errors.push(...(baseValidation.errors || [baseValidation.code]));

  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    return {
      ok: false,
      code: ADAPTER_CODE.APPROVAL_INVALID,
      errors: unique(errors),
      approvalHash: null,
      targetConfirmation: null,
    };
  }

  if (!approval.approvalId || typeof approval.approvalId !== 'string' || approval.approvalId.trim() === '') {
    errors.push('APPROVAL_ID_REQUIRED');
  }
  if (approval.purpose !== effectivePolicy.purpose) {
    errors.push('PURPOSE_MISMATCH');
  }

  const approvedAt = parseTime(approval.approvedAt);
  const expiresAt = parseTime(approval.expiresAt);
  const nowMs = parseTime(nowIso);
  if (Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && approvedAt >= expiresAt) {
    errors.push('APPROVED_AT_AFTER_EXPIRES_AT');
  }
  if (Number.isFinite(approvedAt) && approvedAt - nowMs > effectivePolicy.allowedClockSkewMs) {
    errors.push('APPROVED_AT_IN_FUTURE');
  }
  if (Number.isFinite(approvedAt) && nowMs - approvedAt > effectivePolicy.maxApprovalAgeMs) {
    errors.push(ADAPTER_CODE.APPROVAL_EXPIRED);
  }
  if (ledgerHasCompletedApproval(approvalLedger, approval.approvalId)) {
    errors.push(OPERATIONAL_CODE.APPROVAL_REUSED);
  }
  if (Array.isArray(readyActions) && readyActions.some(actionIsClassB) && approval.allowClassB !== true) {
    errors.push('CLASS_B_NOT_APPROVED');
  }

  const dbIdentity = targetIdentity || {};
  const targetConfirmation = assertTargetConfirmation({
    confirmTarget: targetName,
    approval,
    dbIdentity,
    expectedDatabaseName: approval.expectedDatabaseName || null,
    expectedEnvironmentClass: approval.expectedEnvironmentClass || null,
  });
  if (!targetConfirmation.ok) errors.push(...(targetConfirmation.errors || [targetConfirmation.code]));

  const deduped = unique(errors);
  let code = 'AUTHORITY_OK';
  if (deduped.includes(OPERATIONAL_CODE.APPROVAL_REUSED)) code = OPERATIONAL_CODE.APPROVAL_REUSED;
  else if (deduped.includes(ADAPTER_CODE.APPROVAL_EXPIRED)) code = ADAPTER_CODE.APPROVAL_EXPIRED;
  else if (!targetConfirmation.ok) code = ADAPTER_CODE.TARGET_CONFIRMATION_FAILED;
  else if (deduped.length > 0) code = ADAPTER_CODE.APPROVAL_INVALID;

  return {
    ok: deduped.length === 0,
    code,
    errors: deduped,
    approvalHash: hashObject(approval),
    adapterValidation: baseValidation,
    targetConfirmation,
  };
}

function buildOperationIdentity({
  approval,
  planHash = null,
  execHash = null,
  target = null,
  targetIdentity = null,
  nonce = null,
  now = null,
} = {}) {
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    throw new OperationalSafetyError(ADAPTER_CODE.APPROVAL_INVALID, 'Approval is required');
  }
  const approvalHash = hashObject(approval);
  const operationNonce = nonce || crypto.randomBytes(16).toString('hex');
  const resolvedPlanHash = planHash || approval.planHash || null;
  const resolvedExecHash = execHash || approval.execHash || null;
  const resolvedTarget = target || approval.target || null;
  const operationId = sha256Hex(stableStringify({
    execHash: resolvedExecHash,
    target: resolvedTarget,
    approvalHash,
    nonce: operationNonce,
  }));

  return {
    version: 1,
    operationId,
    planHash: resolvedPlanHash,
    execHash: resolvedExecHash,
    target: resolvedTarget,
    approvalHash,
    approvalId: approval.approvalId || null,
    approvedBy: approval.approvedBy || null,
    approvedAt: approval.approvedAt || null,
    expiresAt: approval.expiresAt || null,
    createdAt: isoNow(now),
    nonceHash: sha256Hex(operationNonce),
    targetIdentity: targetIdentity || null,
  };
}

function resolveJournalPath(baseDir, operationId) {
  return path.join(baseDir || defaultBaseDir(), 'tenant-backfill-operations', `${operationId}.journal.jsonl`);
}

function resolveManifestPath(baseDir, operationId) {
  return path.join(baseDir || defaultBaseDir(), 'tenant-backfill-manifests', `${operationId}.manifest.json`);
}

function rejectUnsafeKeys(value, pathPrefix = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafeKeys(item, `${pathPrefix}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (UNSAFE_KEY_RE.test(key)) {
      throw new OperationalSafetyError(ADAPTER_CODE.APPROVAL_INVALID, 'Unsafe journal or manifest key', { key: currentPath });
    }
    rejectUnsafeKeys(value[key], currentPath);
  }
}

function eventPayloadWithoutHash(event) {
  const { eventHash, ...rest } = event;
  return rest;
}

function computeJournalEventHash(event) {
  return hashObject(eventPayloadWithoutHash(event));
}

function parseJournalContent(content) {
  if (!content) return [];
  if (!content.endsWith('\n')) {
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_CORRUPTED, 'Journal final line is truncated');
  }
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function verifyJournalEvents(events) {
  let previousHash = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    if (!event || event.version !== 1 || event.sequence !== expectedSequence) {
      return { ok: false, reason: 'SEQUENCE_INVALID', index };
    }
    if ((event.previousEventHash || null) !== previousHash) {
      return { ok: false, reason: 'PREVIOUS_HASH_INVALID', index };
    }
    if (!HASH_RE.test(String(event.eventHash || '')) || computeJournalEventHash(event) !== event.eventHash) {
      return { ok: false, reason: 'EVENT_HASH_INVALID', index };
    }
    previousHash = event.eventHash;
  }
  return { ok: true, lastHash: previousHash, lastSequence: events.length };
}

async function readJournalEvents(journalPath) {
  try {
    const content = await fsp.readFile(journalPath, 'utf8');
    const events = parseJournalContent(content);
    const verification = verifyJournalEvents(events);
    if (!verification.ok) {
      throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_CORRUPTED, 'Journal hash chain is invalid', verification);
    }
    return { events, verification };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { events: [], verification: { ok: true, lastHash: null, lastSequence: 0 } };
    if (error instanceof OperationalSafetyError) throw error;
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_CORRUPTED, 'Journal cannot be parsed safely');
  }
}

async function fsyncDirectoryIfSupported(dirPath) {
  let handle;
  try {
    handle = await fsp.open(dirPath, 'r');
    await handle.sync();
    await handle.close();
    return true;
  } catch (_) {
    if (handle) {
      try { await handle.close(); } catch (_) {}
    }
    return false;
  }
}

async function durableAppendLine(filePath, line) {
  let handle;
  try {
    handle = await fsp.open(filePath, 'a');
    await handle.write(line, 0, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      try { await handle.close(); } catch (_) {}
    }
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_WRITE_FAILED, 'Journal append failed');
  }
}

async function appendJournalEvent({
  journalPath,
  operation,
  operationId = null,
  eventType,
  timestamp = null,
  payload = {},
} = {}) {
  if (!journalPath || !eventType) {
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_WRITE_FAILED, 'Journal path and event type are required');
  }
  rejectUnsafeKeys(payload);

  const { events, verification } = await readJournalEvents(journalPath);
  const resolvedOperationId = operationId || operation?.operationId;
  const event = {
    ...payload,
    version: 1,
    operationId: resolvedOperationId,
    sequence: verification.lastSequence + 1,
    eventType,
    timestamp: isoNow(timestamp),
    planHash: operation?.planHash || payload.planHash || null,
    execHash: operation?.execHash || payload.execHash || null,
    target: operation?.target || payload.target || null,
    previousEventHash: verification.lastHash || null,
  };
  event.eventHash = computeJournalEventHash(event);

  await durableAppendLine(journalPath, `${stableStringify(event)}\n`);
  return { event, previousEventCount: events.length };
}

async function createPendingJournal({ baseDir = null, operation, timestamp = null } = {}) {
  if (!operation || !operation.operationId) {
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_WRITE_FAILED, 'Operation identity is required');
  }
  const journalDir = path.join(baseDir || defaultBaseDir(), 'tenant-backfill-operations');
  await fsp.mkdir(journalDir, { recursive: true });
  const journalPath = path.join(journalDir, `${operation.operationId}.journal.jsonl`);
  let handle;
  try {
    handle = await fsp.open(journalPath, 'wx');
    await handle.sync();
    await handle.close();
    handle = null;
    await fsyncDirectoryIfSupported(journalDir);
  } catch (error) {
    if (handle) {
      try { await handle.close(); } catch (_) {}
    }
    if (error && error.code === 'EEXIST') {
      throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_ALREADY_EXISTS, 'Operation journal already exists');
    }
    throw new OperationalSafetyError(OPERATIONAL_CODE.JOURNAL_WRITE_FAILED, 'Journal create failed');
  }

  const prepared = await appendJournalEvent({
    journalPath,
    operation,
    eventType: JOURNAL_EVENT.OPERATION_PREPARED,
    timestamp,
  });
  return { journalPath, preparedEvent: prepared.event };
}

async function finalizeRollbackManifest({
  baseDir = null,
  manifestDir = null,
  operation,
  targetIdentity = null,
  actions = [],
  status = 'COMPLETED',
  createdAt = null,
  finalizedAt = null,
} = {}) {
  if (!operation || !operation.operationId) {
    throw new OperationalSafetyError(OPERATIONAL_CODE.MANIFEST_WRITE_FAILED, 'Operation identity is required');
  }

  const finalDir = manifestDir || path.join(baseDir || defaultBaseDir(), 'tenant-backfill-manifests');
  const finalPath = path.join(finalDir, `${operation.operationId}.manifest.json`);
  const tempPath = path.join(finalDir, `${operation.operationId}.manifest.tmp-${crypto.randomBytes(8).toString('hex')}`);

  const safeActions = actions.map((action) => ({
    model: action.model,
    recordId: action.recordId,
    oldTenantId: action.oldTenantId ?? null,
    newTenantId: action.newTenantId ?? null,
    appliedAt: action.appliedAt || null,
    result: action.result || null,
    journalSequence: action.journalSequence || null,
  }));
  rejectUnsafeKeys({ actions: safeActions });

  const manifest = {
    version: 1,
    operationId: operation.operationId,
    planHash: operation.planHash,
    execHash: operation.execHash,
    approvalHash: operation.approvalHash,
    targetIdentity: targetIdentity || operation.targetIdentity || {},
    createdAt: createdAt || operation.createdAt || isoNow(),
    finalizedAt: isoNow(finalizedAt),
    status,
    actions: safeActions,
  };

  try {
    await fsp.mkdir(finalDir, { recursive: true });
    await fsp.access(finalPath, fs.constants.F_OK)
      .then(() => {
        throw new OperationalSafetyError(OPERATIONAL_CODE.MANIFEST_ALREADY_EXISTS, 'Manifest already exists');
      })
      .catch((error) => {
        if (error instanceof OperationalSafetyError) throw error;
        if (error && error.code !== 'ENOENT') throw error;
      });

    let handle;
    try {
      handle = await fsp.open(tempPath, 'wx');
      await handle.write(`${stableStringify(manifest)}\n`, 0, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
    } catch (error) {
      if (handle) {
        try { await handle.close(); } catch (_) {}
      }
      throw error;
    }

    // Exclusive finalization: hard-link creates the final path only if absent.
    // This avoids overwrite races that a plain rename could permit.
    await fsp.link(tempPath, finalPath).catch((error) => {
      if (error && error.code === 'EEXIST') {
        throw new OperationalSafetyError(OPERATIONAL_CODE.MANIFEST_ALREADY_EXISTS, 'Manifest already exists');
      }
      throw error;
    });
    await fsp.unlink(tempPath);
    const parentDirectorySynced = await fsyncDirectoryIfSupported(finalDir);
    return { manifestPath: finalPath, manifest, parentDirectorySynced };
  } catch (error) {
    if (error instanceof OperationalSafetyError) throw error;
    throw new OperationalSafetyError(OPERATIONAL_CODE.MANIFEST_WRITE_FAILED, 'Manifest finalize failed');
  }
}

async function inspectRecoveryState({ journalPath, manifestPath = null } = {}) {
  if (!journalPath) {
    return { state: RECOVERY_STATE.CLEAN_NOT_STARTED, events: [], validHashChain: true };
  }
  try {
    await fsp.access(journalPath, fs.constants.F_OK);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { state: RECOVERY_STATE.CLEAN_NOT_STARTED, events: [], validHashChain: true };
    }
    throw error;
  }

  try {
    const { events, verification } = await readJournalEvents(journalPath);
    const eventTypes = events.map((event) => event.eventType);
    const committedCount = eventTypes.filter((type) => type === JOURNAL_EVENT.ACTION_DB_COMMITTED).length;
    const recordedCount = eventTypes.filter((type) => type === JOURNAL_EVENT.ACTION_MANIFEST_RECORDED).length;
    const hasManifest = manifestPath ? fs.existsSync(manifestPath) : false;

    let state = RECOVERY_STATE.PREPARED_NO_DB_WRITE;
    if (events.length === 0) state = RECOVERY_STATE.CLEAN_NOT_STARTED;
    else if (eventTypes.includes(JOURNAL_EVENT.OPERATION_RECOVERY_REQUIRED)) state = RECOVERY_STATE.RECOVERY_REQUIRED;
    else if (committedCount > recordedCount) state = RECOVERY_STATE.DB_COMMITTED_MANIFEST_PENDING;
    else if (eventTypes.includes(JOURNAL_EVENT.OPERATION_COMPLETED)) state = RECOVERY_STATE.COMPLETED;
    else if (eventTypes.includes(JOURNAL_EVENT.ACTION_MANIFEST_RECORDED) || hasManifest) state = RECOVERY_STATE.MANIFEST_FINALIZED;
    else if (eventTypes.includes(JOURNAL_EVENT.ACTION_CONFLICT) && committedCount === 0) state = RECOVERY_STATE.CONFLICT_ONLY;

    return {
      state,
      events,
      eventCount: events.length,
      validHashChain: true,
      lastEventHash: verification.lastHash || null,
    };
  } catch (error) {
    if (error instanceof OperationalSafetyError && error.code === OPERATIONAL_CODE.JOURNAL_CORRUPTED) {
      return {
        state: RECOVERY_STATE.JOURNAL_CORRUPTED,
        events: [],
        eventCount: 0,
        validHashChain: false,
        reason: error.details?.reason || error.safeMessage,
      };
    }
    throw error;
  }
}

function assertNoActionPolicy({ plan, expectedExecHash = null, requireArtifact = false } = {}) {
  const validation = validatePlan(plan);
  if (!validation.ok) {
    return { ok: false, code: validation.errors[0]?.code || 'PLAN_INVALID', errors: validation.errors || [] };
  }
  const execHash = computePlanExecHash(plan);
  if (expectedExecHash && expectedExecHash !== execHash) {
    return { ok: false, code: 'INVALID_PLAN_HASH', errors: ['EXEC_HASH_MISMATCH'] };
  }
  const policy = evaluateNoActionPolicy(plan);
  if (policy.readyCount === 0) {
    return {
      ok: true,
      code: ADAPTER_CODE.NO_ACTION_REQUIRED,
      exitCode: 0,
      readyCount: 0,
      execHash,
      shouldConnectDb: false,
      shouldCreateRollbackManifest: false,
      shouldCreateNoActionJournal: Boolean(requireArtifact),
    };
  }
  return {
    ok: true,
    code: OPERATIONAL_CODE.ACTION_REQUIRED,
    exitCode: 0,
    readyCount: policy.readyCount,
    execHash,
    shouldConnectDb: true,
    shouldCreateRollbackManifest: true,
  };
}

module.exports = {
  DEFAULT_AUTHORITY_POLICY,
  OPERATIONAL_CODE,
  RECOVERY_STATE,
  JOURNAL_EVENT,
  OperationalSafetyError,
  stableStringify,
  hashObject,
  buildMaskedTargetIdentity,
  validateOperationAuthority,
  buildOperationIdentity,
  createPendingJournal,
  appendJournalEvent,
  finalizeRollbackManifest,
  inspectRecoveryState,
  assertNoActionPolicy,
  computeJournalEventHash,
  LIVE_WRITE_ENABLED,
};
