'use strict';

// OMNI-CHANNEL-OFFLINE-E2E-DESIGN-01 — Deterministic, sanitized fixtures.
//
// Pure and injectable: all non-determinism (clock, id factory, hash) is injected.
// This module never touches PrismaClient, DATABASE_URL, an environment variable,
// the network, the filesystem, or runtime source under ../src.
//
// IMPORTANT LABELS:
//   - Facebook fixtures are SANITIZED shapes compatible with the existing runtime
//     field names, but they do NOT prove the Facebook runtime is canonicalized.
//   - Chatwoot fixtures are CHATWOOT_CONCEPTUAL_NORMALIZED_EVENT /
//     NOT_OFFICIAL_RAW_WEBHOOK_CONTRACT (UNVERIFIED_PROVIDER_SHAPE). They are NOT
//     an official Chatwoot webhook payload.

const SANITIZED_DEPLOYMENT = 'sanitized.invalid';

// Deterministic id factory: stable, sequence-based, no randomUUID / Math.random.
function createSequentialIdFactory(prefix) {
  let n = 0;
  return function nextId(tag) {
    n += 1;
    return (prefix || 'id') + '-' + (tag || 'x') + '-' + String(n).padStart(4, '0');
  };
}

// Deterministic clock: fixed base + monotonic step, no Date.now().
function createFixedClock(baseIsoMs, stepMs) {
  let t = Number.isFinite(baseIsoMs) ? baseIsoMs : Date.parse('2026-01-01T00:00:00.000Z');
  const step = Number.isFinite(stepMs) ? stepMs : 1000;
  return function now() {
    const iso = new Date(t).toISOString();
    t += step;
    return iso;
  };
}

