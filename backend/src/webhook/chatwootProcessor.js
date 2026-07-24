'use strict';

// CHATWOOT-PROCESSOR-WIRING-DESIGN-01
// Pure / DI-first Chatwoot canonical AI message processor PORT + adapter.
//
// This module is the concrete `canonicalMessageProcessor` port consumed by
// chatwootIngress.js. It sits BETWEEN the verified canonical envelope and the
// (deferred) live bot/AI engine + outbound network adapter.
//
// PORT-ONLY design (CHATWOOT-PROCESSOR-WIRING-DESIGN-01, §V/§IX): the real bot
// engine (backend/src/bot/engine.js) instantiates PrismaClient at import and the
// legacy webhook handler pulls in axios, so NEITHER is safe to import here. The
// AI is therefore an INJECTED `messageProcessor` port; this module never imports a
// live engine, never opens the network, never reads a secret.
//
// Boundaries (hard rules §IX):
//   - never instantiates PrismaClient
//   - never reads process.env
//   - never fetch/axios/http/https, never imports an OpenAI / live AI client
//   - never calls a live Chatwoot API
//   - never creates a tenant from a payload, never bypasses idempotency
//   - never logs raw content / secret / header signature / token
//   - never mutates the (deep-frozen) canonical envelope
//   - never generates a reply for a loop / human-owned / ineligible event
//
// The only import is chatwootCanonical.js, which is pure (node:crypto only).

const canonical = require('./chatwootCanonical');

// Internal normalized taxonomy (§XI).
const PROCESSOR_RESULT = Object.freeze({
  NO_REPLY: 'NO_REPLY',
  PENDING_OUTBOUND_COMMAND: 'PENDING_OUTBOUND_COMMAND',
  HANDOFF_REQUEST: 'HANDOFF_REQUEST',
  PROCESSING_FAILED_RETRYABLE: 'PROCESSING_FAILED_RETRYABLE',
  PROCESSING_FAILED_FINAL: 'PROCESSING_FAILED_FINAL',
});

// Result strings the chatwootIngress port contract expects back from
// processCanonicalMessage(envelope) → { result, content }.
const INGRESS_RESULT = Object.freeze({
  REPLY_COMMAND: 'REPLY_COMMAND',
  NO_REPLY: 'NO_REPLY',
  HANDOFF_REQUEST: 'HANDOFF_REQUEST',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
});

const PROCESSOR_REASON = Object.freeze({
  NOT_CONFIGURED: 'PROCESSOR_NOT_CONFIGURED',
  INELIGIBLE: 'PROCESSOR_INELIGIBLE',
  EMPTY_CONTENT: 'PROCESSOR_EMPTY_CONTENT',
  ENVELOPE_INVALID: 'PROCESSOR_ENVELOPE_INVALID',
  TENANT_CONTEXT_MISSING: 'PROCESSOR_TENANT_CONTEXT_MISSING',
  INTEGRATION_MISSING: 'PROCESSOR_INTEGRATION_MISSING',
  HUMAN_ACTIVE: 'PROCESSOR_HUMAN_ACTIVE',
  PROCESSOR_ERROR: 'PROCESSOR_ERROR',
  PROCESSOR_TIMEOUT: 'PROCESSOR_TIMEOUT',
});

// A command must NEVER carry a secret / token / API URL / raw payload.
const FORBIDDEN_COMMAND_KEY_RE = /^(token|apitoken|accesstoken|apikey|secret|password|authorization|signature|webhooksecret|rawpayload|rawbody|apiurl|url|endpoint|ciphertext|providerpayload)$/i;

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}

function safeOutcome(result, reason, zeroAi) {
  return Object.freeze({
    processed: false,
    result,
    command: null,
    zeroAiInvocation: zeroAi === true,
    reason: reason || null,
    ack: 'SAFE_ACK',
  });
}

