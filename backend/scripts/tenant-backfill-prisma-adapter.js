'use strict';

// Locked Prisma storage adapter for a future live phase.
// Importing this module does not instantiate PrismaClient and does not connect.

const MODEL_DELEGATES = Object.freeze({
  FacebookPage: 'facebookPage',
  Conversation: 'conversation',
  Appointment: 'appointment',
});

const ADAPTER_CODE = Object.freeze({
  UNSUPPORTED_MODEL: 'UNSUPPORTED_MODEL',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  INVALID_TARGET_TENANT: 'INVALID_TARGET_TENANT',
  FAILED_TARGET_TENANT_MISSING: 'FAILED_TARGET_TENANT_MISSING',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  INVARIANT_BROKEN: 'INVARIANT_BROKEN',
  ADAPTER_ERROR: 'ADAPTER_ERROR',
  APPROVAL_INVALID: 'APPROVAL_INVALID',
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED',
  TARGET_CONFIRMATION_FAILED: 'TARGET_CONFIRMATION_FAILED',
  NO_ACTION_REQUIRED: 'NO_ACTION_REQUIRED',
});

const HASH_RE = /^[0-9a-f]{64}$/;

class BackfillAdapterError extends Error {
  constructor(code, safeMessage, details = {}) {
    super(safeMessage || code);
    this.name = 'BackfillAdapterError';
    this.code = code;
    this.safeMessage = safeMessage || code;
    this.details = details;
  }
}

function normalizeTenant(value) {
  return value === undefined ? null : value;
}

function resolveDelegateName(model) {
  const delegateName = MODEL_DELEGATES[model];
  if (!delegateName) {
    throw new BackfillAdapterError(ADAPTER_CODE.UNSUPPORTED_MODEL, 'Unsupported backfill model', { model: String(model || '') });
  }
  return delegateName;
}

function safeError(error, fallback = ADAPTER_CODE.ADAPTER_ERROR) {
  if (error instanceof BackfillAdapterError) return error;
  const code = mapPrismaError(error, fallback);
  return new BackfillAdapterError(code, code, { prismaCode: error && error.code ? String(error.code) : null });
}

function mapPrismaError(error, fallback = ADAPTER_CODE.ADAPTER_ERROR) {
  const code = error && error.code ? String(error.code) : '';
  if (code === 'P2003') return ADAPTER_CODE.FAILED_TARGET_TENANT_MISSING;
  if (code === 'P2025') return ADAPTER_CODE.RECORD_NOT_FOUND;
  if (code === 'P2028') return ADAPTER_CODE.TRANSACTION_FAILED;
  if (/^P10\d\d$/.test(code)) return ADAPTER_CODE.DATABASE_UNAVAILABLE;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return ADAPTER_CODE.DATABASE_UNAVAILABLE;
  const message = String(error && error.message ? error.message : '');
  if (/transaction/i.test(message)) return ADAPTER_CODE.TRANSACTION_FAILED;
  if (/connect|connection|database unavailable/i.test(message)) return ADAPTER_CODE.DATABASE_UNAVAILABLE;
  return fallback;
}

function createDefaultClient(clientOptions = {}) {
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient(clientOptions);
}

