'use strict';

// CHATWOOT-ACCOUNT-WEBHOOK-RUNTIME-SCHEMA-DESIGN-01
// Prisma-backed repository ports for the Chatwoot account webhook ingress.
//
// Boundaries:
//   - Each factory takes a Prisma-like `client` via DI; NONE instantiates Prisma
//     and NONE reads process.env at module load. The only env read lives in
//     loadChatwootRuntimeConfig(), the explicit CONFIG BOUNDARY.
//   - Ports return SAFE context only (ids, refs, non-secret metadata). Plaintext
//     credentials never appear in a returned object, log, or error.
//   - Transport replay (WebhookDeliveryReceipt) is DB-durable and distinct from
//     business idempotency (WebhookEventReceipt, reused elsewhere).

const crypto = require('node:crypto');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function isUniqueViolation(err) {
  return Boolean(err) && (err.code === 'P2002' || (typeof err.message === 'string' && /unique constraint/i.test(err.message)));
}

// Global identity key: hashing prevents an external inbox from being smuggled into
// two enabled integrations (the UNIQUE index on this key enforces at-most-one).
function computeNormalizedIdentityKey(parts) {
  const p = parts || {};
  return sha256Hex([
    'CHATWOOT',
    String(p.deploymentKey || ''),
    String(p.externalAccountId || ''),
    String(p.externalInboxId || ''),
  ].join('|'));
}

// ---- Endpoint repository ------------------------------------------------------
function createWebhookEndpointRepository(deps) {
  const client = deps && deps.client;
  if (!client || !client.providerWebhookEndpoint) {
    const e = new Error('CHATWOOT_ENDPOINT_CLIENT_REQUIRED'); e.code = 'CHATWOOT_ENDPOINT_CLIENT_REQUIRED'; throw e;
  }
  const table = client.providerWebhookEndpoint;
  return {
    async findEnabledByPublicEndpointKey(publicEndpointKey) {
      const row = await table.findUnique({ where: { publicEndpointKey } });
      if (!row || row.isEnabled !== true) return null;
      // Return only safe endpoint context (no credential material).
      return {
        id: row.id,
        provider: row.provider,
        channel: row.channel,
        mechanism: row.mechanism,
        deploymentKey: row.deploymentKey,
        externalAccountId: row.externalAccountId,
        minimumSupportedVersion: row.minimumSupportedVersion,
        exactVersion: row.exactVersion,
        authMode: row.authMode,
        isEnabled: row.isEnabled,
        configVersion: row.configVersion,
      };
    },
  };
}

// ---- Credential repository ----------------------------------------------------
function createIntegrationCredentialRepository(deps) {
  const client = deps && deps.client;
  if (!client || !client.integrationCredential) {
    const e = new Error('CHATWOOT_CREDENTIAL_CLIENT_REQUIRED'); e.code = 'CHATWOOT_CREDENTIAL_CLIENT_REQUIRED'; throw e;
  }
  const table = client.integrationCredential;
  return {
    async getActiveSigningCredential(webhookEndpointId) {
      const row = await table.findUnique({
        where: { webhookEndpointId_credentialType: { webhookEndpointId, credentialType: 'WEBHOOK_SIGNING_SECRET' } },
      });
      if (!row) return null;
      return {
        id: row.id,
        webhookEndpointId: row.webhookEndpointId,
        credentialType: row.credentialType,
        ciphertext: row.ciphertext,
        keyVersion: row.keyVersion,
        algorithmVersion: row.algorithmVersion,
        status: row.status,
      };
    },
  };
}

// ---- Credential decryptor (wraps the existing AES-256-GCM credentialCrypto) ----
// The decryptor validates key/algorithm version and returns plaintext to the
// caller's LOCAL scope only. It never logs or stores plaintext.
function createCredentialDecryptor(deps) {
  const d = deps || {};
  const cryptoService = d.cryptoService; // { decrypt(ciphertext) }
  const supportedAlgorithms = d.supportedAlgorithms || ['aes-256-gcm'];
  const supportedKeyVersions = d.supportedKeyVersions || null; // null → accept any
  if (!cryptoService || typeof cryptoService.decrypt !== 'function') {
    const e = new Error('CHATWOOT_CRYPTO_SERVICE_REQUIRED'); e.code = 'CHATWOOT_CRYPTO_SERVICE_REQUIRED'; throw e;
  }
  return {
    decrypt(credential) {
      const c = credential || {};
      if (!supportedAlgorithms.includes(c.algorithmVersion)) {
        const e = new Error('CHATWOOT_CREDENTIAL_ALGORITHM_UNSUPPORTED'); e.code = 'CHATWOOT_CREDENTIAL_ALGORITHM_UNSUPPORTED'; throw e;
      }
      if (supportedKeyVersions && !supportedKeyVersions.includes(c.keyVersion)) {
        const e = new Error('CHATWOOT_CREDENTIAL_KEY_VERSION_UNSUPPORTED'); e.code = 'CHATWOOT_CREDENTIAL_KEY_VERSION_UNSUPPORTED'; throw e;
      }
      // Any decrypt/auth-tag failure throws here and is caught by the ingress core
      // as CHATWOOT_CREDENTIAL_UNAVAILABLE — the raw error never leaves this scope.
      return cryptoService.decrypt(c.ciphertext);
    },
  };
}

