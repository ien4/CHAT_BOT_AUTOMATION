'use strict';

const crypto = require('node:crypto');
const {
  LOCAL_OWNERSHIP_STATE,
  PROVIDER_EXECUTION_STATE,
  RESERVE_RESULT,
  CLAIM_RESULT,
} = require('./chatwootHandoffExecutionRepository');

const TARGET_KIND = Object.freeze({
  TEAM_EXPLICIT: 'TEAM_EXPLICIT',
  AGENT_EXPLICIT: 'AGENT_EXPLICIT',
  NO_TARGET: 'NO_TARGET',
});

const HANDOFF_RESULT = Object.freeze({
  REQUEST_BLOCKED: 'REQUEST_BLOCKED',
  RESERVED_AND_EXECUTED: 'RESERVED_AND_EXECUTED',
  EXISTING_REQUEST: 'EXISTING_REQUEST',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  ACTIVE_OWNERSHIP_CONFLICT: 'ACTIVE_OWNERSHIP_CONFLICT',
  CLAIM_LOST: 'CLAIM_LOST',
  NOT_CLAIMABLE: 'NOT_CLAIMABLE',
  NOT_FOUND: 'NOT_FOUND',
  CONFIGURATION_BLOCKED: 'CONFIGURATION_BLOCKED',
  MAPPING_BLOCKED: 'MAPPING_BLOCKED',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  RETRYABLE_FAILED: 'RETRYABLE_FAILED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
  RELEASE_BLOCKED: 'RELEASE_BLOCKED',
});

const SAFE_REASON_CODES = Object.freeze([
  'CUSTOMER_REQUESTED_HUMAN',
  'STAFF_REQUEST',
  'SAFETY_ESCALATION',
  'OPERATOR_TEST',
  'SMOKE_TEST',
]);

const SAFE_CODE_RE = /^[A-Z0-9][A-Z0-9_:-]{0,95}$/;
const MAX_REF_CHARS = 256;
const MAX_CODE_CHARS = 96;
const REQUEST_KEYS = Object.freeze([
  'tenantId',
  'integrationId',
  'handoffRequestKey',
  'businessIdempotencyKey',
  'externalConversationRef',
  'safeReasonCode',
  'assignmentTargetKind',
  'assignmentTargetRef',
]);

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function blocked(code) {
  return { result: HANDOFF_RESULT.REQUEST_BLOCKED, safeErrorCode: code };
}

function trimRequired(value, code, maxChars) {
  if (typeof value !== 'string') fail(code);
  const out = value.trim();
  if (!out || out.length > maxChars) fail(code);
  return out;
}

function trimOptional(value, code, maxChars) {
  if (value === null || value === undefined) return null;
  return trimRequired(value, code, maxChars);
}

function safeCode(value, code) {
  const out = trimRequired(value, code, MAX_CODE_CHARS);
  if (!SAFE_CODE_RE.test(out)) fail(code);
  return out;
}

function assertAllowedKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(code);
  }
}

function normalizeTargetKind(value) {
  const kind = safeCode(value, 'HANDOFF_TARGET_KIND_INVALID');
  if (!Object.prototype.hasOwnProperty.call(TARGET_KIND, kind)) fail('HANDOFF_TARGET_KIND_UNSUPPORTED');
  return kind;
}

function normalizeRequest(command) {
  const c = command || {};
  assertAllowedKeys(c, REQUEST_KEYS, 'HANDOFF_COMMAND_SHAPE_INVALID');
  const normalized = {
    tenantId: trimRequired(c.tenantId, 'HANDOFF_TENANT_REQUIRED', MAX_REF_CHARS),
    integrationId: trimRequired(c.integrationId, 'HANDOFF_INTEGRATION_REQUIRED', MAX_REF_CHARS),
    handoffRequestKey: trimRequired(c.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS),
    businessIdempotencyKey: trimRequired(c.businessIdempotencyKey, 'HANDOFF_BUSINESS_KEY_REQUIRED', MAX_REF_CHARS),
    externalConversationRef: trimRequired(c.externalConversationRef, 'HANDOFF_CONVERSATION_REF_REQUIRED', MAX_REF_CHARS),
    safeReasonCode: safeCode(c.safeReasonCode, 'HANDOFF_REASON_CODE_INVALID'),
    assignmentTargetKind: normalizeTargetKind(c.assignmentTargetKind),
    assignmentTargetRef: trimOptional(c.assignmentTargetRef, 'HANDOFF_TARGET_REF_INVALID', MAX_REF_CHARS),
  };
  if (!SAFE_REASON_CODES.includes(normalized.safeReasonCode)) fail('HANDOFF_REASON_CODE_UNSUPPORTED');
  if (normalized.assignmentTargetKind === TARGET_KIND.NO_TARGET && normalized.assignmentTargetRef !== null) {
    fail('HANDOFF_NO_TARGET_REF_FORBIDDEN');
  }
  if (normalized.assignmentTargetKind !== TARGET_KIND.NO_TARGET && normalized.assignmentTargetRef === null) {
    fail('HANDOFF_TARGET_REF_REQUIRED');
  }
  return normalized;
}

