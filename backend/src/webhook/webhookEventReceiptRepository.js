'use strict';

// FACEBOOK-DIRECT-CANONICAL-DURABLE-INGRESS-CLOSEOUT-01
// Durable webhook event receipt repository — the DB-backed idempotency authority.
//
// Design:
//   - Dependency-injected Prisma-like client (createWebhookEventReceiptRepository({ client }))
//     so it is unit-testable with a mock and never instantiates a client at import.
//   - Atomic reservation via a single `create` guarded by the unique index on
//     idempotencyKey. A unique violation (Prisma P2002) is the deterministic signal
//     that another instance/process already reserved the same event.
//   - NEVER stores rawPayload / rawBody / messageText / accessToken / appSecret /
//     verifyToken / signature. Only safe references + processing state.
//   - A raw DB error (connection loss etc.) is re-thrown so the caller can answer
//     with a retryable HTTP status (Meta will re-deliver) — it is NOT swallowed
//     into a false "reserved".

const RESERVE_RESULT = Object.freeze({
  RESERVED_NEW: 'RESERVED_NEW',
  DUPLICATE_PROCESSING: 'DUPLICATE_PROCESSING',
  DUPLICATE_COMPLETED: 'DUPLICATE_COMPLETED',
  RETRYABLE_EXISTING: 'RETRYABLE_EXISTING',
  CONFLICT: 'CONFLICT',
});

const PROCESSING_STATE = Object.freeze({
  RESERVED: 'RESERVED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FINAL: 'FAILED_FINAL',
});

// Keys that must never be persisted into a receipt.
const FORBIDDEN_RECEIPT_KEY_RE = /^(rawpayload|rawbody|messagetext|text|accesstoken|appsecret|verifytoken|signature|secret|password|apikey|authorization)$/i;

function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'P2002' || (typeof err.message === 'string' && /unique constraint/i.test(err.message)));
}

function assertNoForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_RECEIPT_KEY_RE.test(key)) {
      const e = new Error('WEBHOOK_RECEIPT_FORBIDDEN_FIELD');
      e.code = 'WEBHOOK_RECEIPT_FORBIDDEN_FIELD';
      throw e;
    }
  }
}

function createWebhookEventReceiptRepository(deps) {
  const d = deps || {};
  const client = d.client;
  const clock = typeof d.clock === 'function' ? d.clock : () => new Date();
  if (!client || !client.webhookEventReceipt) {
    const e = new Error('WEBHOOK_RECEIPT_CLIENT_REQUIRED');
    e.code = 'WEBHOOK_RECEIPT_CLIENT_REQUIRED';
    throw e;
  }
  const table = client.webhookEventReceipt;

  // Only these safe fields are ever written.
  function toSafeData(receipt) {
    assertNoForbiddenKeys(receipt);
    return {
      provider: receipt.provider,
      integrationId: receipt.integrationId,
      tenantId: receipt.tenantId,
      providerEventRef: receipt.providerEventRef || null,
      externalMessageRef: receipt.externalMessageRef || null,
      eventType: receipt.eventType,
      direction: receipt.direction,
      idempotencyKey: receipt.idempotencyKey,
      correlationId: receipt.correlationId || null,
      retentionUntil: receipt.retentionUntil || null,
    };
  }

  return {
    RESERVE_RESULT,
    PROCESSING_STATE,

    // Atomic reserve. One winner across instances via the unique idempotencyKey.
    async reserveEvent(receipt) {
      if (!receipt || !receipt.idempotencyKey) {
        const e = new Error('WEBHOOK_RECEIPT_IDEMPOTENCY_KEY_REQUIRED');
        e.code = 'WEBHOOK_RECEIPT_IDEMPOTENCY_KEY_REQUIRED';
        throw e;
      }
      if (!receipt.integrationId || !receipt.tenantId) {
        const e = new Error('WEBHOOK_RECEIPT_TENANT_AUTHORITY_REQUIRED');
        e.code = 'WEBHOOK_RECEIPT_TENANT_AUTHORITY_REQUIRED';
        throw e;
      }
      const now = clock();
      try {
        const row = await table.create({
          data: Object.assign(toSafeData(receipt), {
            processingState: PROCESSING_STATE.RESERVED,
            attemptCount: 1,
            firstReceivedAt: now,
            lastAttemptAt: now,
          }),
        });
        return { result: RESERVE_RESULT.RESERVED_NEW, receipt: row };
      } catch (err) {
        if (isUniqueViolation(err)) {
          const existing = await table.findUnique({ where: { idempotencyKey: receipt.idempotencyKey } });
          if (!existing) return { result: RESERVE_RESULT.CONFLICT, receipt: null };
          if (existing.processingState === PROCESSING_STATE.COMPLETED) {
            return { result: RESERVE_RESULT.DUPLICATE_COMPLETED, receipt: existing };
          }
          if (existing.processingState === PROCESSING_STATE.FAILED_RETRYABLE) {
            return { result: RESERVE_RESULT.RETRYABLE_EXISTING, receipt: existing };
          }
          return { result: RESERVE_RESULT.DUPLICATE_PROCESSING, receipt: existing };
        }
        // Raw DB failure (e.g. connection lost) — surface so caller returns retryable.
        throw err;
      }
    },

    async markProcessing(idempotencyKey) {
      return table.update({ where: { idempotencyKey }, data: { processingState: PROCESSING_STATE.PROCESSING, lastAttemptAt: clock() } });
    },
    async markCompleted(idempotencyKey) {
      return table.update({ where: { idempotencyKey }, data: { processingState: PROCESSING_STATE.COMPLETED, completedAt: clock() } });
    },
    async markRetryableFailure(idempotencyKey, errorCode) {
      return table.update({ where: { idempotencyKey }, data: { processingState: PROCESSING_STATE.FAILED_RETRYABLE, errorCode: errorCode || null, lastAttemptAt: clock() } });
    },
    async markFinalFailure(idempotencyKey, errorCode) {
      return table.update({ where: { idempotencyKey }, data: { processingState: PROCESSING_STATE.FAILED_FINAL, errorCode: errorCode || null, lastAttemptAt: clock() } });
    },
    async inspectEvent(idempotencyKey) {
      return table.findUnique({ where: { idempotencyKey } });
    },
  };
}

module.exports = {
  createWebhookEventReceiptRepository,
  RESERVE_RESULT,
  PROCESSING_STATE,
  isUniqueViolation,
};
