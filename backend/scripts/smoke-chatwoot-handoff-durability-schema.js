'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_ROOT = path.join(BACKEND_ROOT, 'prisma', 'migrations');
const PACKAGE_PATH = path.join(BACKEND_ROOT, 'package.json');
const TARGET_SUFFIX = '_add_chatwoot_handoff_durability';
const MODEL_NAME = 'ChatwootHandoffExecution';
const TABLE_NAME = 'chatwoot_handoff_executions';

let checks = 0;
const failures = [];

function check(name, condition) {
  checks += 1;
  if (!condition) failures.push(name);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractModel(schema, modelName) {
  const start = schema.indexOf('model ' + modelName + ' ');
  if (start < 0) return null;
  const open = schema.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < schema.length; i += 1) {
    const ch = schema[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return schema.slice(open + 1, i);
    }
  }
  return null;
}

function fieldLine(modelBody, fieldName) {
  if (!modelBody) return '';
  const line = modelBody.split(/\r?\n/).find((l) => new RegExp('^\\s*' + fieldName + '\\b').test(l));
  return line || '';
}

function hasField(modelBody, fieldName, expected) {
  const line = fieldLine(modelBody, fieldName);
  if (!line) return false;
  return expected.every((part) => line.includes(part));
}

function listMigrationDirs() {
  return fs.readdirSync(MIGRATIONS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^\d{14}_[A-Za-z0-9_]+$/.test(name))
    .filter((name) => fs.existsSync(path.join(MIGRATIONS_ROOT, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b));
}

function sqlHasColumn(sql, name, typeSql) {
  return new RegExp('"' + name + '"\\s+' + typeSql, 'i').test(sql);
}

function sqlHas(sql, pattern) {
  return new RegExp(pattern, 'i').test(sql);
}

function forbiddenColumnNamesFromSql(sql) {
  const forbidden = [
    'raw_content', 'rawContent', 'content', 'message', 'message_text', 'messageText',
    'customer_message', 'customerMessage', 'webhook_body', 'webhookBody', 'payload',
    'metadata_json', 'metadataJson', 'request_body', 'requestBody', 'response_body',
    'responseBody', 'raw_response', 'rawResponse', 'raw_error', 'rawError', 'stack',
    'headers', 'authorization', 'api_token', 'apiToken', 'access_token', 'accessToken',
    'webhook_secret', 'webhookSecret', 'encryption_key', 'encryptionKey', 'api_base_url',
    'apiBaseUrl', 'customer_name', 'customerName', 'customer_phone', 'customerPhone',
    'customer_email', 'customerEmail',
  ];
  const matches = [];
  const columnRe = /"([^"]+)"\s+(TEXT|INTEGER|BOOLEAN|TIMESTAMP|JSONB?|UUID)\b/ig;
  let m;
  while ((m = columnRe.exec(sql)) !== null) {
    if (forbidden.includes(m[1])) matches.push(m[1]);
  }
  return matches;
}

function forbiddenFieldNamesFromModel(modelBody) {
  const forbidden = /^(rawContent|content|message|messageText|customerMessage|webhookBody|payload|metadataJson|requestBody|responseBody|rawResponse|rawError|stack|headers|authorization|apiToken|accessToken|webhookSecret|encryptionKey|apiBaseUrl|customerName|customerPhone|customerEmail)$/;
  return modelBody.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((name) => forbidden.test(name));
}