function createPrismaBackfillRepository(options = {}) {
  const injectedPrisma = options.prisma || null;
  const clientFactory = options.clientFactory || (() => createDefaultClient(options.clientOptions || { log: ['error'] }));
  const disconnectAfterOperation = options.disconnectAfterOperation !== undefined
    ? Boolean(options.disconnectAfterOperation)
    : !injectedPrisma;

  let prisma = injectedPrisma;
  let ownsClient = !injectedPrisma;
  let initialized = Boolean(injectedPrisma);

  function getClient() {
    if (!prisma) {
      prisma = clientFactory();
      ownsClient = true;
      initialized = true;
    }
    return prisma;
  }

  async function disconnect() {
    if (ownsClient && prisma && typeof prisma.$disconnect === 'function') {
      await prisma.$disconnect();
    }
    if (ownsClient) prisma = null;
  }

  async function withClient(operation) {
    const client = getClient();
    try {
      return await operation(client);
    } catch (error) {
      throw safeError(error);
    } finally {
      if (disconnectAfterOperation) await disconnect();
    }
  }

  function getDelegate(client, model) {
    const delegateName = resolveDelegateName(model);
    const delegate = client[delegateName];
    if (!delegate) {
      throw new BackfillAdapterError(ADAPTER_CODE.UNSUPPORTED_MODEL, 'Prisma delegate missing', { model });
    }
    return delegate;
  }

  async function getCurrentOwner(model, recordId) {
    return withClient(async (client) => {
      const delegate = getDelegate(client, model);
      const row = await delegate.findUnique({
        where: { id: recordId },
        select: { id: true, tenantId: true },
      });
      if (!row) {
        throw new BackfillAdapterError(ADAPTER_CODE.RECORD_NOT_FOUND, 'Backfill record not found', { model });
      }
      return normalizeTenant(row.tenantId);
    });
  }

  async function targetTenantExists(tenantId) {
    if (!tenantId) return false;
    return withClient(async (client) => {
      const row = await client.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      return Boolean(row && row.id);
    });
  }

  async function runScopedOwnerTransition({ action, whereTenantId, dataTenantId }) {
    return withClient(async (client) => {
      const delegateName = resolveDelegateName(action.model);
      const result = await client.$transaction(async (tx) => {
        const delegate = tx[delegateName];
        if (!delegate) {
          throw new BackfillAdapterError(ADAPTER_CODE.UNSUPPORTED_MODEL, 'Prisma delegate missing in transaction', { model: action.model });
        }
        return delegate.updateMany({
          where: {
            id: action.recordId,
            tenantId: normalizeTenant(whereTenantId),
          },
          data: {
            tenantId: normalizeTenant(dataTenantId),
          },
        });
      });

      const count = Number(result && result.count);
      if (count === 1) return true;
      if (count === 0) return false;
      throw new BackfillAdapterError(ADAPTER_CODE.INVARIANT_BROKEN, 'Scoped owner transition affected multiple records', {
        model: action.model,
      });
    });
  }

  async function applyOwnerTransition(action) {
    try {
      return await runScopedOwnerTransition({
        action,
        whereTenantId: action.oldTenantId,
        dataTenantId: action.newTenantId,
      });
    } catch (error) {
      throw safeError(error);
    }
  }

  async function rollbackOwnerTransition(action) {
    try {
      return await runScopedOwnerTransition({
        action,
        whereTenantId: action.newTenantId,
        dataTenantId: action.oldTenantId,
      });
    } catch (error) {
      throw safeError(error);
    }
  }

  async function preflight() {
    return withClient(async (client) => {
      for (const delegateName of Object.values(MODEL_DELEGATES)) {
        if (!client[delegateName]) {
          throw new BackfillAdapterError(ADAPTER_CODE.UNSUPPORTED_MODEL, 'Prisma delegate missing', { delegateName });
        }
      }
      if (!client.tenant) {
        throw new BackfillAdapterError(ADAPTER_CODE.UNSUPPORTED_MODEL, 'Tenant delegate missing');
      }
      return { ok: true, modelDelegates: { ...MODEL_DELEGATES } };
    });
  }

  return {
    getCurrentOwner,
    targetTenantExists,
    applyOwnerTransition,
    rollbackOwnerTransition,
    disconnect,
    preflight,
    _isInitialized() {
      return initialized;
    },
  };
}