function defaultDeriveActiveOwnershipKey(input) {
  const i = input || {};
  const integrationId = trimRequired(i.integrationId, 'HANDOFF_INTEGRATION_REQUIRED', MAX_REF_CHARS);
  const externalConversationRef = trimRequired(i.externalConversationRef, 'HANDOFF_CONVERSATION_REF_REQUIRED', MAX_REF_CHARS);
  return 'handoff-v1-' + sha256Hex(['BBO_HANDOFF_ACTIVE_OWNERSHIP_V1', integrationId, externalConversationRef].join('|'));
}

function normalizeAuthorityResult(result, command) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, kind: PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED, safeErrorCode: 'HANDOFF_AUTHORITY_INVALID' };
  }
  assertAllowedKeys(result, ['ok', 'tenantId', 'integrationId', 'target', 'kind', 'safeErrorCode'], 'HANDOFF_AUTHORITY_SHAPE_INVALID');
  if (result.ok !== true) {
    const kind = result.kind === PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED
      ? PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED
      : PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED;
    return { ok: false, kind, safeErrorCode: safeCode(result.safeErrorCode || 'HANDOFF_AUTHORITY_BLOCKED', 'HANDOFF_AUTHORITY_CODE_INVALID') };
  }
  const target = result.target || {};
  assertAllowedKeys(target, ['kind', 'ref'], 'HANDOFF_AUTHORITY_TARGET_SHAPE_INVALID');
  if (result.tenantId !== command.tenantId || result.integrationId !== command.integrationId) {
    return { ok: false, kind: PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED, safeErrorCode: 'HANDOFF_AUTHORITY_SCOPE_MISMATCH' };
  }
  if (target.kind !== command.assignmentTargetKind || (target.ref || null) !== command.assignmentTargetRef) {
    return { ok: false, kind: PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED, safeErrorCode: 'HANDOFF_AUTHORITY_TARGET_MISMATCH' };
  }
  return {
    ok: true,
    tenantId: result.tenantId,
    integrationId: result.integrationId,
    target: { kind: target.kind, ref: target.ref || null },
  };
}

function normalizeProviderResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { result: PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED, safeErrorCode: 'HANDOFF_PROVIDER_RESULT_INVALID' };
  }
  assertAllowedKeys(result, ['result', 'safeErrorCode', 'remoteEvidenceRef', 'writeBoundary'], 'HANDOFF_PROVIDER_RESULT_SHAPE_INVALID');
  const state = safeCode(result.result, 'HANDOFF_PROVIDER_RESULT_INVALID');
  const safeErrorCode = result.safeErrorCode ? safeCode(result.safeErrorCode, 'HANDOFF_PROVIDER_SAFE_CODE_INVALID') : null;
  const remoteEvidenceRef = trimOptional(result.remoteEvidenceRef, 'HANDOFF_REMOTE_EVIDENCE_INVALID', MAX_REF_CHARS);
  if (state === PROVIDER_EXECUTION_STATE.SUCCEEDED) return { result: state, remoteEvidenceRef };
  if (state === PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED) {
    if (result.writeBoundary !== 'BEFORE_WRITE') {
      return { result: PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED, safeErrorCode: 'HANDOFF_RETRYABLE_BOUNDARY_INVALID' };
    }
    return { result: state, safeErrorCode: safeErrorCode || 'HANDOFF_RETRYABLE_FAILED', writeBoundary: 'BEFORE_WRITE' };
  }
  if (state === PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED
    || state === PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED
    || state === PROVIDER_EXECUTION_STATE.PROVIDER_REJECTED
    || state === PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME
    || state === PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED) {
    return { result: state, safeErrorCode: safeErrorCode || state };
  }
  return { result: PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED, safeErrorCode: 'HANDOFF_PROVIDER_RESULT_UNKNOWN' };
}