// ---- Eligibility (defense in depth §X) ----------------------------------------
// Re-checks envelope-derivable conditions even though chatwootIngress already
// gated them: provider/channel/event/direction/senderRole/tenant/integration and
// a HUMAN_ACTIVE conversation. Never invokes the AI when any condition fails.
function evaluateProcessorEligibility(input) {
  const i = input || {};
  const env = i.envelope;
  const block = (reason) => ({ eligible: false, reason, zeroAiInvocation: true });
  if (!env || typeof env !== 'object' || Array.isArray(env)) return block(PROCESSOR_REASON.ENVELOPE_INVALID);
  if (env.provider !== canonical.PROVIDER) return block(PROCESSOR_REASON.ENVELOPE_INVALID);
  if (env.channel !== canonical.CHANNEL) return block(PROCESSOR_REASON.ENVELOPE_INVALID);
  if (env.verificationState !== 'VERIFIED') return block(PROCESSOR_REASON.ENVELOPE_INVALID);
  if (!canonical.SUPPORTED_CHATWOOT_EVENTS.includes(env.eventType)) return block(PROCESSOR_REASON.INELIGIBLE);
  if (env.direction !== 'inbound') return block(PROCESSOR_REASON.INELIGIBLE);
  if (env.senderRole !== 'customer') return block(PROCESSOR_REASON.INELIGIBLE);
  const tc = i.tenantContext || {};
  if (!env.tenantId && !tc.tenantId) return block(PROCESSOR_REASON.TENANT_CONTEXT_MISSING);
  if (!env.integrationId && !tc.integrationId) return block(PROCESSOR_REASON.INTEGRATION_MISSING);
  if (i.conversationState === 'HUMAN_ACTIVE' || env.handoffState === 'HUMAN_ACTIVE') return block(PROCESSOR_REASON.HUMAN_ACTIVE);
  return { eligible: true, reason: null, zeroAiInvocation: false };
}

// ---- Result normalization (§XI) -----------------------------------------------
// Maps an arbitrary injected-processor output into the internal taxonomy.
// Fails CLOSED: unknown / null shapes become PROCESSING_FAILED_FINAL (no reply,
// no retry) rather than a spurious reply.
function normalizeProcessorResult(result) {
  if (result === null || result === undefined) return { result: PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, content: null };
  if (typeof result !== 'object' || Array.isArray(result)) return { result: PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, content: null };
  const r = result;
  const explicit = typeof r.result === 'string' ? r.result : null;
  const text = typeof r.reply === 'string' ? r.reply : (typeof r.content === 'string' ? r.content : null);

  if (explicit === PROCESSOR_RESULT.NO_REPLY) return { result: PROCESSOR_RESULT.NO_REPLY, content: null };
  if (explicit === PROCESSOR_RESULT.HANDOFF_REQUEST || explicit === 'HANDOFF') {
    return { result: PROCESSOR_RESULT.HANDOFF_REQUEST, content: null };
  }
  if (explicit === PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE || explicit === 'FAILED_RETRYABLE' || r.retryable === true) {
    return { result: PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE, content: null };
  }
  if (explicit === PROCESSOR_RESULT.PROCESSING_FAILED_FINAL || explicit === 'FAILED_FINAL' || r.final === true) {
    return { result: PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, content: null };
  }
  if (explicit === PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND || explicit === 'REPLY' || explicit === 'REPLY_COMMAND') {
    if (typeof text === 'string' && text.trim().length > 0) return { result: PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND, content: text };
    return { result: PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, content: null };
  }
  return { result: PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, content: null };
}

// ---- Pending outbound command (§XI.5) -----------------------------------------
// Builds the intent to reply ONLY. It performs NO HTTP; the outbound network
// adapter is a separate deferred phase. Carries only safe references + text, and
// fails closed if any secret/token/URL-shaped key is present.
function buildPendingOutboundCommand(input) {
  const i = input || {};
  const env = i.envelope || {};
  const tc = i.tenantContext || {};
  const content = typeof i.content === 'string' ? i.content : '';
  const command = {
    provider: canonical.PROVIDER,
    channel: canonical.CHANNEL,
    integrationId: env.integrationId || tc.integrationId || null,
    tenantId: env.tenantId || tc.tenantId || null,
    externalConversationRef: env.externalConversationRef || null,
    content,
    idempotencyKey: env.idempotencyKey || i.idempotencyKey || null,
    correlationId: env.correlationId || i.correlationId || null,
    transport: 'PENDING',
    dispatched: false,
  };
  for (const key of Object.keys(command)) {
    if (FORBIDDEN_COMMAND_KEY_RE.test(key)) {
      const e = new Error('OUTBOUND_COMMAND_FORBIDDEN_FIELD'); e.code = 'OUTBOUND_COMMAND_FORBIDDEN_FIELD'; throw e;
    }
  }
  return deepFreeze(command);
}