function evaluateNoActionPolicy(plan) {
  const actions = Array.isArray(plan && plan.actions) ? plan.actions : [];
  const readyCount = actions.filter((action) => action && action.status === 'READY').length;
  if (readyCount === 0) {
    return {
      ok: true,
      code: ADAPTER_CODE.NO_ACTION_REQUIRED,
      readyCount,
      shouldWrite: false,
      shouldCreateRollbackManifest: false,
    };
  }
  return {
    ok: true,
    code: 'ACTION_REQUIRED',
    readyCount,
    shouldWrite: true,
    shouldCreateRollbackManifest: true,
  };
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function validateApproval(approval, context = {}) {
  const errors = [];
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    return { ok: false, code: ADAPTER_CODE.APPROVAL_INVALID, errors: ['APPROVAL_NOT_OBJECT'] };
  }
  if (approval.version !== 1) errors.push('VERSION_UNSUPPORTED');
  if (!approval.target || typeof approval.target !== 'string') errors.push('TARGET_REQUIRED');
  if (!HASH_RE.test(String(approval.planHash || ''))) errors.push('PLAN_HASH_INVALID');
  if (!HASH_RE.test(String(approval.execHash || ''))) errors.push('EXEC_HASH_INVALID');
  if (!approval.approvedBy || typeof approval.approvedBy !== 'string') errors.push('APPROVER_REQUIRED');
  if (!isIsoDate(approval.approvedAt)) errors.push('APPROVED_AT_INVALID');
  if (!isIsoDate(approval.expiresAt)) errors.push('EXPIRES_AT_INVALID');
  if (!Array.isArray(approval.allowedModels)) errors.push('ALLOWED_MODELS_REQUIRED');
  if (!Number.isInteger(approval.maxActions) || approval.maxActions < 0) errors.push('MAX_ACTIONS_INVALID');
  if (typeof approval.allowClassB !== 'boolean') errors.push('ALLOW_CLASS_B_REQUIRED');

  const now = context.now ? new Date(context.now).getTime() : Date.now();
  const expiresAt = Date.parse(approval.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= now) errors.push(ADAPTER_CODE.APPROVAL_EXPIRED);
  if (context.target && approval.target !== context.target) errors.push('TARGET_MISMATCH');
  if (context.planHash && approval.planHash !== context.planHash) errors.push('PLAN_HASH_MISMATCH');
  if (context.execHash && approval.execHash !== context.execHash) errors.push('EXEC_HASH_MISMATCH');
  if (context.readyCount != null && approval.maxActions < context.readyCount) errors.push('MAX_ACTIONS_EXCEEDED');
  if (Array.isArray(context.requiredModels)) {
    const allowed = new Set(approval.allowedModels || []);
    for (const model of context.requiredModels) {
      if (!allowed.has(model)) errors.push('MODEL_NOT_APPROVED');
    }
  }

  if (errors.includes(ADAPTER_CODE.APPROVAL_EXPIRED)) {
    return { ok: false, code: ADAPTER_CODE.APPROVAL_EXPIRED, errors };
  }
  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? 'APPROVAL_OK' : ADAPTER_CODE.APPROVAL_INVALID,
    errors,
  };
}

function assertTargetConfirmation({ confirmTarget, approval, dbIdentity = {}, expectedDatabaseName = null, expectedEnvironmentClass = null } = {}) {
  const errors = [];
  const approvalTarget = approval && approval.target;
  if (!confirmTarget || typeof confirmTarget !== 'string') errors.push('CONFIRM_TARGET_REQUIRED');
  if (!approvalTarget || approvalTarget !== confirmTarget) errors.push('APPROVAL_TARGET_MISMATCH');
  if (dbIdentity.target && dbIdentity.target !== confirmTarget) errors.push('DB_TARGET_MISMATCH');
  if (expectedDatabaseName && dbIdentity.databaseName !== expectedDatabaseName) errors.push('DATABASE_NAME_MISMATCH');
  if (expectedEnvironmentClass && dbIdentity.environmentClass !== expectedEnvironmentClass) errors.push('ENVIRONMENT_CLASS_MISMATCH');
  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? 'TARGET_CONFIRMED' : ADAPTER_CODE.TARGET_CONFIRMATION_FAILED,
    errors,
    maskedDbIdentity: {
      target: dbIdentity.target || null,
      databaseName: dbIdentity.databaseName || null,
      environmentClass: dbIdentity.environmentClass || null,
      hostClass: dbIdentity.hostClass || null,
    },
  };
}

module.exports = {
  MODEL_DELEGATES,
  ADAPTER_CODE,
  BackfillAdapterError,
  createPrismaBackfillRepository,
  resolveDelegateName,
  mapPrismaError,
  evaluateNoActionPolicy,
  validateApproval,
  assertTargetConfirmation,
};
