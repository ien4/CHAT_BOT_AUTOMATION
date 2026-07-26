'use strict';

const LOCAL_OWNERSHIP_STATE = Object.freeze({
  REQUESTED: 'REQUESTED',
  OWNERSHIP_ACTIVE: 'OWNERSHIP_ACTIVE',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
});

const PROVIDER_EXECUTION_STATE = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  CLAIMED: 'CLAIMED',
  SUCCEEDED: 'SUCCEEDED',
  RETRYABLE_FAILED: 'RETRYABLE_FAILED',
  CONFIGURATION_BLOCKED: 'CONFIGURATION_BLOCKED',
  MAPPING_BLOCKED: 'MAPPING_BLOCKED',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
});

const RESERVE_RESULT = Object.freeze({
  RESERVED_NEW: 'RESERVED_NEW',
  EXISTING_REQUEST: 'EXISTING_REQUEST',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  ACTIVE_OWNERSHIP_CONFLICT: 'ACTIVE_OWNERSHIP_CONFLICT',
});

const CLAIM_RESULT = Object.freeze({
  CLAIM_WON: 'CLAIM_WON',
  CLAIM_LOST: 'CLAIM_LOST',
  NOT_CLAIMABLE: 'NOT_CLAIMABLE',
  NOT_FOUND: 'NOT_FOUND',
});

const UPDATE_RESULT = Object.freeze({
  UPDATED: 'UPDATED',
  NOT_UPDATED: 'NOT_UPDATED',
  NOT_FOUND: 'NOT_FOUND',
});

const RELEASE_RESULT = Object.freeze({
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
  NOT_RELEASED: 'NOT_RELEASED',
  NOT_FOUND: 'NOT_FOUND',
});

const MAX_REF_CHARS = 256;
const MAX_CODE_CHARS = 96;
const SAFE_CODE_RE = /^[A-Z0-9][A-Z0-9_:-]{0,95}$/;

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function requiredString(value, code, maxChars) {
  if (typeof value !== 'string') fail(code);
  const out = value.trim();
  if (!out || out.length > maxChars) fail(code);
  return out;
}

function optionalString(value, code, maxChars) {
  if (value === null || value === undefined) return null;
  return requiredString(value, code, maxChars);
}

function safeCode(value, code) {
  const out = requiredString(value, code, MAX_CODE_CHARS);
  if (!SAFE_CODE_RE.test(out)) fail(code);
  return out;
}

function nowFrom(clock) {
  if (clock && typeof clock.now === 'function') return clock.now();
  if (typeof clock === 'function') return clock();
  return new Date();
}

function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'P2002' || (typeof err.message === 'string' && /unique constraint/i.test(err.message)));
}

function uniqueTargetContains(err, candidates) {
  const meta = err && err.meta;
  const raw = meta && (meta.target || meta.constraint || meta.field_name);
  const values = Array.isArray(raw) ? raw : [raw];
  const text = values.filter(Boolean).join(' ').toLowerCase();
  return candidates.some((candidate) => text.includes(candidate.toLowerCase()));
}

function selectorFrom(input) {
  const i = input || {};
  const tenantIntegrationId = requiredString(i.tenantIntegrationId, 'HANDOFF_TENANT_INTEGRATION_REQUIRED', MAX_REF_CHARS);
  const where = { tenantIntegrationId };
  if (i.id !== undefined && i.id !== null) {
    where.id = requiredString(i.id, 'HANDOFF_EXECUTION_ID_REQUIRED', MAX_REF_CHARS);
    return where;
  }
  where.handoffRequestKey = requiredString(i.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS);
  return where;
}

function matchesStoredContract(row, data) {
  if (!row) return false;
  return row.tenantIntegrationId === data.tenantIntegrationId
    && row.businessIdempotencyKey === data.businessIdempotencyKey
    && row.externalConversationRef === data.externalConversationRef
    && row.assignmentTargetKind === data.assignmentTargetKind
    && row.assignmentTargetRef === data.assignmentTargetRef
    && row.activeOwnershipKey === data.activeOwnershipKey;
}

function normalizeReserveInput(input) {
  const i = input || {};
  return {
    tenantIntegrationId: requiredString(i.tenantIntegrationId, 'HANDOFF_TENANT_INTEGRATION_REQUIRED', MAX_REF_CHARS),
    handoffRequestKey: requiredString(i.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS),
    activeOwnershipKey: requiredString(i.activeOwnershipKey, 'HANDOFF_ACTIVE_OWNERSHIP_KEY_REQUIRED', MAX_REF_CHARS),
    businessIdempotencyKey: requiredString(i.businessIdempotencyKey, 'HANDOFF_BUSINESS_IDEMPOTENCY_REQUIRED', MAX_REF_CHARS),
    externalConversationRef: requiredString(i.externalConversationRef, 'HANDOFF_CONVERSATION_REF_REQUIRED', MAX_REF_CHARS),
    localOwnershipState: LOCAL_OWNERSHIP_STATE.REQUESTED,
    providerExecutionState: PROVIDER_EXECUTION_STATE.NOT_STARTED,
    assignmentTargetKind: optionalString(i.assignmentTargetKind, 'HANDOFF_TARGET_KIND_INVALID', MAX_CODE_CHARS),
    assignmentTargetRef: optionalString(i.assignmentTargetRef, 'HANDOFF_TARGET_REF_INVALID', MAX_REF_CHARS),
    safeReasonCode: optionalString(i.safeReasonCode, 'HANDOFF_REASON_CODE_INVALID', MAX_CODE_CHARS),
    attemptCount: 0,
    remoteEvidenceRef: null,
    safeErrorCode: null,
    completedAt: null,
    reconciliationRequiredAt: null,
  };
}

