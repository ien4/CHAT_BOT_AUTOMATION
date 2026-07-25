'use strict';

// Durable Chatwoot outbound delivery receipt repository.
//
// This module is intentionally DI-only: callers inject a Prisma-like client and
// this file never creates a client, reads environment, logs, or stores secret/raw
// message material. The receipt table stores only safe references, content hash,
// state, attempt count, remote id, and safe error codes.

const RECEIPT_STATUS = Object.freeze({
  RESERVED: 'RESERVED',
  DISPATCHING: 'DISPATCHING',
  SUCCEEDED: 'SUCCEEDED',
  RETRYABLE_FAILED: 'RETRYABLE_FAILED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  CONFIGURATION_BLOCKED: 'CONFIGURATION_BLOCKED',
  MAPPING_BLOCKED: 'MAPPING_BLOCKED',
  PAYLOAD_REJECTED: 'PAYLOAD_REJECTED',
});

const RESERVE_RESULT = Object.freeze({
  RESERVED_NEW: 'RESERVED_NEW',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
});

const CLAIM_RESULT = Object.freeze({
  CLAIMED: 'CLAIMED',
  NOT_CLAIMED: 'NOT_CLAIMED',
  NOT_FOUND: 'NOT_FOUND',
});

const DEFAULT_RETRYABLE_SAFE_ERROR_CODES = Object.freeze([
  'HTTP_408',
  'HTTP_425',
  'HTTP_429',
  'HTTP_500',
  'HTTP_502',
  'HTTP_503',
  'HTTP_504',
  'BEFORE_WRITE_FAILURE',
  'TRANSPORT_BEFORE_WRITE_FAILURE',
]);

const FORBIDDEN_RECEIPT_KEY_RE = /^(rawpayload|rawbody|payload|body|content|text|messagetext|accesstoken|apiaccesstoken|api_access_token|token|secret|password|apikey|authorization|signature|ciphertext|plaintext|apiorigin|apiurl|apibaseurl|baseurl|origin|url|endpoint)$/i;

function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'P2002' || (typeof err.message === 'string' && /unique constraint/i.test(err.message)));
}

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertNoForbiddenKeys(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_RECEIPT_KEY_RE.test(key)) fail('CHATWOOT_OUTBOUND_RECEIPT_FORBIDDEN_FIELD');
    assertNoForbiddenKeys(value[key]);
  }
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code);
  return value;
}