function toSafeExecution(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantIntegrationId: row.tenantIntegrationId,
    handoffRequestKey: row.handoffRequestKey,
    localOwnershipState: row.localOwnershipState,
    providerExecutionState: row.providerExecutionState,
    attemptCount: row.attemptCount,
    safeErrorCode: row.safeErrorCode || null,
    remoteEvidenceRef: row.remoteEvidenceRef || null,
    hasActiveOwnership: Boolean(row.activeOwnershipKey),
  };
}

async function persistProviderResult(repository, command, execution, providerResult) {
  const base = {
    tenantIntegrationId: command.integrationId,
    id: execution.id,
  };
  if (providerResult.result === PROVIDER_EXECUTION_STATE.SUCCEEDED) {
    return repository.markSucceeded(Object.assign({}, base, { remoteEvidenceRef: providerResult.remoteEvidenceRef }));
  }
  if (providerResult.result === PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED) {
    return repository.markRetryableFailed(Object.assign({}, base, {
      safeErrorCode: providerResult.safeErrorCode,
      writeBoundary: providerResult.writeBoundary,
    }));
  }
  if (providerResult.result === PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED
    || providerResult.result === PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED) {
    return repository.markBlocked(Object.assign({}, base, {
      providerExecutionState: providerResult.result,
      safeErrorCode: providerResult.safeErrorCode,
    }));
  }
  if (providerResult.result === PROVIDER_EXECUTION_STATE.PROVIDER_REJECTED) {
    return repository.markProviderRejected(Object.assign({}, base, { safeErrorCode: providerResult.safeErrorCode }));
  }
  if (providerResult.result === PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME) {
    return repository.markUnknownOutcome(Object.assign({}, base, { safeErrorCode: providerResult.safeErrorCode }));
  }
  return repository.markReconciliationRequired(Object.assign({}, base, {
    safeErrorCode: providerResult.safeErrorCode || 'HANDOFF_RECONCILIATION_REQUIRED',
  }));
}

function assertPort(port, method, code) {
  if (!port || typeof port[method] !== 'function') fail(code);
}

