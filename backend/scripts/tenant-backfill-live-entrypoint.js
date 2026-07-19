'use strict';

// P0-TENANT-BACKFILL-LIVE-ENTRYPOINT-DESIGN-01
// Operational entry boundary for tenant backfill, in a LOCKED design state.
//
// This module validates operational authority (plan, approval, backup proof,
// target confirmation, ledger, journal/manifest collisions) but CANNOT activate
// mutation capability. It intentionally:
//   - never imports PrismaClient or any Prisma repository,
//   - never reads DATABASE_URL, never reads .env / process.env,
//   - never performs a network call,
//   - never requires runtime source under ../src,
//   - never selects a live target on its own.
//
// The only artifacts it may create live in a caller-provided temporary
// directory during dry-run (mock repository only).

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  computePlanExecHash,
  validatePlan,
  createMockRepository,
  LIVE_WRITE_ENABLED,
} = require('./tenant-backfill-executor');
const {
  validateOperationAuthority,
} = require('./tenant-backfill-operational-safety');
const {
  composeTenantBackfillApply,
} = require('./tenant-backfill-safe-composition');
const {
  createFileCompletionLedger,
} = require('./tenant-backfill-completion-ledger');

// Hard live lock. This is NOT read from the environment and there is no code
// path in this module that can flip it to true. Live activation is a separate,
// explicitly-reviewed landing.
const LIVE_ENTRYPOINT_ENABLED = false;

const MODE = Object.freeze({
  VALIDATE: 'validate',
  DRY_RUN: 'dry-run',
  INSPECT: 'inspect',
});

const ENTRYPOINT_CODE = Object.freeze({
  USAGE: 'ENTRYPOINT_USAGE',
  MODE_REQUIRED: 'MODE_REQUIRED',
  MODE_UNSUPPORTED: 'MODE_UNSUPPORTED',
  UNKNOWN_ARGUMENT: 'UNKNOWN_ARGUMENT',
  LIVE_EXECUTION_NOT_ENABLED: 'LIVE_EXECUTION_NOT_ENABLED',
  VALIDATION_OK: 'VALIDATION_OK',
  INSPECT_OK: 'INSPECT_OK',
  DRY_RUN_OK: 'DRY_RUN_OK',
  NO_ACTION_REQUIRED: 'NO_ACTION_REQUIRED',
  ARTIFACT_MISSING: 'ARTIFACT_MISSING',
  ARTIFACT_UNSAFE: 'ARTIFACT_UNSAFE',
  ARTIFACT_OVERSIZED: 'ARTIFACT_OVERSIZED',
  ARTIFACT_SYMLINK: 'ARTIFACT_SYMLINK',
  ARTIFACT_NOT_FILE: 'ARTIFACT_NOT_FILE',
  ARTIFACT_BAD_EXTENSION: 'ARTIFACT_BAD_EXTENSION',
  ARTIFACT_PARSE_FAILED: 'ARTIFACT_PARSE_FAILED',
  PLAN_INVALID: 'PLAN_INVALID',
  PLAN_LIVE_TARGET_FORBIDDEN: 'PLAN_LIVE_TARGET_FORBIDDEN',
  BLOCKED_APPROVAL_MISSING: 'BLOCKED_APPROVAL_MISSING',
  APPROVAL_REJECTED: 'APPROVAL_REJECTED',
  BLOCKED_BACKUP_PROOF_MISSING: 'BLOCKED_BACKUP_PROOF_MISSING',
  BLOCKED_BACKUP_PROOF_STALE: 'BLOCKED_BACKUP_PROOF_STALE',
  TARGET_DESCRIPTOR_INVALID: 'TARGET_DESCRIPTOR_INVALID',
  TARGET_CONFIRMATION_FAILED: 'TARGET_CONFIRMATION_FAILED',
  DIRECTORY_UNSAFE: 'DIRECTORY_UNSAFE',
  APPROVAL_ALREADY_COMPLETED: 'APPROVAL_ALREADY_COMPLETED',
  APPROVAL_ALREADY_CLAIMED: 'APPROVAL_ALREADY_CLAIMED',
  LEDGER_UNAVAILABLE: 'LEDGER_UNAVAILABLE',
  JOURNAL_COLLISION: 'JOURNAL_COLLISION',
  MANIFEST_COLLISION: 'MANIFEST_COLLISION',
});

