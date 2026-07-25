'use strict';

const crypto = require('node:crypto');
const { normalizeChatwootNumericId } = require('./chatwootCanonical');
const {
  RECEIPT_STATUS,
  RESERVE_RESULT,
  CLAIM_RESULT,
  DEFAULT_RETRYABLE_SAFE_ERROR_CODES,
} = require('./chatwootOutboundReceiptRepository');

const OUTBOUND_COMMAND_VERSION = 'CHATWOOT_OUTBOUND_V1';
const PROVIDER = 'CHATWOOT';
const CHANNEL = 'WEBSITE_CHAT';
const DEFAULT_MAX_CONTENT_CHARS = 4000;

const ERROR_CODE = Object.freeze({
  CONFIGURATION_BLOCKED: 'OUTBOUND_CONFIGURATION_BLOCKED',
  MAPPING_BLOCKED: 'OUTBOUND_MAPPING_BLOCKED',
  PAYLOAD_REJECTED: 'OUTBOUND_PAYLOAD_REJECTED',
  RETRYABLE_FAILED: 'OUTBOUND_RETRYABLE_FAILED',
  RECONCILIATION_REQUIRED: 'OUTBOUND_RECONCILIATION_REQUIRED',
  DISPATCH_IN_PROGRESS: 'OUTBOUND_DISPATCH_IN_PROGRESS',
  RECEIPT_CONFLICT: 'OUTBOUND_RECEIPT_CONFLICT',
});

const RETRYABLE_HTTP_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const FORBIDDEN_COMMAND_KEY_RE = /^(token|apitoken|accesstoken|api_access_token|apikey|secret|password|authorization|signature|webhooksecret|rawpayload|rawbody|payload|apiurl|apibaseurl|apiorigin|baseurl|origin|url|endpoint|ciphertext|plaintext|providerpayload)$/i;

class ChatwootOutboundError extends Error {
  constructor(code, options) {
    super(code);
    this.name = 'ChatwootOutboundError';
    this.code = code;
    const o = options || {};
    this.safeErrorCode = o.safeErrorCode || code;
    this.classification = o.classification || code;
    this.retryable = o.retryable === true;
    this.remoteMessageId = o.remoteMessageId || null;
    this.outboundCommandKey = o.outboundCommandKey || null;
    this.correlationId = o.correlationId || null;
    this.httpStatus = Number.isInteger(o.httpStatus) ? o.httpStatus : null;
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function safeError(code, options) {
  return new ChatwootOutboundError(code, options);
}

function throwSafe(code, options) {
  throw safeError(code, options);
}

function requiredString(value, safeErrorCode) {
  if (typeof value !== 'string' || value.trim().length === 0) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode });
  return value.trim();
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function assertNoForbiddenCommandKeys(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenCommandKeys(item);
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_COMMAND_KEY_RE.test(key)) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'OUTBOUND_COMMAND_FORBIDDEN_FIELD' });
    assertNoForbiddenCommandKeys(value[key]);
  }
}

function deriveOutboundCommandKey(input) {
  const i = input || {};
  const integrationId = typeof i.integrationId === 'string' ? i.integrationId.trim() : '';
  const businessIdempotencyKey = typeof i.businessIdempotencyKey === 'string' ? i.businessIdempotencyKey.trim() : '';
  if (!integrationId || !businessIdempotencyKey) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'OUTBOUND_COMMAND_KEY_INPUT_INVALID' });
  return sha256Hex([OUTBOUND_COMMAND_VERSION, integrationId, businessIdempotencyKey].join('|'));
}

function hashContent(content) {
  return sha256Hex(content);
}

function normalizeApiOrigin(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_ORIGIN_REQUIRED' });
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch (_e) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_ORIGIN_INVALID' });
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_ORIGIN_PROTOCOL_BLOCKED' });
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_ORIGIN_INVALID' });
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_ORIGIN_PATH_BLOCKED' });
  }
  return parsed.origin;
}