function requiredShapeChecks(model) {
  const requiredFields = {
    id: ['String', '@id', '@default(uuid())'],
    tenantIntegrationId: ['String', '@map("tenant_integration_id")'],
    handoffRequestKey: ['String', '@unique', '@map("handoff_request_key")'],
    activeOwnershipKey: ['String?', '@unique', '@map("active_ownership_key")'],
    businessIdempotencyKey: ['String', '@map("business_idempotency_key")'],
    externalConversationRef: ['String', '@map("external_conversation_ref")'],
    localOwnershipState: ['String', '@map("local_ownership_state")'],
    providerExecutionState: ['String', '@default("NOT_STARTED")', '@map("provider_execution_state")'],
    assignmentTargetKind: ['String?', '@map("assignment_target_kind")'],
    assignmentTargetRef: ['String?', '@map("assignment_target_ref")'],
    safeReasonCode: ['String?', '@map("safe_reason_code")'],
    attemptCount: ['Int', '@default(0)', '@map("attempt_count")'],
    remoteEvidenceRef: ['String?', '@map("remote_evidence_ref")'],
    safeErrorCode: ['String?', '@map("safe_error_code")'],
    requestedAt: ['DateTime', '@default(now())', '@map("requested_at")'],
    updatedAt: ['DateTime', '@updatedAt', '@map("updated_at")'],
    completedAt: ['DateTime?', '@map("completed_at")'],
    reconciliationRequiredAt: ['DateTime?', '@map("reconciliation_required_at")'],
  };
  for (const [field, parts] of Object.entries(requiredFields)) {
    check('field ' + field + ' shape', Boolean(model) && hasField(model, field, parts));
  }
}