// ---- Safe audit projection (§IX redact) ---------------------------------------
// Emits only non-secret metadata + content LENGTH. Never content / email / phone /
// token / signature / raw payload.
function redactProcessorAudit(input) {
  const i = input || {};
  const env = i.envelope || {};
  const out = {
    provider: env.provider || canonical.PROVIDER,
    channel: env.channel || canonical.CHANNEL,
    integrationId: env.integrationId || null,
    tenantId: env.tenantId || null,
    eventType: env.eventType || null,
    direction: env.direction || null,
    senderRole: env.senderRole || null,
    correlationId: env.correlationId || null,
    result: typeof i.result === 'string' ? i.result : null,
    reason: typeof i.reason === 'string' ? i.reason : null,
  };
  const content = typeof i.content === 'string' ? i.content
    : (typeof env.text === 'string' ? env.text : null);
  if (content !== null) out.contentLength = content.length;
  return out;
}

// Optional wall-clock timeout around the injected AI call (deterministic timer
// injectable for tests). A timeout maps to a RETRYABLE failure — Chatwoot / the
// caller may redeliver; it never becomes a spurious reply.
function withTimeout(promise, timeoutMs, timer, clearTimer) {
  if (!(typeof timeoutMs === 'number' && timeoutMs >= 0)) return Promise.resolve(promise);
  const setT = typeof timer === 'function' ? timer : setTimeout;
  const clearT = typeof clearTimer === 'function' ? clearTimer : clearTimeout;
  return new Promise((resolve, reject) => {
    const handle = setT(() => { const e = new Error('PROCESSOR_TIMEOUT'); e.code = 'PROCESSOR_TIMEOUT'; reject(e); }, timeoutMs);
    Promise.resolve(promise).then(
      (v) => { clearT(handle); resolve(v); },
      (err) => { clearT(handle); reject(err); },
    );
  });
}

// ---- Core: process one canonical event ----------------------------------------
async function processChatwootCanonicalEvent(input) {
  const i = input || {};
  const messageProcessor = i.messageProcessor;
  const logger = i.logger && typeof i.logger.info === 'function' ? i.logger : null;

  // 1. Eligibility (defense in depth). Blocked → NO_REPLY, ZERO AI.
  const elig = evaluateProcessorEligibility(i);
  if (!elig.eligible) {
    if (logger) logger.info(redactProcessorAudit({ envelope: i.envelope, result: PROCESSOR_RESULT.NO_REPLY, reason: elig.reason }));
    return safeOutcome(PROCESSOR_RESULT.NO_REPLY, elig.reason, true);
  }

  // 2. Content policy. Empty / attachment-only → NO_REPLY, ZERO AI.
  const text = typeof i.envelope.text === 'string' ? i.envelope.text : null;
  if (text === null || text.trim().length === 0) {
    return safeOutcome(PROCESSOR_RESULT.NO_REPLY, PROCESSOR_REASON.EMPTY_CONTENT, true);
  }

  // 3. Processor availability. Missing port → FINAL (safe ACK, no retry), ZERO AI.
  if (!messageProcessor || typeof messageProcessor.generateReply !== 'function') {
    return safeOutcome(PROCESSOR_RESULT.PROCESSING_FAILED_FINAL, PROCESSOR_REASON.NOT_CONFIGURED, true);
  }

  // 4. Invoke the injected AI/bot port EXACTLY ONCE with a SAFE input (no secret,
  //    no header, no raw payload). Errors/timeouts map to RETRYABLE.
  let raw;
  try {
    raw = await withTimeout(
      messageProcessor.generateReply({
        provider: i.envelope.provider,
        channel: i.envelope.channel,
        integrationId: i.envelope.integrationId,
        tenantId: i.envelope.tenantId,
        externalConversationRef: i.envelope.externalConversationRef || null,
        externalMessageRef: i.envelope.externalMessageRef || null,
        text,
        correlationId: i.envelope.correlationId || null,
        now: typeof i.now === 'number' ? i.now : null,
      }),
      typeof i.timeoutMs === 'number' ? i.timeoutMs : null,
      i.setTimer,
      i.clearTimer,
    );
  } catch (e) {
    const reason = e && e.code === 'PROCESSOR_TIMEOUT' ? PROCESSOR_REASON.PROCESSOR_TIMEOUT : PROCESSOR_REASON.PROCESSOR_ERROR;
    return safeOutcome(PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE, reason, false);
  }

  // 5. Normalize + (only for a real reply) build a PENDING command. No HTTP.
  const norm = normalizeProcessorResult(raw);
  if (norm.result === PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND) {
    const command = buildPendingOutboundCommand({ envelope: i.envelope, content: norm.content, tenantContext: i.tenantContext });
    if (logger) logger.info(redactProcessorAudit({ envelope: i.envelope, result: norm.result }));
    return Object.freeze({ processed: true, result: norm.result, command, zeroAiInvocation: false, reason: null, ack: 'SAFE_ACK' });
  }
  if (logger) logger.info(redactProcessorAudit({ envelope: i.envelope, result: norm.result }));
  return safeOutcome(norm.result, null, false);
}