// Flags that, if present, must NOT be silently ignored: they represent live
// mutation intent which is not available in this design phase.
const FORBIDDEN_LIVE_FLAGS = Object.freeze([
  '--execute',
  '--live',
  '--live-execute',
  '--apply',
  '--rollback',
  '--yes',
]);

const VALUE_FLAGS = Object.freeze({
  '--mode': 'mode',
  '--plan': 'plan',
  '--approval': 'approval',
  '--backup-proof': 'backupProof',
  '--confirm-target': 'confirmTarget',
  '--target-descriptor': 'targetDescriptor',
  '--journal-dir': 'journalDir',
  '--manifest-dir': 'manifestDir',
  '--ledger-path': 'ledgerPath',
  '--max-backup-age-hours': 'maxBackupAgeHours',
});

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_BACKUP_AGE_HOURS = 24;
const HASH_RE = /^[0-9a-f]{64}$/;

const SAFE_LOG_KEYS = new Set([
  'mode', 'phase', 'code', 'artifactType', 'basename', 'hashPrefix',
  'sizeCategory', 'exists', 'count', 'readyCount', 'operationId', 'target',
  'hadBom', 'ok', 'requiresOperator', 'chainValid',
]);

function sanitizeLogMeta(meta = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!SAFE_LOG_KEYS.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

function safeLog(logger, level, label, meta = {}) {
  if (!logger || typeof logger[level] !== 'function') return;
  logger[level](label, sanitizeLogMeta(meta));
}

function sizeCategory(bytes) {
  if (bytes <= 4096) return 'SMALL';
  if (bytes <= 262144) return 'MEDIUM';
  if (bytes <= MAX_ARTIFACT_BYTES) return 'LARGE';
  return 'OVERSIZED';
}

function result(fields) {
  return {
    ok: Boolean(fields.ok),
    code: fields.code,
    mode: fields.mode || null,
    phase: fields.phase || null,
    exitCode: fields.exitCode != null ? fields.exitCode : (fields.ok ? 0 : 1),
    requiresOperator: Boolean(fields.requiresOperator),
    recoverable: Boolean(fields.recoverable),
    safeErrorCode: fields.safeErrorCode || (fields.ok ? null : fields.code),
    readyCount: fields.readyCount != null ? fields.readyCount : null,
    executed: false,
    details: fields.details || null,
  };
}

function parseEntrypointArgs(argv = []) {
  const parsed = {
    mode: null,
    plan: null,
    approval: null,
    backupProof: null,
    confirmTarget: null,
    targetDescriptor: null,
    journalDir: null,
    manifestDir: null,
    ledgerPath: null,
    maxBackupAgeHours: null,
    forbiddenFlag: null,
    unknownFlag: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (FORBIDDEN_LIVE_FLAGS.includes(arg)) {
      parsed.forbiddenFlag = arg;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(VALUE_FLAGS, arg)) {
      const key = VALUE_FLAGS[arg];
      parsed[key] = argv[i + 1] != null ? argv[i + 1] : null;
      i += 1;
      continue;
    }
    parsed.unknownFlag = arg;
  }
  if (parsed.maxBackupAgeHours != null) {
    const numeric = Number(parsed.maxBackupAgeHours);
    parsed.maxBackupAgeHours = Number.isFinite(numeric) ? numeric : parsed.maxBackupAgeHours;
  }
  return parsed;
}

// BOM-tolerant strict JSON loader. Reads a Buffer, strips a UTF-8 BOM in
// memory only, and strict-parses the remainder. It NEVER writes the file back
// and NEVER logs raw content.
async function loadJsonArtifact(filePath, deps = {}) {
  const readFile = (deps.fsProbe && deps.fsProbe.readFile) || ((p) => fsp.readFile(p));
  const buffer = await readFile(filePath);
  const hadBom = buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
  const body = hadBom ? buffer.slice(3) : buffer;
  const text = body.toString('utf8');
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  let parsedValue;
  try {
    parsedValue = JSON.parse(text);
  } catch (error) {
    const err = new Error('ARTIFACT_PARSE_FAILED');
    err.code = ENTRYPOINT_CODE.ARTIFACT_PARSE_FAILED;
    err.hadBom = hadBom;
    throw err;
  }
  return {
    hadBom,
    sizeBytes: buffer.length,
    contentHash,
    parsedValue,
  };
}

const FORBIDDEN_PATH_SEGMENTS = ['.git', 'node_modules'];

function pathHasForbiddenSegment(resolvedPath) {
  const segments = resolvedPath.split(/[\\/]+/);
  return FORBIDDEN_PATH_SEGMENTS.some((forbidden) => segments.includes(forbidden));
}

function looksLikeEnvFile(basename) {
  return basename === '.env' || basename.startsWith('.env.') || basename.startsWith('.env');
}

async function validateArtifactPath(type, rawPath, deps = {}) {
  const fsProbe = deps.fsProbe || {};
  const lstat = fsProbe.lstat || ((p) => fsp.lstat(p));
  const realpath = fsProbe.realpath || ((p) => fsp.realpath(p));

  if (!rawPath) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_MISSING, artifactType: type };
  }
  const resolved = path.resolve(rawPath);
  const basename = path.basename(resolved);

  if (looksLikeEnvFile(basename)) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_UNSAFE, artifactType: type, basename };
  }
  if (pathHasForbiddenSegment(resolved)) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_UNSAFE, artifactType: type, basename };
  }
  if (path.extname(basename).toLowerCase() !== '.json') {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_BAD_EXTENSION, artifactType: type, basename };
  }

  let stat;
  try {
    stat = await lstat(resolved);
  } catch (_) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_MISSING, artifactType: type, basename };
  }
  if (stat.isSymbolicLink && stat.isSymbolicLink()) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_SYMLINK, artifactType: type, basename };
  }
  if (stat.isDirectory && stat.isDirectory()) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_NOT_FILE, artifactType: type, basename };
  }
  if (!(stat.isFile && stat.isFile())) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_NOT_FILE, artifactType: type, basename };
  }
  if (Number(stat.size) > MAX_ARTIFACT_BYTES) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_OVERSIZED, artifactType: type, basename, sizeCategory: 'OVERSIZED' };
  }
  try {
    await realpath(resolved);
  } catch (_) {
    return { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_MISSING, artifactType: type, basename };
  }

  return {
    ok: true,
    artifactType: type,
    basename,
    resolved,
    exists: true,
    sizeBytes: Number(stat.size),
    sizeCategory: sizeCategory(Number(stat.size)),
  };
}