function createChatwootHandoffExecutionRepository(deps) {
  const d = deps || {};
  const client = d.client;
  if (!client || !client.chatwootHandoffExecution) fail('HANDOFF_EXECUTION_CLIENT_REQUIRED');
  const table = client.chatwootHandoffExecution;
  const clock = d.clock;

  async function inspectByRequestKey(input) {
    const i = input || {};
    const tenantIntegrationId = requiredString(i.tenantIntegrationId, 'HANDOFF_TENANT_INTEGRATION_REQUIRED', MAX_REF_CHARS);
    const handoffRequestKey = requiredString(i.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS);
    return table.findFirst({ where: { tenantIntegrationId, handoffRequestKey } });
  }

  async function inspectBySelector(input) {
    return table.findFirst({ where: selectorFrom(input) });
  }

  function updateSelector(input) {
    return selectorFrom(input);
  }

  async function updateClaimed(input, data) {
    const where = Object.assign(updateSelector(input), {
      providerExecutionState: PROVIDER_EXECUTION_STATE.CLAIMED,
    });
    const result = await table.updateMany({ where, data });
    const execution = await inspectBySelector(input);
    if (!execution) return { result: UPDATE_RESULT.NOT_FOUND, execution: null };
    return { result: result && result.count === 1 ? UPDATE_RESULT.UPDATED : UPDATE_RESULT.NOT_UPDATED, execution };
  }

  return {
    LOCAL_OWNERSHIP_STATE,
    PROVIDER_EXECUTION_STATE,
    RESERVE_RESULT,
    CLAIM_RESULT,
    UPDATE_RESULT,
    RELEASE_RESULT,

    async reserve(input) {
      const data = normalizeReserveInput(input);
      try {
        const execution = await table.create({ data });
        return { result: RESERVE_RESULT.RESERVED_NEW, execution };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const existing = await table.findUnique({ where: { handoffRequestKey: data.handoffRequestKey } });
        if (existing) {
          return {
            result: matchesStoredContract(existing, data)
              ? RESERVE_RESULT.EXISTING_REQUEST
              : RESERVE_RESULT.IDEMPOTENCY_CONFLICT,
            execution: existing,
          };
        }
        if (uniqueTargetContains(err, ['activeOwnershipKey', 'active_ownership_key'])) {
          return { result: RESERVE_RESULT.ACTIVE_OWNERSHIP_CONFLICT, execution: null };
        }
        if (uniqueTargetContains(err, ['handoffRequestKey', 'handoff_request_key'])) {
          return { result: RESERVE_RESULT.IDEMPOTENCY_CONFLICT, execution: null };
        }
        return { result: RESERVE_RESULT.ACTIVE_OWNERSHIP_CONFLICT, execution: null };
      }
    },

    inspectByRequestKey,

    async inspectOwnership(input) {
      const i = input || {};
      const tenantIntegrationId = requiredString(i.tenantIntegrationId, 'HANDOFF_TENANT_INTEGRATION_REQUIRED', MAX_REF_CHARS);
      const activeOwnershipKey = requiredString(i.activeOwnershipKey, 'HANDOFF_ACTIVE_OWNERSHIP_KEY_REQUIRED', MAX_REF_CHARS);
      return table.findFirst({ where: { tenantIntegrationId, activeOwnershipKey } });
    },

    async claimExecution(input) {
      const where = Object.assign(updateSelector(input), {
        localOwnershipState: LOCAL_OWNERSHIP_STATE.REQUESTED,
        providerExecutionState: { in: [PROVIDER_EXECUTION_STATE.NOT_STARTED, PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED] },
      });
      const result = await table.updateMany({
        where,
        data: {
          providerExecutionState: PROVIDER_EXECUTION_STATE.CLAIMED,
          safeErrorCode: null,
          attemptCount: { increment: 1 },
        },
      });
      const execution = await inspectBySelector(input);
      if (!execution) return { result: CLAIM_RESULT.NOT_FOUND, execution: null };
      if (result && result.count === 1) return { result: CLAIM_RESULT.CLAIM_WON, execution };
      if (execution.localOwnershipState === LOCAL_OWNERSHIP_STATE.REQUESTED
        && execution.providerExecutionState === PROVIDER_EXECUTION_STATE.CLAIMED) {
        return { result: CLAIM_RESULT.CLAIM_LOST, execution };
      }
      return { result: CLAIM_RESULT.NOT_CLAIMABLE, execution };
    },

    async markSucceeded(input) {
      const i = input || {};
      return updateClaimed(input, {
        providerExecutionState: PROVIDER_EXECUTION_STATE.SUCCEEDED,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.OWNERSHIP_ACTIVE,
        remoteEvidenceRef: optionalString(i.remoteEvidenceRef, 'HANDOFF_REMOTE_EVIDENCE_INVALID', MAX_REF_CHARS),
        safeErrorCode: null,
        completedAt: nowFrom(clock),
      });
    },

    async markRetryableFailed(input) {
      const i = input || {};
      if (i.writeBoundary !== 'BEFORE_WRITE') fail('HANDOFF_RETRYABLE_WRITE_BOUNDARY_REQUIRED');
      return updateClaimed(input, {
        providerExecutionState: PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.REQUESTED,
        safeErrorCode: safeCode(i.safeErrorCode, 'HANDOFF_SAFE_ERROR_CODE_REQUIRED'),
        completedAt: null,
      });
    },

    async markBlocked(input) {
      const i = input || {};
      const state = safeCode(i.providerExecutionState, 'HANDOFF_BLOCKED_STATE_REQUIRED');
      if (![PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED, PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED].includes(state)) {
        fail('HANDOFF_BLOCKED_STATE_INVALID');
      }
      return updateClaimed(input, {
        providerExecutionState: state,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.RECONCILIATION_REQUIRED,
        safeErrorCode: safeCode(i.safeErrorCode, 'HANDOFF_SAFE_ERROR_CODE_REQUIRED'),
        reconciliationRequiredAt: nowFrom(clock),
      });
    },

    async markProviderRejected(input) {
      const i = input || {};
      return updateClaimed(input, {
        providerExecutionState: PROVIDER_EXECUTION_STATE.PROVIDER_REJECTED,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.RECONCILIATION_REQUIRED,
        safeErrorCode: safeCode(i.safeErrorCode, 'HANDOFF_SAFE_ERROR_CODE_REQUIRED'),
        reconciliationRequiredAt: nowFrom(clock),
      });
    },

    async markUnknownOutcome(input) {
      const i = input || {};
      return updateClaimed(input, {
        providerExecutionState: PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.RECONCILIATION_REQUIRED,
        safeErrorCode: safeCode(i.safeErrorCode, 'HANDOFF_SAFE_ERROR_CODE_REQUIRED'),
        reconciliationRequiredAt: nowFrom(clock),
      });
    },

    async markReconciliationRequired(input) {
      const i = input || {};
      return updateClaimed(input, {
        providerExecutionState: PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED,
        localOwnershipState: LOCAL_OWNERSHIP_STATE.RECONCILIATION_REQUIRED,
        safeErrorCode: safeCode(i.safeErrorCode, 'HANDOFF_SAFE_ERROR_CODE_REQUIRED'),
        reconciliationRequiredAt: nowFrom(clock),
      });
    },

    async releaseOwnership(input) {
      const i = input || {};
      const finalState = safeCode(i.finalLocalOwnershipState, 'HANDOFF_RELEASE_STATE_REQUIRED');
      if (![LOCAL_OWNERSHIP_STATE.RELEASED, LOCAL_OWNERSHIP_STATE.CANCELLED].includes(finalState)) fail('HANDOFF_RELEASE_STATE_INVALID');
      const expectedActiveOwnershipKey = requiredString(i.expectedActiveOwnershipKey, 'HANDOFF_EXPECTED_OWNERSHIP_KEY_REQUIRED', MAX_REF_CHARS);
      const where = Object.assign(updateSelector(input), {
        activeOwnershipKey: expectedActiveOwnershipKey,
      });
      const result = await table.updateMany({
        where,
        data: {
          activeOwnershipKey: null,
          localOwnershipState: finalState,
          completedAt: nowFrom(clock),
        },
      });
      const execution = await inspectBySelector(input);
      if (!execution) return { result: RELEASE_RESULT.NOT_FOUND, execution: null };
      if (!(result && result.count === 1)) return { result: RELEASE_RESULT.NOT_RELEASED, execution };
      return {
        result: finalState === LOCAL_OWNERSHIP_STATE.RELEASED ? RELEASE_RESULT.RELEASED : RELEASE_RESULT.CANCELLED,
        execution,
      };
    },
  };
}

module.exports = {
  createChatwootHandoffExecutionRepository,
  LOCAL_OWNERSHIP_STATE,
  PROVIDER_EXECUTION_STATE,
  RESERVE_RESULT,
  CLAIM_RESULT,
  UPDATE_RESULT,
  RELEASE_RESULT,
  isUniqueViolation,
};