function normalizeCommand(command, maxContentChars) {
  const c = command || {};
  assertNoForbiddenCommandKeys(c);
  if (c.provider && c.provider !== PROVIDER) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'PROVIDER_UNSUPPORTED' });
  if (c.channel && c.channel !== CHANNEL) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'CHANNEL_UNSUPPORTED' });

  const integrationId = requiredString(c.integrationId, 'INTEGRATION_ID_REQUIRED');
  const tenantId = requiredString(c.tenantId, 'TENANT_ID_REQUIRED');
  const businessIdempotencyKey = requiredString(c.idempotencyKey, 'BUSINESS_IDEMPOTENCY_KEY_REQUIRED');
  const correlationId = optionalString(c.correlationId);

  let externalConversationRef;
  try {
    externalConversationRef = normalizeChatwootNumericId(c.externalConversationRef, 'conversations');
  } catch (_e) {
    throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'EXTERNAL_CONVERSATION_REF_INVALID', correlationId });
  }

  if (typeof c.content !== 'string' || c.content.trim().length === 0) {
    throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'CONTENT_REQUIRED', correlationId });
  }
  if (c.content.length > maxContentChars) {
    throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'CONTENT_TOO_LONG', correlationId });
  }

  return {
    integrationId,
    tenantId,
    externalConversationRef,
    content: c.content,
    businessIdempotencyKey,
    correlationId,
  };
}

function authorityIsResolved(authority) {
  return authority && authority.status === 'RESOLVED';
}

function requireResolvedAuthority(authority, command) {
  if (!authorityIsResolved(authority)) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, {
      safeErrorCode: authority && authority.status ? 'AUTHORITY_' + authority.status : 'AUTHORITY_NOT_FOUND',
      correlationId: command.correlationId,
    });
  }
  if (authority.provider && authority.provider !== PROVIDER) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'AUTHORITY_PROVIDER_UNSUPPORTED', correlationId: command.correlationId });
  }
  if (authority.integrationStatus === false || authority.integrationEnabled === false || authority.isEnabled === false) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'INTEGRATION_DISABLED', correlationId: command.correlationId });
  }
  if (authority.endpointStatus === false || authority.endpointEnabled === false) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'WEBHOOK_ENDPOINT_DISABLED', correlationId: command.correlationId });
  }
  if (authority.tenantActive === false) {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'TENANT_DISABLED', correlationId: command.correlationId });
  }
}

function receiptStateError(receipt, command) {
  const status = receipt && receipt.status;
  const base = {
    outboundCommandKey: receipt && receipt.outboundCommandKey ? receipt.outboundCommandKey : null,
    safeErrorCode: (receipt && receipt.safeErrorCode) || status || 'OUTBOUND_RECEIPT_STATE_BLOCKED',
    correlationId: command && command.correlationId,
  };
  if (status === RECEIPT_STATUS.DISPATCHING) throwSafe(ERROR_CODE.DISPATCH_IN_PROGRESS, base);
  if (status === RECEIPT_STATUS.UNKNOWN_OUTCOME || status === RECEIPT_STATUS.RECONCILIATION_REQUIRED) {
    throwSafe(ERROR_CODE.RECONCILIATION_REQUIRED, base);
  }
  if (status === RECEIPT_STATUS.CONFIGURATION_BLOCKED) throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, base);
  if (status === RECEIPT_STATUS.MAPPING_BLOCKED) throwSafe(ERROR_CODE.MAPPING_BLOCKED, base);
  if (status === RECEIPT_STATUS.PAYLOAD_REJECTED) throwSafe(ERROR_CODE.PAYLOAD_REJECTED, base);
  throwSafe(ERROR_CODE.RECEIPT_CONFLICT, base);
}

function existingReceiptAllowsClaim(receipt) {
  if (!receipt) return false;
  if (receipt.status === RECEIPT_STATUS.RESERVED) return true;
  if (receipt.status !== RECEIPT_STATUS.RETRYABLE_FAILED) return false;
  return DEFAULT_RETRYABLE_SAFE_ERROR_CODES.includes(receipt.safeErrorCode);
}

function duplicateSuccess(receipt, command) {
  return {
    result: 'SUCCEEDED',
    duplicate: true,
    outboundCommandKey: receipt.outboundCommandKey,
    remoteMessageId: receipt.remoteMessageId || null,
    correlationId: command.correlationId,
    transportInvoked: false,
  };
}