async function validateDirectoryPath(type, rawPath, deps = {}) {
  if (!rawPath) return { ok: true, artifactType: type, provided: false };
  const fsProbe = deps.fsProbe || {};
  const lstat = fsProbe.lstat || ((p) => fsp.lstat(p));
  const resolved = path.resolve(rawPath);
  const basename = path.basename(resolved);

  if (pathHasForbiddenSegment(resolved)) {
    return { ok: false, code: ENTRYPOINT_CODE.DIRECTORY_UNSAFE, artifactType: type, basename };
  }
  // Reject directories that resolve into tracked source / public asset trees.
  const lowered = resolved.toLowerCase().replace(/\\/g, '/');
  const forbiddenRoots = ['/backend/src/', '/backend/prisma/', '/dashboard/', '/docs/', '/public/', '/static/'];
  if (forbiddenRoots.some((root) => lowered.includes(root))) {
    return { ok: false, code: ENTRYPOINT_CODE.DIRECTORY_UNSAFE, artifactType: type, basename };
  }
  try {
    const stat = await lstat(resolved);
    if (stat.isSymbolicLink && stat.isSymbolicLink()) {
      return { ok: false, code: ENTRYPOINT_CODE.DIRECTORY_UNSAFE, artifactType: type, basename };
    }
  } catch (_) {
    // Absent directory is acceptable: it may be created during future activation.
  }
  return { ok: true, artifactType: type, provided: true, resolved, basename };
}

async function validateEntrypointPaths(args, deps = {}) {
  const artifacts = {};
  const errors = [];

  const artifactSpecs = [
    ['plan', args.plan, true],
    ['approval', args.approval, false],
    ['backupProof', args.backupProof, false],
    ['targetDescriptor', args.targetDescriptor, false],
  ];
  for (const [type, rawPath, required] of artifactSpecs) {
    if (!rawPath) {
      artifacts[type] = { ok: false, code: ENTRYPOINT_CODE.ARTIFACT_MISSING, artifactType: type, provided: false };
      if (required) errors.push({ type, code: ENTRYPOINT_CODE.ARTIFACT_MISSING });
      continue;
    }
    const check = await validateArtifactPath(type, rawPath, deps);
    artifacts[type] = { ...check, provided: true };
    if (!check.ok) errors.push({ type, code: check.code });
  }

  const dirs = {};
  for (const [type, rawPath] of [
    ['journalDir', args.journalDir],
    ['manifestDir', args.manifestDir],
    ['ledgerPath', args.ledgerPath ? path.dirname(args.ledgerPath) : null],
  ]) {
    const check = await validateDirectoryPath(type, rawPath, deps);
    dirs[type] = check;
    if (!check.ok) errors.push({ type, code: check.code });
  }

  return { ok: errors.length === 0, artifacts, dirs, errors };
}

