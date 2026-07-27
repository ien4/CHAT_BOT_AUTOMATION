'use strict';

const REQUIRED_FLAG = '--allow-sanitized-diagnostic';
const DEFAULT_TENANT_SLUG = 'bbotech';
const GUARD_CODE = 'SANITIZED_DIAGNOSTIC_REQUIRES_EXPLICIT_FLAG';
const SCRIPT_NAME = 'check_tenant_config.js';

const FORBIDDEN_FIELD_POLICY = Object.freeze([
  'chatwootApiTokenEnc',
  'webhookSecretEnc',
  'token',
  'secret',
  'password',
  'ciphertext',
]);

const SAFE_VALUES = Object.freeze({
  providers: ['CHATWOOT', 'FACEBOOK'],
  channels: ['WEBSITE_CHAT', 'MESSENGER', 'FACEBOOK'],
  processingModes: ['AUTO_BOT', 'MANUAL', 'DISABLED'],
  handoffPolicies: ['BOT_FIRST', 'HUMAN_FIRST', 'NO_HANDOFF'],
  mechanisms: ['ACCOUNT_INTEGRATION_WEBHOOK', 'API_CHANNEL_WEBHOOK', 'AGENT_BOT_OUTGOING_URL'],
  authModes: ['HMAC_SIGNED_WEBHOOK', 'OTHER_VERIFIED_MODE'],
  credentialStatuses: ['ACTIVE', 'ROTATION_REQUIRED', 'REVOKED', 'INACTIVE', 'EXPIRED'],
});

function boundedCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 9999) return '9999+';
  return Math.floor(n);
}

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}

function safeEnum(value, allowed) {
  if (!hasValue(value)) return 'UNKNOWN';
  const normalized = String(value).trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : 'OTHER';
}

function sanitizeUrlClassification(value) {
  if (!hasValue(value)) {
    return Object.freeze({ configured: false, unsafeShape: false });
  }
  try {
    const parsed = new URL(String(value));
    return Object.freeze({
      configured: true,
      unsafeShape: Boolean(parsed.username || parsed.password || parsed.search || parsed.hash),
    });
  } catch (_e) {
    return Object.freeze({ configured: true, unsafeShape: true });
  }
}