function httpSafeCode(status) {
  return 'HTTP_' + String(status);
}

function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return { classification: 'CONFIGURATION_BLOCKED', safeErrorCode: httpSafeCode(status) };
  if (status === 404) return { classification: 'MAPPING_BLOCKED', safeErrorCode: httpSafeCode(status) };
  if (status === 400 || status === 422) return { classification: 'PAYLOAD_REJECTED', safeErrorCode: httpSafeCode(status) };
  if (RETRYABLE_HTTP_STATUS.includes(status)) return { classification: 'RETRYABLE_FAILED', safeErrorCode: httpSafeCode(status), retryable: true };
  if (status === 409) return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: httpSafeCode(status) };
  return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: httpSafeCode(status) };
}

function getResponseBody(response) {
  if (!response || typeof response !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(response, 'body')) return response.body;
  if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data;
  if (Object.prototype.hasOwnProperty.call(response, 'json')) return response.json;
  return null;
}

function readBodyField(body, names) {
  if (!body || typeof body !== 'object') return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(body, name)) return body[name];
  }
  return undefined;
}

function extractRemoteMessageId(response) {
  const body = getResponseBody(response);
  let id = readBodyField(body, ['id']);
  if ((id === undefined || id === null) && body && body.message) id = readBodyField(body.message, ['id']);
  try {
    return normalizeChatwootNumericId(id, 'messages');
  } catch (_e) {
    return null;
  }
}

function extractRemoteConversationId(response) {
  const body = getResponseBody(response);
  let id = readBodyField(body, ['conversation_id', 'conversationId']);
  if ((id === undefined || id === null) && body && body.conversation) id = readBodyField(body.conversation, ['id']);
  if ((id === undefined || id === null) && body && body.message) id = readBodyField(body.message, ['conversation_id', 'conversationId']);
  if ((id === undefined || id === null) && body && body.message && body.message.conversation) id = readBodyField(body.message.conversation, ['id']);
  if (id === undefined || id === null) return null;
  try {
    return normalizeChatwootNumericId(id, 'conversations');
  } catch (_e) {
    return 'INVALID';
  }
}

function extractRemoteAccountId(response) {
  const body = getResponseBody(response);
  let id = readBodyField(body, ['account_id', 'accountId']);
  if ((id === undefined || id === null) && body && body.account) id = readBodyField(body.account, ['id']);
  if ((id === undefined || id === null) && body && body.message) id = readBodyField(body.message, ['account_id', 'accountId']);
  if (id === undefined || id === null) return null;
  try {
    return normalizeChatwootNumericId(id, 'accounts');
  } catch (_e) {
    return 'INVALID';
  }
}

function extractRemoteMessageType(response) {
  const body = getResponseBody(response);
  let value = readBodyField(body, ['message_type', 'messageType']);
  if (value === undefined && body && body.message) value = readBodyField(body.message, ['message_type', 'messageType']);
  return value;
}

function extractRemotePrivateFlag(response) {
  const body = getResponseBody(response);
  let value = readBodyField(body, ['private']);
  if (value === undefined && body && body.message) value = readBodyField(body.message, ['private']);
  return value;
}

function validateSuccessResponse(response, expected) {
  const rawStatus = response && (response.statusCode || response.status);
  const status = Number(rawStatus);
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'HTTP_SUCCESS_STATUS_INVALID' };
  }
  const body = getResponseBody(response);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_RESPONSE_INVALID' };
  }
  const remoteMessageId = extractRemoteMessageId(response);
  if (!remoteMessageId) return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_MESSAGE_ID_MISSING' };

  const exp = expected || {};
  const remoteConversationId = extractRemoteConversationId(response);
  if (remoteConversationId === 'INVALID') return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_CONVERSATION_ID_INVALID' };
  if (remoteConversationId && exp.conversationId && remoteConversationId !== exp.conversationId) {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_CONVERSATION_MISMATCH' };
  }

  const remoteAccountId = extractRemoteAccountId(response);
  if (remoteAccountId === 'INVALID') return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_ACCOUNT_ID_INVALID' };
  if (remoteAccountId && exp.accountId && remoteAccountId !== exp.accountId) {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_ACCOUNT_MISMATCH' };
  }

  const messageType = extractRemoteMessageType(response);
  if (messageType !== undefined && String(messageType) !== 'outgoing') {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_MESSAGE_TYPE_UNEXPECTED' };
  }

  const privateFlag = extractRemotePrivateFlag(response);
  if (privateFlag !== undefined && privateFlag !== false) {
    return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'REMOTE_PRIVATE_FLAG_UNEXPECTED' };
  }

  return { classification: 'SUCCEEDED', safeErrorCode: null, remoteMessageId };
}