// Backup proof schema is local-only and holds NO connection material.
function validateBackupProof(proof, context = {}) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    return { ok: false, code: ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING };
  }
  const errors = [];
  if (proof.version !== 1) errors.push('VERSION_UNSUPPORTED');
  if (!proof.backupId || typeof proof.backupId !== 'string') errors.push('BACKUP_ID_REQUIRED');
  if (!proof.target || typeof proof.target !== 'string') errors.push('TARGET_REQUIRED');
  if (!proof.createdAt || !Number.isFinite(Date.parse(proof.createdAt))) errors.push('CREATED_AT_INVALID');
  if (!proof.artifactPath && !proof.snapshotId) errors.push('ARTIFACT_OR_SNAPSHOT_REQUIRED');
  if (!proof.restoreProcedureRef || typeof proof.restoreProcedureRef !== 'string') errors.push('RESTORE_PROCEDURE_REQUIRED');

  const descriptor = context.targetDescriptor || {};
  if (descriptor.target && proof.target !== descriptor.target) errors.push('TARGET_MISMATCH');
  if (descriptor.databaseName && proof.databaseName && proof.databaseName !== descriptor.databaseName) {
    errors.push('DATABASE_NAME_MISMATCH');
  }
  if (context.confirmTarget && proof.target !== context.confirmTarget) errors.push('CONFIRM_TARGET_MISMATCH');

  if (errors.length > 0) {
    return { ok: false, code: ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_MISSING, errors };
  }

  const maxAgeHours = Number.isFinite(context.maxBackupAgeHours) ? context.maxBackupAgeHours : DEFAULT_MAX_BACKUP_AGE_HOURS;
  const nowMs = context.now != null ? new Date(context.now).getTime() : Date.now();
  const ageMs = nowMs - Date.parse(proof.createdAt);
  if (ageMs > maxAgeHours * 60 * 60 * 1000) {
    return { ok: false, code: ENTRYPOINT_CODE.BLOCKED_BACKUP_PROOF_STALE, ageHours: Math.round(ageMs / 3600000) };
  }

  return {
    ok: true,
    code: 'BACKUP_PROOF_OK',
    backupIdHashPrefix: crypto.createHash('sha256').update(proof.backupId).digest('hex').slice(0, 12),
    artifactType: proof.artifactType || null,
    hasArtifactPath: Boolean(proof.artifactPath),
    hasSnapshotId: Boolean(proof.snapshotId),
  };
}

// Exact-key denylist so structural fields like hostClass/environmentClass are
// allowed while raw connection material (url/host/username/password/token) is not.
const FORBIDDEN_DESCRIPTOR_EXACT = new Set([
  'url', 'username', 'password', 'host', 'fullhost', 'token', 'secret',
  'connectionstring', 'connectionurl', 'databaseurl',
]);

function descriptorKeyIsForbidden(key) {
  const lowered = String(key).toLowerCase();
  if (FORBIDDEN_DESCRIPTOR_EXACT.has(lowered)) return true;
  return /(password|secret|token|connectionstring|databaseurl)/.test(lowered);
}

function validateTargetDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    return { ok: false, code: ENTRYPOINT_CODE.TARGET_DESCRIPTOR_INVALID, errors: ['NOT_OBJECT'] };
  }
  const errors = [];
  for (const key of Object.keys(descriptor)) {
    if (descriptorKeyIsForbidden(key)) errors.push(`FORBIDDEN_KEY:${key}`);
  }
  if (descriptor.version !== 1) errors.push('VERSION_UNSUPPORTED');
  if (!descriptor.target || typeof descriptor.target !== 'string') errors.push('TARGET_REQUIRED');
  if (!descriptor.environmentClass) errors.push('ENVIRONMENT_CLASS_REQUIRED');
  if (!descriptor.databaseName) errors.push('DATABASE_NAME_REQUIRED');
  if (errors.length > 0) {
    return { ok: false, code: ENTRYPOINT_CODE.TARGET_DESCRIPTOR_INVALID, errors };
  }
  return {
    ok: true,
    code: 'TARGET_DESCRIPTOR_OK',
    identity: {
      target: descriptor.target,
      environmentClass: descriptor.environmentClass,
      hostClass: descriptor.hostClass || null,
      databaseName: descriptor.databaseName,
      provider: descriptor.provider || null,
    },
  };
}