function main() {
  const schema = readText(SCHEMA_PATH);
  const pkg = JSON.parse(readText(PACKAGE_PATH));
  const model = extractModel(schema, MODEL_NAME);
  const tenantIntegration = extractModel(schema, 'TenantIntegration');
  const migrations = listMigrationDirs();
  const targetDirs = migrations.filter((name) => name.endsWith(TARGET_SUFFIX));
  const targetDir = targetDirs[0] || '';
  const targetSqlPath = targetDir ? path.join(MIGRATIONS_ROOT, targetDir, 'migration.sql') : '';
  const targetSql = targetSqlPath ? readText(targetSqlPath) : '';
  const scriptText = readText(__filename);
  const requireTargets = Array.from(scriptText.matchAll(/require\(['"]([^'"]+)['"]\)/g)).map((m) => m[1]);

  check('01 schema file exists', fs.existsSync(SCHEMA_PATH));
  check('02 package file exists', fs.existsSync(PACKAGE_PATH));
  check('03 model ChatwootHandoffExecution exists', typeof model === 'string' && model.length > 0);
  check('04 TenantIntegration relation list exists', typeof tenantIntegration === 'string' && /handoffExecutions\s+ChatwootHandoffExecution\[\]/.test(tenantIntegration));

  requiredShapeChecks(model || '');

  check('localOwnershipState has no default', Boolean(model) && !/@default/.test(fieldLine(model, 'localOwnershipState')));
  check('tenantIntegration relation Restrict', Boolean(model) && /tenantIntegration\s+TenantIntegration\s+@relation\(fields:\s*\[tenantIntegrationId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/.test(model.replace(/\s+/g, ' ')));
  check('tenant+conversation index exists', Boolean(model) && /@@index\(\[tenantIntegrationId,\s*externalConversationRef\],\s*map:\s*"chatwoot_handoff_tenant_conversation_idx"\)/.test(model));
  check('local ownership index exists', Boolean(model) && /@@index\(\[localOwnershipState,\s*updatedAt\],\s*map:\s*"chatwoot_handoff_local_state_updated_idx"\)/.test(model));
  check('provider execution index exists', Boolean(model) && /@@index\(\[providerExecutionState,\s*updatedAt\],\s*map:\s*"chatwoot_handoff_provider_state_updated_idx"\)/.test(model));
  check('table map exists', Boolean(model) && /@@map\("chatwoot_handoff_executions"\)/.test(model));
  check('model has no forbidden storage fields', Boolean(model) && forbiddenFieldNamesFromModel(model).length === 0);
  check('no new enum for handoff execution', !/enum\s+ChatwootHandoff/i.test(schema));

  check('target migration directory exists exactly once', targetDirs.length === 1);
  check('target migration is last migration', Boolean(targetDir) && migrations[migrations.length - 1] === targetDir);
  check('target migration file exists', Boolean(targetSqlPath) && fs.existsSync(targetSqlPath));
  check('migration creates table', targetSql.includes('CREATE TABLE "' + TABLE_NAME + '"'));
  check('migration has id column', sqlHasColumn(targetSql, 'id', 'TEXT\\s+NOT\\s+NULL'));
  check('migration has tenant integration column', sqlHasColumn(targetSql, 'tenant_integration_id', 'TEXT\\s+NOT\\s+NULL'));
  check('migration has handoff request key', sqlHasColumn(targetSql, 'handoff_request_key', 'TEXT\\s+NOT\\s+NULL'));
  check('migration has nullable active ownership key', sqlHasColumn(targetSql, 'active_ownership_key', 'TEXT'));
  check('migration has business idempotency key', sqlHasColumn(targetSql, 'business_idempotency_key', 'TEXT\\s+NOT\\s+NULL'));
  check('migration has external conversation ref', sqlHasColumn(targetSql, 'external_conversation_ref', 'TEXT\\s+NOT\\s+NULL'));
  check('migration has local ownership state without default', sqlHasColumn(targetSql, 'local_ownership_state', 'TEXT\\s+NOT\\s+NULL') && !/"local_ownership_state"[^,\n]+DEFAULT/i.test(targetSql));
  check('migration provider state default', /"provider_execution_state"\s+TEXT\s+NOT\s+NULL\s+DEFAULT 'NOT_STARTED'/i.test(targetSql));
  check('migration attempt count default zero', /"attempt_count"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT 0/i.test(targetSql));
  check('migration has safe reason code', sqlHasColumn(targetSql, 'safe_reason_code', 'TEXT'));
  check('migration has remote evidence ref', sqlHasColumn(targetSql, 'remote_evidence_ref', 'TEXT'));
  check('migration has safe error code', sqlHasColumn(targetSql, 'safe_error_code', 'TEXT'));
  check('migration has unique handoff request key', sqlHas(targetSql, 'CREATE\\s+UNIQUE\\s+INDEX\\s+"chatwoot_handoff_executions_handoff_request_key_key"'));
  check('migration has unique active ownership key', sqlHas(targetSql, 'CREATE\\s+UNIQUE\\s+INDEX\\s+"chatwoot_handoff_executions_active_ownership_key_key"'));
  check('migration has tenant conversation index', sqlHas(targetSql, 'chatwoot_handoff_tenant_conversation_idx'));
  check('migration has local ownership index', sqlHas(targetSql, 'chatwoot_handoff_local_state_updated_idx'));
  check('migration has provider execution index', sqlHas(targetSql, 'chatwoot_handoff_provider_state_updated_idx'));
  check('migration has FK Restrict', /FOREIGN KEY \("tenant_integration_id"\) REFERENCES "tenant_integrations"\("id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/i.test(targetSql.replace(/\s+/g, ' ')));
  check('migration has no forbidden storage columns', forbiddenColumnNamesFromSql(targetSql).length === 0);
  check('migration has no IF NOT EXISTS', !/IF\s+NOT\s+EXISTS/i.test(targetSql));
  check('migration has no destructive old table operation', !/(^|\n)\s*(DROP|TRUNCATE|UPDATE)\b/i.test(targetSql) && !/(^|\n)\s*ALTER\s+TABLE\s+"(?!chatwoot_handoff_executions")/i.test(targetSql));
  check('package script exists', pkg.scripts && pkg.scripts['smoke:chatwoot-handoff-durability-schema'] === 'node scripts/smoke-chatwoot-handoff-durability-schema.js');
  check('smoke imports only fs/path', requireTargets.every((name) => name === 'node:fs' || name === 'node:path'));
  check('smoke does not instantiate PrismaClient', !/new\s+PrismaClient/.test(scriptText));
  check('smoke work stays in project', BACKEND_ROOT.startsWith(PROJECT_ROOT));

  if (failures.length > 0) {
    console.error('smoke:chatwoot-handoff-durability-schema failures=' + failures.length);
    for (const failure of failures) console.error(' - ' + failure);
    process.exit(1);
  }
  console.log('smoke:chatwoot-handoff-durability-schema checks=' + checks + ' failures=0');
  console.log('CHATWOOT_HANDOFF_DURABILITY_SCHEMA_STATIC_PASS');
}

try {
  main();
} catch (e) {
  console.error('smoke:chatwoot-handoff-durability-schema failed: ' + ((e && e.code) || (e && e.message) || 'ERR'));
  process.exit(1);
}