function createChatwootHandoffExecutionPort(deps) {
  const d = deps || {};
  const repository = d.repository;
  assertPort(repository, 'reserve', 'HANDOFF_REPOSITORY_REQUIRED');
  assertPort(repository, 'claimExecution', 'HANDOFF_REPOSITORY_REQUIRED');
  assertPort(repository, 'inspectByRequestKey', 'HANDOFF_REPOSITORY_REQUIRED');
  assertPort(repository, 'inspectOwnership', 'HANDOFF_REPOSITORY_REQUIRED');
  const authorityResolver = d.authorityResolver;
  const providerAdapter = d.providerAdapter;
  const releaseAuthorizer = d.releaseAuthorizer;
  const deriveActiveOwnershipKey = typeof d.deriveActiveOwnershipKey === 'function'
    ? d.deriveActiveOwnershipKey
    : defaultDeriveActiveOwnershipKey;

  async function requestHandoff(rawCommand) {
    let command;
    try {
      command = normalizeRequest(rawCommand);
    } catch (e) {
      return blocked((e && e.code) || 'HANDOFF_COMMAND_INVALID');
    }

    const activeOwnershipKey = deriveActiveOwnershipKey({
      integrationId: command.integrationId,
      externalConversationRef: command.externalConversationRef,
    });

    const reserve = await repository.reserve({
      tenantIntegrationId: command.integrationId,
      handoffRequestKey: command.handoffRequestKey,
      activeOwnershipKey,
      businessIdempotencyKey: command.businessIdempotencyKey,
      externalConversationRef: command.externalConversationRef,
      assignmentTargetKind: command.assignmentTargetKind,
      assignmentTargetRef: command.assignmentTargetRef,
      safeReasonCode: command.safeReasonCode,
    });

    if (reserve.result === RESERVE_RESULT.EXISTING_REQUEST) {
      return { result: HANDOFF_RESULT.EXISTING_REQUEST, execution: toSafeExecution(reserve.execution) };
    }
    if (reserve.result === RESERVE_RESULT.IDEMPOTENCY_CONFLICT) {
      return { result: HANDOFF_RESULT.IDEMPOTENCY_CONFLICT, safeErrorCode: 'HANDOFF_IDEMPOTENCY_CONFLICT' };
    }
    if (reserve.result === RESERVE_RESULT.ACTIVE_OWNERSHIP_CONFLICT) {
      return { result: HANDOFF_RESULT.ACTIVE_OWNERSHIP_CONFLICT, safeErrorCode: 'HANDOFF_ACTIVE_OWNERSHIP_CONFLICT' };
    }

    const claim = await repository.claimExecution({
      tenantIntegrationId: command.integrationId,
      id: reserve.execution.id,
    });
    if (claim.result !== CLAIM_RESULT.CLAIM_WON) {
      return {
        result: claim.result === CLAIM_RESULT.CLAIM_LOST ? HANDOFF_RESULT.CLAIM_LOST : HANDOFF_RESULT.NOT_CLAIMABLE,
        execution: toSafeExecution(claim.execution),
      };
    }

    if (!authorityResolver || typeof authorityResolver.resolveHandoffAuthority !== 'function') {
      const marked = await repository.markBlocked({
        tenantIntegrationId: command.integrationId,
        id: claim.execution.id,
        providerExecutionState: PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED,
        safeErrorCode: 'HANDOFF_AUTHORITY_UNAVAILABLE',
      });
      return { result: HANDOFF_RESULT.CONFIGURATION_BLOCKED, execution: toSafeExecution(marked.execution), safeErrorCode: 'HANDOFF_AUTHORITY_UNAVAILABLE' };
    }

    let authority;
    try {
      authority = normalizeAuthorityResult(await authorityResolver.resolveHandoffAuthority({
        tenantId: command.tenantId,
        integrationId: command.integrationId,
        assignmentTargetKind: command.assignmentTargetKind,
        assignmentTargetRef: command.assignmentTargetRef,
      }), command);
    } catch (e) {
      authority = { ok: false, kind: PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED, safeErrorCode: (e && e.code) || 'HANDOFF_AUTHORITY_INVALID' };
    }

    if (!authority.ok) {
      const marked = await repository.markBlocked({
        tenantIntegrationId: command.integrationId,
        id: claim.execution.id,
        providerExecutionState: authority.kind,
        safeErrorCode: authority.safeErrorCode,
      });
      return {
        result: authority.kind,
        execution: toSafeExecution(marked.execution),
        safeErrorCode: authority.safeErrorCode,
      };
    }

    if (!providerAdapter || typeof providerAdapter.executeHandoff !== 'function') {
      const marked = await repository.markBlocked({
        tenantIntegrationId: command.integrationId,
        id: claim.execution.id,
        providerExecutionState: PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED,
        safeErrorCode: 'HANDOFF_PROVIDER_ADAPTER_UNAVAILABLE',
      });
      return { result: HANDOFF_RESULT.CONFIGURATION_BLOCKED, execution: toSafeExecution(marked.execution), safeErrorCode: 'HANDOFF_PROVIDER_ADAPTER_UNAVAILABLE' };
    }

    let providerResult;
    try {
      providerResult = normalizeProviderResult(await providerAdapter.executeHandoff({
        tenantId: command.tenantId,
        integrationId: command.integrationId,
        externalConversationRef: command.externalConversationRef,
        targetKind: command.assignmentTargetKind,
        targetRef: command.assignmentTargetRef,
        safeReasonCode: command.safeReasonCode,
        attemptNumber: claim.execution.attemptCount,
      }));
    } catch (e) {
      providerResult = { result: PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME, safeErrorCode: (e && e.code) || 'HANDOFF_PROVIDER_THROWN' };
    }

    const persisted = await persistProviderResult(repository, command, claim.execution, providerResult);
    return {
      result: providerResult.result === PROVIDER_EXECUTION_STATE.SUCCEEDED
        ? HANDOFF_RESULT.RESERVED_AND_EXECUTED
        : providerResult.result,
      execution: toSafeExecution(persisted.execution),
      safeErrorCode: providerResult.safeErrorCode || null,
    };
  }

  async function inspectHandoff(query) {
    const q = query || {};
    const tenantIntegrationId = trimRequired(q.integrationId, 'HANDOFF_INTEGRATION_REQUIRED', MAX_REF_CHARS);
    const handoffRequestKey = trimRequired(q.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS);
    return toSafeExecution(await repository.inspectByRequestKey({ tenantIntegrationId, handoffRequestKey }));
  }

  async function inspectOwnership(query) {
    const q = query || {};
    const tenantIntegrationId = trimRequired(q.integrationId, 'HANDOFF_INTEGRATION_REQUIRED', MAX_REF_CHARS);
    const activeOwnershipKey = q.activeOwnershipKey
      ? trimRequired(q.activeOwnershipKey, 'HANDOFF_ACTIVE_OWNERSHIP_KEY_REQUIRED', MAX_REF_CHARS)
      : deriveActiveOwnershipKey({
        integrationId: tenantIntegrationId,
        externalConversationRef: trimRequired(q.externalConversationRef, 'HANDOFF_CONVERSATION_REF_REQUIRED', MAX_REF_CHARS),
      });
    return toSafeExecution(await repository.inspectOwnership({ tenantIntegrationId, activeOwnershipKey }));
  }

  async function releaseOwnership(releaseCommand) {
    const r = releaseCommand || {};
    const tenantId = trimRequired(r.tenantId, 'HANDOFF_TENANT_REQUIRED', MAX_REF_CHARS);
    const integrationId = trimRequired(r.integrationId, 'HANDOFF_INTEGRATION_REQUIRED', MAX_REF_CHARS);
    const handoffRequestKey = trimRequired(r.handoffRequestKey, 'HANDOFF_REQUEST_KEY_REQUIRED', MAX_REF_CHARS);
    const action = safeCode(r.action, 'HANDOFF_RELEASE_ACTION_REQUIRED');
    safeCode(r.safeReasonCode, 'HANDOFF_REASON_CODE_INVALID');
    if (!['RESUME', 'CANCEL'].includes(action)) return { result: HANDOFF_RESULT.RELEASE_BLOCKED, safeErrorCode: 'HANDOFF_RELEASE_ACTION_UNSUPPORTED' };
    const current = await repository.inspectByRequestKey({ tenantIntegrationId: integrationId, handoffRequestKey });
    if (!current) return { result: HANDOFF_RESULT.NOT_FOUND };
    if (current.activeOwnershipKey === null) return { result: HANDOFF_RESULT.RELEASE_BLOCKED, safeErrorCode: 'HANDOFF_OWNERSHIP_NOT_ACTIVE', execution: toSafeExecution(current) };
    if (!releaseAuthorizer || typeof releaseAuthorizer.authorize !== 'function') {
      return { result: HANDOFF_RESULT.RELEASE_BLOCKED, safeErrorCode: 'RESUME_AUTHORITY_BLOCKED', execution: toSafeExecution(current) };
    }
    const decision = await releaseAuthorizer.authorize({
      tenantId,
      integrationId,
      handoffRequestKey,
      action,
      safeReasonCode: r.safeReasonCode,
    }, toSafeExecution(current));
    if (!decision || decision.authorized !== true) {
      return { result: HANDOFF_RESULT.RELEASE_BLOCKED, safeErrorCode: 'RESUME_AUTHORITY_BLOCKED', execution: toSafeExecution(current) };
    }
    const finalState = action === 'RESUME' ? LOCAL_OWNERSHIP_STATE.RELEASED : LOCAL_OWNERSHIP_STATE.CANCELLED;
    const released = await repository.releaseOwnership({
      tenantIntegrationId: integrationId,
      handoffRequestKey,
      expectedActiveOwnershipKey: current.activeOwnershipKey,
      finalLocalOwnershipState: finalState,
    });
    return {
      result: finalState === LOCAL_OWNERSHIP_STATE.RELEASED ? HANDOFF_RESULT.RELEASED : HANDOFF_RESULT.CANCELLED,
      releaseResult: released.result,
      execution: toSafeExecution(released.execution),
    };
  }

  return {
    requestHandoff,
    inspectHandoff,
    inspectOwnership,
    releaseOwnership,
  };
}

module.exports = {
  createChatwootHandoffExecutionPort,
  defaultDeriveActiveOwnershipKey,
  TARGET_KIND,
  HANDOFF_RESULT,
  SAFE_REASON_CODES,
};