function planHasLiveTarget(plan) {
  // Defensive: a plan must never carry a default/fallback live Tenant target.
  const summary = plan && plan.summary;
  if (summary && typeof summary.liveTarget === 'string') return true;
  if (plan && typeof plan.liveTarget === 'string') return true;
  if (plan && typeof plan.fallbackTenantId === 'string') return true;
  return false;
}

function confirmAllTargets({ confirmTarget, approval, backupProof, descriptorIdentity }) {
  const targets = new Set();
  if (confirmTarget) targets.add(confirmTarget);
  if (approval && approval.target) targets.add(approval.target);
  if (backupProof && backupProof.target) targets.add(backupProof.target);
  if (descriptorIdentity && descriptorIdentity.target) targets.add(descriptorIdentity.target);
  return { ok: confirmTarget != null && targets.size === 1, targetCount: targets.size };
}

async function buildEntrypointContext(args, deps = {}) {
  const pathCheck = await validateEntrypointPaths(args, deps);
  const loaded = {};
  for (const type of ['plan', 'approval', 'backupProof', 'targetDescriptor']) {
    const entry = pathCheck.artifacts[type];
    if (entry && entry.ok && entry.resolved) {
      try {
        loaded[type] = await loadJsonArtifact(entry.resolved, deps);
      } catch (error) {
        loaded[type] = { parseError: error.code || ENTRYPOINT_CODE.ARTIFACT_PARSE_FAILED };
      }
    }
  }
  return { pathCheck, loaded, confirmTarget: args.confirmTarget || null };
}

function isForbidden(parsed) {
  return Boolean(parsed && parsed.forbiddenFlag);
}

