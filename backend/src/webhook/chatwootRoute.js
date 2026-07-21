'use strict';

// CHATWOOT-ACCOUNT-WEBHOOK-RUNTIME-SCHEMA-DESIGN-01
// Thin Express adapter + runtime composition for the account webhook ingress.
//
// Boundaries:
//   - This is the feature-flag + config boundary. When WEBSITE_CHAT_ENABLED is not
//     'true' the route returns 404 WEBSITE_CHAT_DISABLED BEFORE any DB/credential/
//     parse/AI/outbound work — the production handler (and Prisma) is never built.
//   - Prisma + credentialCrypto are required LAZILY, only on the first enabled
//     request, so importing app.js stays side-effect free.
//   - The endpointKey is treated as opaque; it is never logged in full.

const { createChatwootIngressHandler, INGRESS_STATUS, maskKey } = require('./chatwootIngress');
const repos = require('./chatwootRuntimeRepositories');
const { createWebhookEventReceiptRepository } = require('./webhookEventReceiptRepository');

let cachedHandler = null;

function resetProductionHandlerCache() { cachedHandler = null; }

// Build a fully-wired ingress handler from a Prisma-like client + crypto service.
// Exposed for deterministic tests (inject a fake client / crypto / ports).
function buildIngressHandler(wiring) {
  const w = wiring || {};
  const client = w.client;
  const config = w.config || {};
  const cryptoService = w.cryptoService;
  const endpointRepository = w.endpointRepository || repos.createWebhookEndpointRepository({ client });
  const credentialRepository = w.credentialRepository || repos.createIntegrationCredentialRepository({ client });
  const credentialDecryptor = w.credentialDecryptor || repos.createCredentialDecryptor({ cryptoService });
  const integrationResolver = w.integrationResolver || repos.createIntegrationIdentityResolver({ client });
  const replayStore = w.replayStore || repos.createWebhookDeliveryReplayStore({ client, retentionSeconds: config.replayRetentionSeconds });
  const businessEventStore = w.businessEventStore || createWebhookEventReceiptRepository({ client });
  return createChatwootIngressHandler({
    config,
    endpointRepository,
    credentialRepository,
    credentialDecryptor,
    replayStore,
    integrationResolver,
    businessEventStore,
    handoffPolicy: w.handoffPolicy,
    canonicalMessageProcessor: w.canonicalMessageProcessor,
    outboundCommandPort: w.outboundCommandPort,
    auditWriter: w.auditWriter,
    clock: w.clock,
  });
}

// Lazy production wiring — real Prisma + AES-256-GCM credential crypto. Built only
// when the flag is on. In this DESIGN phase the AI processor + outbound adapter are
// deferred ports; without them the handler reports runtime config invalid (503),
// never a silent no-AI fallback that looks successful.
function getProductionHandler(config) {
  if (cachedHandler) return cachedHandler;
  const getPrisma = require('../db');
  const client = getPrisma();
  const credentialCrypto = require('../infrastructure/services/credentialCrypto');
  cachedHandler = buildIngressHandler({
    client,
    config,
    cryptoService: { decrypt: (ciphertext) => credentialCrypto.decrypt(ciphertext) },
    // canonicalMessageProcessor + outboundCommandPort are intentionally undefined
    // here → isRuntimeConfigComplete() is false → 503 until a later wiring phase.
  });
  return cachedHandler;
}

// Express handler registered by app.js.
async function chatwootWebsiteChatRoute(req, res) {
  const config = repos.loadChatwootRuntimeConfig();

  // Step 0: feature flag. Disabled → 404, ZERO DB / credential / parse / AI / outbound.
  if (!config.enabled) {
    return res.status(404).json({ status: INGRESS_STATUS.DISABLED, error: INGRESS_STATUS.DISABLED });
  }

  let handler;
  try {
    handler = getProductionHandler(config);
  } catch (_e) {
    return res.status(503).json({ status: INGRESS_STATUS.RUNTIME_CONFIG_INVALID, error: INGRESS_STATUS.RUNTIME_CONFIG_INVALID });
  }

  let result;
  try {
    result = await handler.handle({
      endpointKey: req.params && req.params.endpointKey,
      headers: req.headers,
      rawBody: req.rawBody,
    });
  } catch (_e) {
    return res.status(503).json({ status: INGRESS_STATUS.RUNTIME_UNAVAILABLE, error: INGRESS_STATUS.RUNTIME_UNAVAILABLE });
  }

  const body = { status: result.status };
  if (result.safeErrorCode) body.error = result.safeErrorCode;
  // maskKey is available for safe audit logging; the full key is never emitted.
  void maskKey;
  return res.status(result.httpStatus).json(body);
}

module.exports = {
  chatwootWebsiteChatRoute,
  buildIngressHandler,
  getProductionHandler,
  resetProductionHandlerCache,
};