function createOfflineFixtures(deps) {
  const d = deps || {};
  const clock = d.clock || createFixedClock();
  const idFactory = d.idFactory || createSequentialIdFactory('fx');
  // hashFunction is threaded through to the reference model when needed.
  const hashFunction = d.hashFunction || null;

  // ---- Integration fixtures (contract §13b / §23) ----------------------------
  const tenantA = { id: 'tenant-A-0001', slug: 'sanitized-tenant-a', isActive: true };
  const tenantB = { id: 'tenant-B-0002', slug: 'sanitized-tenant-b', isActive: true };
  const tenantDisabled = { id: 'tenant-D-0003', slug: 'sanitized-tenant-d', isActive: false };

  // Integration A — enabled, Chatwoot self-hosted sanitized account 1 / inbox 1.
  const integrationA = {
    id: 'integration-A-0001',
    tenantId: tenantA.id,
    provider: 'chatwoot',
    channel: 'website_chat',
    deploymentKey: SANITIZED_DEPLOYMENT,
    externalAccountId: '1',
    externalInboxId: '1',
    displayName: 'sanitized-inbox-a',
    isEnabled: true,
    configVersion: 1,
  };

  // Integration B — DISABLED, distinct inbox 2.
  const integrationB = {
    id: 'integration-B-0002',
    tenantId: tenantB.id,
    provider: 'chatwoot',
    channel: 'website_chat',
    deploymentKey: SANITIZED_DEPLOYMENT,
    externalAccountId: '1',
    externalInboxId: '2',
    displayName: 'sanitized-inbox-b',
    isEnabled: false,
    configVersion: 1,
  };

  // Distinct enabled integration (inbox 3) to prove idempotency does not collide
  // across integrations for the same provider event id.
  const integrationDistinct = {
    id: 'integration-C-0003',
    tenantId: tenantB.id,
    provider: 'chatwoot',
    channel: 'website_chat',
    deploymentKey: SANITIZED_DEPLOYMENT,
    externalAccountId: '1',
    externalInboxId: '3',
    displayName: 'sanitized-inbox-c',
    isEnabled: true,
    configVersion: 1,
  };

  // Facebook integration binding (page → tenant). Sanitized.
  const integrationFacebook = {
    id: 'integration-FB-0004',
    tenantId: tenantA.id,
    provider: 'facebook',
    channel: 'facebook',
    deploymentKey: 'graph.facebook.com',
    externalAccountId: '1',       // sanitized app/account placeholder
    externalInboxId: '900001',    // sanitized page id acting as inbox identity
    displayName: 'sanitized-fb-page',
    isEnabled: true,
    configVersion: 1,
  };

  // Ambiguous negative fixture: SAME external identity as integrationA but a
  // different tenant. A correct global identity store MUST reject this.
  const integrationAmbiguous = {
    id: 'integration-AMB-0005',
    tenantId: tenantB.id, // different tenant, same (provider,deployment,account,inbox) as A
    provider: 'chatwoot',
    channel: 'website_chat',
    deploymentKey: SANITIZED_DEPLOYMENT,
    externalAccountId: '1',
    externalInboxId: '1',
    displayName: 'sanitized-inbox-ambiguous',
    isEnabled: true,
    configVersion: 1,
  };

  // Fake credential metadata — NEVER a real secret. Presence-only.
  const fakeCredentialMeta = Object.freeze({
    integrationId: integrationA.id,
    credentialType: 'webhook_secret',
    credentialPresent: true,
    credentialStatus: 'active',
    keyVersion: 1,
    algorithmVersion: 1,
    // deliberately NO secret value here
  });

  // ---- Provider event fixtures ----------------------------------------------
  // Facebook SANITIZED event (field names compatible with existing handler.js).
  function facebookInboundEvent(overrides) {
    return Object.assign({
      __label: 'FACEBOOK_SANITIZED_EVENT',
      provider: 'facebook',
      channel: 'facebook',
      verificationState: 'VERIFIED', // modeled: HMAC verified at the FB edge
      deploymentKey: 'graph.facebook.com',
      externalAccountId: '1',
      externalInboxId: '900001', // page id
      externalConversationRef: 'fb-psid-0001',
      externalMessageRef: 'mid.sanitized-0001',
      providerEventRef: 'fb-evt-0001',
      eventType: 'message',
      direction: 'inbound',
      messageType: 'text',
      senderRef: 'fb-psid-0001',
      senderRole: 'customer',
      text: '[sanitized-fixture-text]',
      providerTimestamp: clock(),
    }, overrides || {});
  }

  // Chatwoot CONCEPTUAL normalized event — NOT an official webhook payload.
  function chatwootConceptualEvent(overrides) {
    return Object.assign({
      __label: 'CHATWOOT_CONCEPTUAL_NORMALIZED_EVENT',
      __contract: 'NOT_OFFICIAL_RAW_WEBHOOK_CONTRACT',
      __shape: 'UNVERIFIED_PROVIDER_SHAPE',
      provider: 'chatwoot',
      channel: 'website_chat',
      verificationState: 'VERIFIED', // modeled ONLY; real verifier is unverified
      deploymentKey: SANITIZED_DEPLOYMENT,
      externalAccountId: '1',
      externalInboxId: '1',
      externalConversationRef: 'cw-conv-0001',
      externalMessageRef: 'cw-msg-0001',
      providerEventRef: 'cw-evt-0001',
      eventType: 'message_created',
      direction: 'inbound',
      messageType: 'text',
      senderRef: 'cw-contact-0001',
      senderRole: 'customer',
      text: '[sanitized-fixture-text]',
      providerTimestamp: clock(),
    }, overrides || {});
  }

  // ---- Security fixtures (prompt §XVII group 4) ------------------------------
  const security = {
    // Fake secret-like keys used to test canonical rejection (NOT real secrets).
    secretLikeEnvelopeInput: {
      apiToken: 'FAKE-NOT-A-REAL-SECRET',
      accessToken: 'FAKE-NOT-A-REAL-SECRET',
    },
    // Provider tries to inject its own tenant authority.
    providerTenantInjection: { providerTenantId: 'tenant-EVIL-9999' },
    validInboxUrl: 'https://' + SANITIZED_DEPLOYMENT + '/app/accounts/1/settings/inboxes/1',
    invalidTrailingNumberUrl: 'https://' + SANITIZED_DEPLOYMENT + '/random/looking/path/42',
    teamUrlAsInbox: 'https://' + SANITIZED_DEPLOYMENT + '/app/accounts/1/settings/teams/1/edit',
    duplicateEvent: chatwootConceptualEvent({ providerEventRef: 'cw-evt-DUP', externalMessageRef: 'cw-msg-DUP' }),
    missingEventIdentity: chatwootConceptualEvent({ providerEventRef: undefined, externalMessageRef: undefined }),
    botCallback: chatwootConceptualEvent({ senderRole: 'bot', providerEventRef: 'cw-evt-BOT', externalMessageRef: 'cw-msg-BOT' }),
    outboundCallback: chatwootConceptualEvent({ direction: 'outbound', senderRole: 'bot', providerEventRef: 'cw-evt-OUT', externalMessageRef: 'cw-msg-OUT' }),
    humanActiveConversation: chatwootConceptualEvent({ handoffState: 'HUMAN_ACTIVE', providerEventRef: 'cw-evt-HUM', externalMessageRef: 'cw-msg-HUM' }),
    unknownProviderEvent: { provider: 'telegram_unofficial', channel: 'unknown', verificationState: 'VERIFIED', direction: 'inbound', eventType: 'message', senderRole: 'customer' },
    providerOutage: { provider: 'chatwoot', simulateOutage: true },
  };

  return {
    meta: Object.freeze({ deployment: SANITIZED_DEPLOYMENT, note: 'ALL_IDS_SANITIZED_DETERMINISTIC' }),
    clock,
    idFactory,
    hashFunction,
    tenants: { tenantA, tenantB, tenantDisabled },
    integrations: { integrationA, integrationB, integrationDistinct, integrationFacebook, integrationAmbiguous },
    credentials: { fakeCredentialMeta },
    events: { facebookInboundEvent, chatwootConceptualEvent },
    security,
  };
}

module.exports = {
  createOfflineFixtures,
  createSequentialIdFactory,
  createFixedClock,
  SANITIZED_DEPLOYMENT,
};