async function runEntrypoint(argv = [], deps = {}) {
  const logger = deps.logger || null;
  const parsed = Array.isArray(argv) ? parseEntrypointArgs(argv) : argv;

  // Forbidden live flags are never silently ignored.
  if (isForbidden(parsed)) {
    safeLog(logger, 'warn', 'entrypoint_live_flag_blocked', { code: ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED });
    return result({ ok: false, code: ENTRYPOINT_CODE.LIVE_EXECUTION_NOT_ENABLED, exitCode: 3, requiresOperator: true });
  }
  if (parsed.unknownFlag) {
    return result({ ok: false, code: ENTRYPOINT_CODE.UNKNOWN_ARGUMENT, exitCode: 2, details: { flag: parsed.unknownFlag } });
  }
  if (parsed.help) {
    return result({ ok: true, code: ENTRYPOINT_CODE.USAGE, exitCode: 0 });
  }
  if (!parsed.mode) {
    // Default (no mode) never executes.
    return result({ ok: true, code: ENTRYPOINT_CODE.USAGE, exitCode: 0 });
  }
  if (!Object.values(MODE).includes(parsed.mode)) {
    return result({ ok: false, code: ENTRYPOINT_CODE.MODE_UNSUPPORTED, exitCode: 2 });
  }

  const now = deps.now != null ? deps.now : Date.now();
  const ledger = deps.ledger || createFileCompletionLedger({
    ledgerPath: parsed.ledgerPath || undefined,
    io: deps.ledgerIo,
    clock: () => now,
  });

  // inspect mode: readiness summary only. Creates no artifact.
  if (parsed.mode === MODE.INSPECT) {
    let ledgerSummary = null;
    try {
      ledgerSummary = await ledger.inspect();
    } catch (_) {
      ledgerSummary = { ok: false, code: ENTRYPOINT_CODE.LEDGER_UNAVAILABLE };
    }
    safeLog(logger, 'info', 'entrypoint_inspect', {
      mode: parsed.mode,
      code: ENTRYPOINT_CODE.INSPECT_OK,
      chainValid: ledgerSummary ? ledgerSummary.chainValid : false,
      count: ledgerSummary ? ledgerSummary.recordCount : 0,
    });
    return result({
      ok: true,
      code: ENTRYPOINT_CODE.INSPECT_OK,
      mode: parsed.mode,
      exitCode: 0,
      details: { ledger: ledgerSummary, liveEntrypointEnabled: LIVE_ENTRYPOINT_ENABLED, liveWriteEnabled: LIVE_WRITE_ENABLED },
    });
  }

  // ---- Gate chain (runs BEFORE any Safe Composition call) ----
  const context = await buildEntrypointContext(parsed, deps);

  // Path safety of the required plan artifact.
  const planPath = context.pathCheck.artifacts.plan;
  if (!planPath || !planPath.ok) {
    return result({ ok: false, code: planPath ? planPath.code : ENTRYPOINT_CODE.ARTIFACT_MISSING, mode: parsed.mode, phase: 'PATH', exitCode: 2 });
  }
  // Any non-plan artifact that was provided but failed path safety.
  for (const type of ['approval', 'backupProof', 'targetDescriptor']) {
    const entry = context.pathCheck.artifacts[type];
    if (entry && entry.provided && !entry.ok) {
      return result({ ok: false, code: entry.code, mode: parsed.mode, phase: 'PATH', exitCode: 2, details: { artifactType: type } });
    }
  }
  for (const type of ['journalDir', 'manifestDir', 'ledgerPath']) {
    const entry = context.pathCheck.dirs[type];
    if (entry && !entry.ok) {
      return result({ ok: false, code: entry.code, mode: parsed.mode, phase: 'PATH', exitCode: 2, details: { artifactType: type } });
    }
  }

  const planLoad = context.loaded.plan;
  if (!planLoad || planLoad.parseError) {
    return result({ ok: false, code: ENTRYPOINT_CODE.ARTIFACT_PARSE_FAILED, mode: parsed.mode, phase: 'PLAN', exitCode: 2 });
  }
  const plan = planLoad.parsedValue;
  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    return result({
      ok: false,
      code: ENTRYPOINT_CODE.PLAN_INVALID,
      mode: parsed.mode,
      phase: 'PLAN',
      exitCode: 2,
      safeErrorCode: planValidation.errors[0] ? planValidation.errors[0].code : ENTRYPOINT_CODE.PLAN_INVALID,
    });
  }
  if (planHasLiveTarget(plan)) {
    return result({ ok: false, code: ENTRYPOINT_CODE.PLAN_LIVE_TARGET_FORBIDDEN, mode: parsed.mode, phase: 'PLAN', exitCode: 2, requiresOperator: true });
  }

  const execHash = computePlanExecHash(plan);
  const readyCount = planValidation.readyActions.length;

  // ---- No-action policy: never claims approval, never touches storage ----
  if (readyCount === 0) {
    safeLog(logger, 'info', 'entrypoint_no_action', { mode: parsed.mode, code: ENTRYPOINT_CODE.NO_ACTION_REQUIRED, readyCount: 0 });
    return result({ ok: true, code: ENTRYPOINT_CODE.NO_ACTION_REQUIRED, mode: parsed.mode, phase: 'PLAN', exitCode: 0, readyCount: 0 });
  }

  // ---- Backup proof gate (required whenever future mutation is possible) ----
  const targetDescriptorLoad = context.loaded.targetDescriptor;
  let descriptorIdentity = null;
  if (targetDescriptorLoad && targetDescriptorLoad.parsedValue) {
    const descriptorCheck = validateTargetDescriptor(targetDescriptorLoad.parsedValue);
    if (!descriptorCheck.ok) {
      return result({ ok: false, code: ENTRYPOINT_CODE.TARGET_DESCRIPTOR_INVALID, mode: parsed.mode, phase: 'TARGET', exitCode: 2, details: { errors: descriptorCheck.errors } });
    }
    descriptorIdentity = descriptorCheck.identity;
  }

  const backupLoad = context.loaded.backupProof;
  const backupCheck = validateBackupProof(backupLoad ? backupLoad.parsedValue : null, {
    targetDescriptor: descriptorIdentity || {},
    confirmTarget: parsed.confirmTarget,
    maxBackupAgeHours: parsed.maxBackupAgeHours,
    now,
  });
  if (!backupCheck.ok) {
    return result({ ok: false, code: backupCheck.code, mode: parsed.mode, phase: 'BACKUP', exitCode: 2, requiresOperator: true });
  }

  // ---- Approval gate ----
  const approvalLoad = context.loaded.approval;
  if (!approvalLoad || !approvalLoad.parsedValue) {
    return result({ ok: false, code: ENTRYPOINT_CODE.BLOCKED_APPROVAL_MISSING, mode: parsed.mode, phase: 'AUTHORITY', exitCode: 2, requiresOperator: true, readyCount });
  }
  const approval = approvalLoad.parsedValue;

  const targetConfirm = confirmAllTargets({
    confirmTarget: parsed.confirmTarget,
    approval,
    backupProof: backupLoad ? backupLoad.parsedValue : null,
    descriptorIdentity,
  });
  if (!targetConfirm.ok) {
    return result({ ok: false, code: ENTRYPOINT_CODE.TARGET_CONFIRMATION_FAILED, mode: parsed.mode, phase: 'TARGET', exitCode: 2, requiresOperator: true });
  }

  const authority = validateOperationAuthority({
    approval,
    planHash: plan.planHash,
    execHash,
    confirmTarget: parsed.confirmTarget,
    targetIdentity: descriptorIdentity || {},
    readyActions: planValidation.readyActions,
    now: new Date(now).toISOString(),
  });
  if (!authority.ok) {
    const code = authority.code === 'TARGET_CONFIRMATION_FAILED'
      ? ENTRYPOINT_CODE.TARGET_CONFIRMATION_FAILED
      : ENTRYPOINT_CODE.APPROVAL_REJECTED;
    return result({ ok: false, code, mode: parsed.mode, phase: 'AUTHORITY', exitCode: 2, requiresOperator: true, safeErrorCode: authority.code });
  }

  // ---- Ledger reuse / claim gates ----
  let alreadyCompleted = false;
  try {
    alreadyCompleted = await ledger.hasApproval(approval.approvalId);
  } catch (_) {
    return result({ ok: false, code: ENTRYPOINT_CODE.LEDGER_UNAVAILABLE, mode: parsed.mode, phase: 'LEDGER', exitCode: 2, requiresOperator: true });
  }
  if (alreadyCompleted) {
    return result({ ok: false, code: ENTRYPOINT_CODE.APPROVAL_ALREADY_COMPLETED, mode: parsed.mode, phase: 'LEDGER', exitCode: 2, requiresOperator: true });
  }

  // ---- Journal / manifest collision inspection ----
  const collision = await inspectCollisions(parsed, deps);
  if (collision) {
    return result({ ok: false, code: collision.code, mode: parsed.mode, phase: 'RECOVERY', exitCode: 2, requiresOperator: true });
  }

  // validate mode stops here: authority proven, nothing mutated, no claim taken.
  if (parsed.mode === MODE.VALIDATE) {
    safeLog(logger, 'info', 'entrypoint_validate', { mode: parsed.mode, code: ENTRYPOINT_CODE.VALIDATION_OK, readyCount });
    return result({ ok: true, code: ENTRYPOINT_CODE.VALIDATION_OK, mode: parsed.mode, phase: 'AUTHORITY', exitCode: 0, readyCount });
  }

  // ---- dry-run mode: Safe Composition with MOCK repository only ----
  return runDryRun({ parsed, plan, planValidation, approval, execHash, descriptorIdentity, now, deps, ledger, logger, readyCount });
}