function classifyTransportResult(result, expected) {
  if (result && typeof result === 'object') {
    const phase = result.phase || result.type || result.outcome;
    if (phase) {
      const p = String(phase);
      if (p === 'BEFORE_WRITE' || p === 'BEFORE_WRITE_FAILURE') return { classification: 'RETRYABLE_FAILED', safeErrorCode: 'BEFORE_WRITE_FAILURE', retryable: true };
      if (p === 'AFTER_WRITE' || p === 'AFTER_WRITE_FAILURE') return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'AFTER_WRITE_FAILURE' };
      if (p === 'UNKNOWN' || p === 'UNKNOWN_PHASE_FAILURE') return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'UNKNOWN_TRANSPORT_OUTCOME' };
    }
  }

  const rawStatus = result && (result.statusCode || result.status);
  const status = Number(rawStatus);
  if (!Number.isInteger(status)) return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'TRANSPORT_RESPONSE_INVALID' };

  if (status >= 200 && status < 300) return validateSuccessResponse(result, expected);
  return classifyHttpStatus(status);
}

function classifyTransportError(err) {
  const phase = err && err.phase ? String(err.phase) : '';
  if (phase === 'BEFORE_WRITE') return { classification: 'RETRYABLE_FAILED', safeErrorCode: 'BEFORE_WRITE_FAILURE', retryable: true };
  if (phase === 'AFTER_WRITE') return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'AFTER_WRITE_FAILURE' };
  const status = Number(err && (err.statusCode || err.status));
  if (Number.isInteger(status)) return classifyHttpStatus(status);
  return { classification: 'UNKNOWN_OUTCOME', safeErrorCode: 'UNKNOWN_TRANSPORT_OUTCOME' };
}

function mapClassificationToError(classification) {
  if (classification === 'CONFIGURATION_BLOCKED') return ERROR_CODE.CONFIGURATION_BLOCKED;
  if (classification === 'MAPPING_BLOCKED') return ERROR_CODE.MAPPING_BLOCKED;
  if (classification === 'PAYLOAD_REJECTED') return ERROR_CODE.PAYLOAD_REJECTED;
  if (classification === 'RETRYABLE_FAILED') return ERROR_CODE.RETRYABLE_FAILED;
  return ERROR_CODE.RECONCILIATION_REQUIRED;
}

async function persistClassification(receiptRepository, outboundCommandKey, outcome) {
  if (outcome.classification === 'SUCCEEDED') {
    await receiptRepository.markSucceeded({ outboundCommandKey, remoteMessageId: outcome.remoteMessageId });
    return;
  }
  if (outcome.classification === 'CONFIGURATION_BLOCKED') {
    await receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode: outcome.safeErrorCode });
    return;
  }
  if (outcome.classification === 'MAPPING_BLOCKED') {
    await receiptRepository.markMappingBlocked({ outboundCommandKey, safeErrorCode: outcome.safeErrorCode });
    return;
  }
  if (outcome.classification === 'PAYLOAD_REJECTED') {
    await receiptRepository.markPayloadRejected({ outboundCommandKey, safeErrorCode: outcome.safeErrorCode });
    return;
  }
  if (outcome.classification === 'RETRYABLE_FAILED') {
    await receiptRepository.markRetryableFailed({ outboundCommandKey, safeErrorCode: outcome.safeErrorCode });
    return;
  }
  await receiptRepository.markUnknownOutcome({ outboundCommandKey, safeErrorCode: outcome.safeErrorCode || 'UNKNOWN_OUTCOME' });
}

function assertPort(name, port, method) {
  if (!port || typeof port[method] !== 'function') {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: name + '_REQUIRED' });
  }
}