// ---- Ingress port contract mapping --------------------------------------------
// chatwootIngress expects processCanonicalMessage(envelope) → { result, content }
// with result ∈ { REPLY_COMMAND, NO_REPLY, PROCESSING_FAILED }.
function toIngressResult(outcome) {
  const o = outcome || {};
  switch (o.result) {
    case PROCESSOR_RESULT.PENDING_OUTBOUND_COMMAND:
      return { result: INGRESS_RESULT.REPLY_COMMAND, content: (o.command && o.command.content) || '', command: o.command };
    case PROCESSOR_RESULT.PROCESSING_FAILED_RETRYABLE:
      return { result: INGRESS_RESULT.PROCESSING_FAILED, content: null };
    case PROCESSOR_RESULT.HANDOFF_REQUEST:
      // Surface as HANDOFF_REQUEST so the ingress can apply the deferral policy
      // (no handoff-execution port exists yet → retryable, NEVER completed).
      // Must NOT be laundered into NO_REPLY/completed.
      return { result: INGRESS_RESULT.HANDOFF_REQUEST, content: null };
    case PROCESSOR_RESULT.PROCESSING_FAILED_FINAL:
      // A processor that could not produce a reply is a FAILURE, not a completion.
      // Surface as PROCESSING_FAILED (retryable) so the receipt is not completed and
      // the message is not silently dropped.
      return { result: INGRESS_RESULT.PROCESSING_FAILED, content: null };
    case PROCESSOR_RESULT.NO_REPLY:
      return { result: INGRESS_RESULT.NO_REPLY, content: null };
    default:
      // Fail closed: an unrecognized internal taxonomy value is a contract
      // violation → PROCESSING_FAILED (retryable), never a spurious completion.
      return { result: INGRESS_RESULT.PROCESSING_FAILED, content: null };
  }
}

// ---- Factory: the injectable canonicalMessageProcessor port --------------------
function createChatwootProcessor(dependencies) {
  const deps = dependencies || {};
  const messageProcessor = deps.messageProcessor;
  const logger = deps.logger;
  const clock = typeof deps.now === 'function' ? deps.now : null;
  const timeoutMs = typeof deps.timeoutMs === 'number' ? deps.timeoutMs : null;

  async function processCanonicalMessage(envelope) {
    const outcome = await processChatwootCanonicalEvent({
      envelope,
      tenantContext: { tenantId: envelope && envelope.tenantId, integrationId: envelope && envelope.integrationId },
      conversationState: envelope && envelope.handoffState === 'HUMAN_ACTIVE' ? 'HUMAN_ACTIVE' : null,
      messageProcessor,
      logger,
      now: clock ? clock() : (typeof (envelope && envelope.receivedAt) === 'number' ? envelope.receivedAt : null),
      timeoutMs,
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
    });
    return toIngressResult(outcome);
  }

  return {
    processCanonicalMessage,
    processChatwootCanonicalEvent,
    evaluateProcessorEligibility,
    buildPendingOutboundCommand,
    normalizeProcessorResult,
    redactProcessorAudit,
  };
}

module.exports = {
  createChatwootProcessor,
  processChatwootCanonicalEvent,
  evaluateProcessorEligibility,
  buildPendingOutboundCommand,
  normalizeProcessorResult,
  redactProcessorAudit,
  toIngressResult,
  PROCESSOR_RESULT,
  INGRESS_RESULT,
  PROCESSOR_REASON,
};