function toRetryableCodeList(values) {
  const raw = Array.isArray(values) && values.length > 0 ? values : DEFAULT_RETRYABLE_SAFE_ERROR_CODES;
  const out = [];
  for (const value of raw) {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out.length > 0 ? out : Array.from(DEFAULT_RETRYABLE_SAFE_ERROR_CODES);
}

function createChatwootOutboundReceiptRepository(deps) {
  const d = deps || {};
  const client = d.client;
  const clock = typeof d.clock === 'function' ? d.clock : () => new Date();
  if (!client || !client.outboundDeliveryReceipt) fail('CHATWOOT_OUTBOUND_RECEIPT_CLIENT_REQUIRED');

  const table = client.outboundDeliveryReceipt;

  function toSafeReserveData(receipt) {
    assertNoForbiddenKeys(receipt);
    return {
      tenantIntegrationId: requiredString(receipt.tenantIntegrationId, 'CHATWOOT_OUTBOUND_TENANT_INTEGRATION_REQUIRED'),
      outboundCommandKey: requiredString(receipt.outboundCommandKey, 'CHATWOOT_OUTBOUND_COMMAND_KEY_REQUIRED'),
      businessIdempotencyKey: requiredString(receipt.businessIdempotencyKey, 'CHATWOOT_OUTBOUND_BUSINESS_IDEMPOTENCY_REQUIRED'),
      externalConversationRef: requiredString(receipt.externalConversationRef, 'CHATWOOT_OUTBOUND_CONVERSATION_REF_REQUIRED'),
      contentHash: requiredString(receipt.contentHash, 'CHATWOOT_OUTBOUND_CONTENT_HASH_REQUIRED'),
      status: RECEIPT_STATUS.RESERVED,
      attemptCount: 0,
      remoteMessageId: null,
      safeErrorCode: null,
    };
  }

  async function inspect(outboundCommandKey) {
    requiredString(outboundCommandKey, 'CHATWOOT_OUTBOUND_COMMAND_KEY_REQUIRED');
    return table.findUnique({ where: { outboundCommandKey } });
  }

  async function updateStatus(outboundCommandKey, data) {
    requiredString(outboundCommandKey, 'CHATWOOT_OUTBOUND_COMMAND_KEY_REQUIRED');
    return table.update({
      where: { outboundCommandKey },
      data: Object.assign({ updatedAt: clock() }, data),
    });
  }

  return {
    RECEIPT_STATUS,
    RESERVE_RESULT,
    CLAIM_RESULT,

    async reserve(receipt) {
      const data = toSafeReserveData(receipt || {});
      try {
        const row = await table.create({ data });
        return { result: RESERVE_RESULT.RESERVED_NEW, receipt: row };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const existing = await inspect(data.outboundCommandKey);
        if (!existing) return { result: RESERVE_RESULT.CONFLICT, receipt: null };
        return { result: RESERVE_RESULT.DUPLICATE, receipt: existing };
      }
    },

    inspect,

    async claimDispatch(params) {
      const p = params || {};
      const outboundCommandKey = requiredString(p.outboundCommandKey, 'CHATWOOT_OUTBOUND_COMMAND_KEY_REQUIRED');
      const retryableCodes = toRetryableCodeList(p.retryableSafeErrorCodes);
      const result = await table.updateMany({
        where: {
          outboundCommandKey,
          OR: [
            { status: RECEIPT_STATUS.RESERVED },
            { status: RECEIPT_STATUS.RETRYABLE_FAILED, safeErrorCode: { in: retryableCodes } },
          ],
        },
        data: {
          status: RECEIPT_STATUS.DISPATCHING,
          safeErrorCode: null,
          attemptCount: { increment: 1 },
          updatedAt: clock(),
        },
      });
      const receipt = await inspect(outboundCommandKey);
      if (!receipt) return { result: CLAIM_RESULT.NOT_FOUND, receipt: null };
      return {
        result: result && result.count === 1 ? CLAIM_RESULT.CLAIMED : CLAIM_RESULT.NOT_CLAIMED,
        receipt,
      };
    },

    async markSucceeded(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.SUCCEEDED,
        remoteMessageId: requiredString(p.remoteMessageId, 'CHATWOOT_OUTBOUND_REMOTE_MESSAGE_ID_REQUIRED'),
        safeErrorCode: null,
      });
    },

    async markRetryableFailed(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.RETRYABLE_FAILED,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },

    async markUnknownOutcome(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.UNKNOWN_OUTCOME,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },

    async markConfigurationBlocked(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.CONFIGURATION_BLOCKED,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },

    async markMappingBlocked(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.MAPPING_BLOCKED,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },

    async markPayloadRejected(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.PAYLOAD_REJECTED,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },

    async markReconciliationRequired(params) {
      const p = params || {};
      return updateStatus(p.outboundCommandKey, {
        status: RECEIPT_STATUS.RECONCILIATION_REQUIRED,
        safeErrorCode: requiredString(p.safeErrorCode, 'CHATWOOT_OUTBOUND_SAFE_ERROR_CODE_REQUIRED'),
      });
    },
  };
}

module.exports = {
  createChatwootOutboundReceiptRepository,
  RECEIPT_STATUS,
  RESERVE_RESULT,
  CLAIM_RESULT,
  DEFAULT_RETRYABLE_SAFE_ERROR_CODES,
  isUniqueViolation,
};