async function resolveCredential(deps, authority, command, outboundCommandKey) {
  const credential = await deps.credentialRepository.findActiveApiTokenCredential(authority.webhookEndpointId);
  if (!credential) {
    await deps.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode: 'CHATWOOT_API_TOKEN_MISSING' });
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_TOKEN_MISSING', outboundCommandKey, correlationId: command.correlationId });
  }
  if (credential.credentialType !== 'CHATWOOT_API_TOKEN') {
    await deps.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode: 'CHATWOOT_API_TOKEN_TYPE_INVALID' });
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_TOKEN_TYPE_INVALID', outboundCommandKey, correlationId: command.correlationId });
  }
  if (credential.status !== 'ACTIVE') {
    const safeErrorCode = 'CHATWOOT_API_TOKEN_' + String(credential.status || 'INACTIVE');
    await deps.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode });
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode, outboundCommandKey, correlationId: command.correlationId });
  }
  try {
    const token = deps.credentialDecryptor.decrypt(credential);
    if (typeof token !== 'string' || token.trim().length === 0) throw new Error('EMPTY_TOKEN');
    return token;
  } catch (_e) {
    await deps.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode: 'CHATWOOT_API_TOKEN_DECRYPT_FAILED' });
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_API_TOKEN_DECRYPT_FAILED', outboundCommandKey, correlationId: command.correlationId });
  }
}