function countBy(rows, selectKey, allowed) {
  const out = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = safeEnum(selectKey(row), allowed);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function credentialSummary(credentials) {
  const rows = Array.isArray(credentials) ? credentials : [];
  return Object.freeze({
    configuredCount: boundedCount(rows.length),
    activeCount: boundedCount(rows.filter((row) => row && row.status === 'ACTIVE').length),
    rotationRequiredCount: boundedCount(rows.filter((row) => row && row.status === 'ROTATION_REQUIRED').length),
    statusCounts: countBy(rows, (row) => row && row.status, SAFE_VALUES.credentialStatuses),
  });
}

function summarizeTenantDiagnostic(input) {
  const tenant = input && input.tenant ? input.tenant : null;
  const knowledgeCount = input ? input.knowledgeCount : 0;
  const integrations = tenant && Array.isArray(tenant.integrations) ? tenant.integrations : [];
  const endpoints = integrations.map((item) => item && item.webhookEndpoint).filter(Boolean);
  const credentials = endpoints.flatMap((endpoint) => Array.isArray(endpoint.credentials) ? endpoint.credentials : []);
  const apiOrigin = endpoints.map((endpoint) => sanitizeUrlClassification(endpoint.apiBaseUrl));

  return Object.freeze({
    script: SCRIPT_NAME,
    diagnostic: 'sanitized-read-only',
    tenant: Object.freeze({
      found: Boolean(tenant),
      slugConfigured: Boolean(tenant && hasValue(tenant.slug)),
      active: Boolean(tenant && tenant.isActive),
    }),
    counts: Object.freeze({
      knowledgeItems: boundedCount(knowledgeCount),
      integrations: boundedCount(integrations.length),
      enabledIntegrations: boundedCount(integrations.filter((row) => row && row.isEnabled === true).length),
      webhookEndpoints: boundedCount(endpoints.length),
      enabledWebhookEndpoints: boundedCount(endpoints.filter((row) => row && row.isEnabled === true).length),
      credentials: boundedCount(credentials.length),
    }),
    classifications: Object.freeze({
      integrationProviders: countBy(integrations, (row) => row && row.provider, SAFE_VALUES.providers),
      integrationChannels: countBy(integrations, (row) => row && row.channel, SAFE_VALUES.channels),
      processingModes: countBy(integrations, (row) => row && row.processingMode, SAFE_VALUES.processingModes),
      handoffPolicies: countBy(integrations, (row) => row && row.handoffPolicy, SAFE_VALUES.handoffPolicies),
      endpointMechanisms: countBy(endpoints, (row) => row && row.mechanism, SAFE_VALUES.mechanisms),
      endpointAuthModes: countBy(endpoints, (row) => row && row.authMode, SAFE_VALUES.authModes),
    }),
    configurationPresent: Object.freeze({
      exactVersionConfigured: endpoints.some((row) => hasValue(row.exactVersion)),
      apiOriginConfigured: apiOrigin.some((item) => item.configured),
      apiOriginUnsafeShapePresent: apiOrigin.some((item) => item.unsafeShape),
      identityConfigured: integrations.some((row) => row && row.identity),
    }),
    credentials: credentialSummary(credentials),
  });
}

function formatDiagnostic(summary) {
  return JSON.stringify(summary, null, 2);
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const tenantFlag = args.find((arg) => typeof arg === 'string' && arg.startsWith('--tenant-slug='));
  const rawSlug = tenantFlag ? tenantFlag.slice('--tenant-slug='.length).trim() : DEFAULT_TENANT_SLUG;
  const tenantSlug = /^[a-z0-9_-]{1,64}$/i.test(rawSlug) ? rawSlug : DEFAULT_TENANT_SLUG;
  return Object.freeze({
    allowed: args.includes(REQUIRED_FLAG),
    tenantSlug,
  });
}

async function collectDiagnostic(prisma, options) {
  const tenantSlug = options && options.tenantSlug ? options.tenantSlug : DEFAULT_TENANT_SLUG;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      isActive: true,
      integrations: {
        select: {
          provider: true,
          channel: true,
          processingMode: true,
          handoffPolicy: true,
          isEnabled: true,
          identity: { select: { provider: true } },
          webhookEndpoint: {
            select: {
              provider: true,
              channel: true,
              mechanism: true,
              exactVersion: true,
              apiBaseUrl: true,
              authMode: true,
              isEnabled: true,
              credentials: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const knowledgeCount = tenant && tenant.id
    ? await prisma.knowledgeBase.count({ where: { tenantId: tenant.id } })
    : 0;
  return summarizeTenantDiagnostic({ tenant, knowledgeCount });
}

async function main(argv, io) {
  const streams = io || {};
  const stderr = streams.stderr || process.stderr;
  const stdout = streams.stdout || process.stdout;
  const parsed = parseArgs(argv || process.argv.slice(2));

  if (!parsed.allowed) {
    stderr.write(
      GUARD_CODE + ' script=' + SCRIPT_NAME
      + ' requiredFlag=' + REQUIRED_FLAG
      + ' status=blocked-before-prisma-load\n',
    );
    return 1;
  }

  let prisma;
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    const summary = await collectDiagnostic(prisma, parsed);
    stdout.write(formatDiagnostic(summary) + '\n');
    return 0;
  } catch (_e) {
    stderr.write('SANITIZED_DIAGNOSTIC_FAILED script=' + SCRIPT_NAME + ' safeError=READ_ONLY_DIAGNOSTIC_UNAVAILABLE\n');
    return 1;
  } finally {
    if (prisma && typeof prisma.$disconnect === 'function') {
      try {
        await prisma.$disconnect();
      } catch (_e) {
        stderr.write('SANITIZED_DIAGNOSTIC_DISCONNECT_FAILED script=' + SCRIPT_NAME + '\n');
      }
    }
  }
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = Object.freeze({
  REQUIRED_FLAG,
  GUARD_CODE,
  FORBIDDEN_FIELD_POLICY,
  SAFE_VALUES,
  parseArgs,
  summarizeTenantDiagnostic,
  formatDiagnostic,
  collectDiagnostic,
  main,
});