// ---- Integration identity resolver -------------------------------------------
// resolveExactlyOneEnabledIntegration → RESOLVED | NOT_FOUND | DISABLED |
// AMBIGUOUS | TENANT_DISABLED. NO fallback tenant is ever returned.
function createIntegrationIdentityResolver(deps) {
  const client = deps && deps.client;
  if (!client || !client.integrationIdentity) {
    const e = new Error('CHATWOOT_IDENTITY_CLIENT_REQUIRED'); e.code = 'CHATWOOT_IDENTITY_CLIENT_REQUIRED'; throw e;
  }
  const identityTable = client.integrationIdentity;
  return {
    async resolveExactlyOneEnabledIntegration(query) {
      const q = query || {};
      const normalizedIdentityKey = computeNormalizedIdentityKey({
        deploymentKey: q.deploymentKey,
        externalAccountId: q.externalAccountId,
        externalInboxId: q.externalInboxId,
      });
      // findMany (not findUnique) so a defensive AMBIGUOUS is possible even though
      // the UNIQUE index should guarantee at most one row.
      const rows = await identityTable.findMany({
        where: { normalizedIdentityKey },
        include: { tenantIntegration: { include: { tenant: true } } },
      });
      if (!rows || rows.length === 0) return { status: 'NOT_FOUND' };
      if (rows.length > 1) return { status: 'AMBIGUOUS' };
      const identity = rows[0];
      const integration = identity.tenantIntegration;
      if (!integration || integration.webhookEndpointId !== q.endpointId) return { status: 'NOT_FOUND' };
      if (integration.isEnabled !== true) return { status: 'DISABLED' };
      const tenant = integration.tenant;
      if (!tenant || tenant.isActive !== true) return { status: 'TENANT_DISABLED' };
      return {
        status: 'RESOLVED',
        tenantId: tenant.id,
        integrationId: integration.id,
        processingMode: integration.processingMode,
        handoffPolicy: integration.handoffPolicy,
        tenantActive: tenant.isActive === true,
      };
    },
  };
}

// ---- Durable transport replay store (WebhookDeliveryReceipt) -------------------
// reserveTransport → 'RESERVED_NEW' | 'DUPLICATE'; a raw DB error is thrown so the
// ingress core answers 503 (retryable). The raw delivery header is NEVER stored —
// only its hash.
function createWebhookDeliveryReplayStore(deps) {
  const d = deps || {};
  const client = d.client;
  const retentionSeconds = typeof d.retentionSeconds === 'number' && d.retentionSeconds > 0 ? d.retentionSeconds : null;
  if (!client || !client.webhookDeliveryReceipt) {
    const e = new Error('CHATWOOT_REPLAY_CLIENT_REQUIRED'); e.code = 'CHATWOOT_REPLAY_CLIENT_REQUIRED'; throw e;
  }
  const table = client.webhookDeliveryReceipt;
  return {
    async reserveTransport(params) {
      const p = params || {};
      const deliveryRefHash = sha256Hex(p.deliveryRef);
      const timestamp = typeof p.timestamp === 'number' ? p.timestamp : null;
      const expiresAt = retentionSeconds && timestamp ? new Date((timestamp + retentionSeconds) * 1000) : null;
      try {
        await table.create({
          data: { webhookEndpointId: p.endpointId, deliveryRefHash, timestamp, expiresAt },
        });
        return 'RESERVED_NEW';
      } catch (err) {
        if (isUniqueViolation(err)) return 'DUPLICATE';
        throw err; // real DB failure → caller returns retryable 503
      }
    },
  };
}

// ---- Config boundary (the ONLY env read) --------------------------------------
function loadChatwootRuntimeConfig(env) {
  const e = env || process.env;
  const enabled = String(e.WEBSITE_CHAT_ENABLED || '').trim().toLowerCase() === 'true';
  const skew = Number(e.WEBSITE_CHAT_MAX_CLOCK_SKEW_SECONDS);
  const retention = Number(e.WEBSITE_CHAT_REPLAY_RETENTION_SECONDS);
  return {
    enabled,
    maxClockSkewSeconds: Number.isFinite(skew) && skew >= 0 ? skew : undefined,
    replayRetentionSeconds: Number.isFinite(retention) && retention > 0 ? retention : null,
  };
}

module.exports = {
  sha256Hex,
  isUniqueViolation,
  computeNormalizedIdentityKey,
  createWebhookEndpointRepository,
  createIntegrationCredentialRepository,
  createCredentialDecryptor,
  createIntegrationIdentityResolver,
  createWebhookDeliveryReplayStore,
  loadChatwootRuntimeConfig,
};