function createChatwootOutboundAdapter(dependencies) {
  const d = dependencies || {};
  assertPort('AUTHORITY_RESOLVER', d.authorityResolver, 'resolveOutboundAuthorityByIntegrationId');
  assertPort('CREDENTIAL_REPOSITORY', d.credentialRepository, 'findActiveApiTokenCredential');
  assertPort('CREDENTIAL_DECRYPTOR', d.credentialDecryptor, 'decrypt');
  assertPort('RECEIPT_REPOSITORY', d.receiptRepository, 'reserve');
  assertPort('RECEIPT_REPOSITORY', d.receiptRepository, 'claimDispatch');
  assertPort('TRANSPORT', d.transport, 'send');
  if (!d.originPolicy || typeof d.originPolicy.assertAllowed !== 'function') {
    throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'ORIGIN_POLICY_REQUIRED' });
  }

  const maxContentChars = Number.isInteger(d.maxContentChars) && d.maxContentChars > 0 ? d.maxContentChars : DEFAULT_MAX_CONTENT_CHARS;

  async function send(rawCommand) {
    const command = normalizeCommand(rawCommand, maxContentChars);
    const authority = await d.authorityResolver.resolveOutboundAuthorityByIntegrationId(command.integrationId);
    requireResolvedAuthority(authority, command);

    const outboundCommandKey = deriveOutboundCommandKey({
      integrationId: command.integrationId,
      businessIdempotencyKey: command.businessIdempotencyKey,
    });
    const tenantIntegrationId = authority.tenantIntegrationId || authority.integrationId;
    const contentHash = hashContent(command.content);
    const reserveResult = await d.receiptRepository.reserve({
      tenantIntegrationId,
      outboundCommandKey,
      businessIdempotencyKey: command.businessIdempotencyKey,
      externalConversationRef: command.externalConversationRef,
      contentHash,
    });
    const reservedReceipt = reserveResult && reserveResult.receipt;
    if (reserveResult && reserveResult.result === RESERVE_RESULT.CONFLICT) {
      throwSafe(ERROR_CODE.RECEIPT_CONFLICT, { safeErrorCode: 'OUTBOUND_RESERVE_CONFLICT', outboundCommandKey, correlationId: command.correlationId });
    }
    if (reserveResult && reserveResult.result === RESERVE_RESULT.DUPLICATE) {
      if (reservedReceipt && (reservedReceipt.tenantIntegrationId !== tenantIntegrationId
        || reservedReceipt.businessIdempotencyKey !== command.businessIdempotencyKey
        || reservedReceipt.externalConversationRef !== command.externalConversationRef
        || reservedReceipt.contentHash !== contentHash)) {
        throwSafe(ERROR_CODE.PAYLOAD_REJECTED, { safeErrorCode: 'OUTBOUND_COMMAND_REPLAY_MISMATCH', outboundCommandKey, correlationId: command.correlationId });
      }
      if (reservedReceipt && reservedReceipt.status === RECEIPT_STATUS.SUCCEEDED) return duplicateSuccess(reservedReceipt, command);
      if (!existingReceiptAllowsClaim(reservedReceipt)) receiptStateError(reservedReceipt, command);
    }

    let accountId;
    if (authority.tenantId !== command.tenantId) {
      await d.receiptRepository.markMappingBlocked({ outboundCommandKey, safeErrorCode: 'TENANT_MISMATCH' });
      throwSafe(ERROR_CODE.MAPPING_BLOCKED, { safeErrorCode: 'TENANT_MISMATCH', outboundCommandKey, correlationId: command.correlationId });
    }
    try {
      accountId = normalizeChatwootNumericId(authority.externalAccountId, 'accounts');
    } catch (_e) {
      await d.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode: 'CHATWOOT_ACCOUNT_ID_INVALID' });
      throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode: 'CHATWOOT_ACCOUNT_ID_INVALID', outboundCommandKey, correlationId: command.correlationId });
    }

    let apiOrigin;
    try {
      apiOrigin = normalizeApiOrigin(authority.apiBaseUrl);
      await d.originPolicy.assertAllowed({
        apiOrigin,
        integrationId: command.integrationId,
        tenantId: command.tenantId,
        webhookEndpointId: authority.webhookEndpointId,
      });
    } catch (err) {
      const safeErrorCode = err && err.safeErrorCode ? err.safeErrorCode : err && err.code ? err.code : 'CHATWOOT_API_ORIGIN_BLOCKED';
      await d.receiptRepository.markConfigurationBlocked({ outboundCommandKey, safeErrorCode });
      throwSafe(ERROR_CODE.CONFIGURATION_BLOCKED, { safeErrorCode, outboundCommandKey, correlationId: command.correlationId });
    }

    let token = null;
    try {
      const claim = await d.receiptRepository.claimDispatch({
        outboundCommandKey,
        retryableSafeErrorCodes: DEFAULT_RETRYABLE_SAFE_ERROR_CODES,
      });
      if (!claim || claim.result !== CLAIM_RESULT.CLAIMED) {
        if (claim && claim.receipt && claim.receipt.status === RECEIPT_STATUS.SUCCEEDED) return duplicateSuccess(claim.receipt, command);
        receiptStateError(claim && claim.receipt, command);
      }

      token = await resolveCredential(d, authority, command, outboundCommandKey);

      const request = {
        method: 'POST',
        apiOrigin,
        path: '/api/v1/accounts/' + accountId + '/conversations/' + command.externalConversationRef + '/messages',
        headers: { 'Content-Type': 'application/json', api_access_token: token },
        body: {
          content: command.content,
          message_type: 'outgoing',
          private: false,
          content_type: 'text',
          content_attributes: {},
        },
      };

      let outcome;
      try {
        const transportResult = await d.transport.send(request);
        outcome = classifyTransportResult(transportResult, { accountId, conversationId: command.externalConversationRef });
      } catch (err) {
        outcome = classifyTransportError(err);
      }

      await persistClassification(d.receiptRepository, outboundCommandKey, outcome);
      if (outcome.classification === 'SUCCEEDED') {
        return {
          result: 'SUCCEEDED',
          duplicate: false,
          outboundCommandKey,
          remoteMessageId: outcome.remoteMessageId,
          correlationId: command.correlationId,
          transportInvoked: true,
        };
      }
      throwSafe(mapClassificationToError(outcome.classification), {
        safeErrorCode: outcome.safeErrorCode,
        classification: outcome.classification,
        retryable: outcome.retryable === true,
        outboundCommandKey,
        correlationId: command.correlationId,
      });
    } finally {
      token = null;
    }
  }

  return { send };
}

module.exports = {
  createChatwootOutboundAdapter,
  normalizeApiOrigin,
  deriveOutboundCommandKey,
  hashContent,
  classifyTransportResult,
  classifyTransportError,
  validateSuccessResponse,
  ChatwootOutboundError,
  ERROR_CODE,
  OUTBOUND_COMMAND_VERSION,
};