async function inspectCollisions(parsed, deps) {
  const fsProbe = deps.fsProbe || {};
  const access = fsProbe.access || ((p) => fsp.access(p, fs.constants.F_OK));
  // A caller may point at an existing journal/manifest file to prove collision
  // detection. Directory targets are validated but not enumerated here.
  for (const [dir, code] of [[parsed.journalDir, ENTRYPOINT_CODE.JOURNAL_COLLISION], [parsed.manifestDir, ENTRYPOINT_CODE.MANIFEST_COLLISION]]) {
    if (!dir) continue;
    try {
      const stat = await (fsProbe.lstat || ((p) => fsp.lstat(p)))(dir);
      if (stat.isFile && stat.isFile()) {
        return { code };
      }
    } catch (_) {
      // absent is fine
    }
  }
  if (deps.collision === 'journal') return { code: ENTRYPOINT_CODE.JOURNAL_COLLISION };
  if (deps.collision === 'manifest') return { code: ENTRYPOINT_CODE.MANIFEST_COLLISION };
  return null;
}

async function runDryRun({ parsed, plan, planValidation, approval, execHash, descriptorIdentity, now, deps, ledger, logger, readyCount }) {
  // Dry-run may ONLY use a mock/null repository, a temporary operation
  // directory, and never a live repository or DB connection.
  const baseDir = deps.dryRunBaseDir || await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-dryrun-'));
  const ownsBaseDir = !deps.dryRunBaseDir;
  const repository = deps.mockRepository || createMockRepository({
    tenants: planValidation.readyActions.map((a) => a.newTenantId).filter(Boolean),
  });

  // Design-phase claim lifecycle: claim -> dry-run -> release. No completion
  // mutation is recorded. An existing claim blocks the dry-run.
  const dryRunOperationId = `dryrun_${execHash.slice(0, 24)}`;
  const claim = await ledger.claimApproval(approval.approvalId, dryRunOperationId, { target: parsed.confirmTarget });
  if (!claim.ok) {
    if (ownsBaseDir) {
      try { await fsp.rm(baseDir, { recursive: true, force: true }); } catch (_) {}
    }
    return result({
      ok: false,
      code: ENTRYPOINT_CODE.APPROVAL_ALREADY_CLAIMED,
      mode: parsed.mode,
      phase: 'LEDGER',
      exitCode: 2,
      requiresOperator: true,
      safeErrorCode: claim.code,
    });
  }

  // Ephemeral in-memory ledger for the dry-run so no completion persists to
  // the real ledger path.
  const dryRunLedger = {
    async hasApproval() { return false; },
    async recordCompletion() { return { ok: true }; },
  };

  try {
    const composition = await composeTenantBackfillApply({
      plan,
      expectedExecHash: execHash,
      approval,
      target: parsed.confirmTarget,
      confirmTarget: parsed.confirmTarget,
      targetIdentity: descriptorIdentity || {},
      baseDir,
      repository,
      completedOperationsLedger: dryRunLedger,
      clock: () => new Date(now).toISOString(),
      logger: deps.compositionLogger || null,
    });
    safeLog(logger, 'info', 'entrypoint_dry_run', {
      mode: parsed.mode,
      code: ENTRYPOINT_CODE.DRY_RUN_OK,
      readyCount,
      operationId: composition.operationId || null,
      ok: composition.ok,
    });
    return result({
      ok: composition.ok,
      code: composition.ok ? ENTRYPOINT_CODE.DRY_RUN_OK : composition.code,
      mode: parsed.mode,
      phase: composition.phase || 'ADAPTER',
      exitCode: composition.ok ? 0 : 2,
      readyCount,
      requiresOperator: composition.requiresOperator,
      recoverable: composition.recoverable,
      details: { compositionCode: composition.code, operationId: composition.operationId || null },
    });
  } finally {
    // Release the claim: design phase performs no durable completion.
    try { await ledger.releaseClaim(approval.approvalId, dryRunOperationId); } catch (_) {}
    if (ownsBaseDir) {
      try { await fsp.rm(baseDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const logger = {
    info: (label, meta) => console.log(`tenant-backfill-live-entrypoint: ${label} ${JSON.stringify(meta)}`),
    warn: (label, meta) => console.warn(`tenant-backfill-live-entrypoint: ${label} ${JSON.stringify(meta)}`),
  };
  const outcome = await runEntrypoint(argv, { logger });
  console.log(`tenant-backfill-live-entrypoint: ${outcome.code} (mode=${outcome.mode || 'none'}, exitCode=${outcome.exitCode})`);
  process.exitCode = outcome.exitCode;
  return outcome;
}

if (require.main === module) {
  main().catch((error) => {
    // Never print a raw error object; emit a stable code only.
    const code = error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'ENTRYPOINT_FATAL';
    console.error(`tenant-backfill-live-entrypoint: ${code}`);
    process.exit(1);
  });
}

module.exports = {
  LIVE_ENTRYPOINT_ENABLED,
  LIVE_WRITE_ENABLED,
  MODE,
  ENTRYPOINT_CODE,
  FORBIDDEN_LIVE_FLAGS,
  parseEntrypointArgs,
  loadJsonArtifact,
  validateArtifactPath,
  validateEntrypointPaths,
  validateBackupProof,
  validateTargetDescriptor,
  buildEntrypointContext,
  runEntrypoint,
  main,
};
