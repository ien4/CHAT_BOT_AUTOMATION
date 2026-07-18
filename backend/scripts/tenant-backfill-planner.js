'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATUS = Object.freeze({
  READY: 'READY',
  SKIP_ALREADY_ASSIGNED: 'SKIP_ALREADY_ASSIGNED',
  SKIP_NO_MAPPING: 'SKIP_NO_MAPPING',
  SKIP_AMBIGUOUS: 'SKIP_AMBIGUOUS',
  SKIP_CONFLICT: 'SKIP_CONFLICT',
  INVALID_TARGET_TENANT: 'INVALID_TARGET_TENANT',
});

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function stableHash(value) {
  return crypto.createHash('sha256')['update'](stableStringify(value)).digest('hex');
}

function parseArgs(argv) {
  const args = { audit: false, mappingPath: null, outputPath: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--audit') args.audit = true;
    else if (arg === '--mapping') { args.mappingPath = argv[i + 1] || null; i += 1; }
    else if (arg === '--output') { args.outputPath = argv[i + 1] || null; i += 1; }
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.audit && !args.help) args.audit = true;
  if (args.mappingPath === '') throw new Error('Mapping path is empty');
  if (args.outputPath === '') throw new Error('Output path is empty');
  return args;
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function normalizeMapping(mapping) {
  return {
    version: mapping?.version || 1,
    pages: Array.isArray(mapping?.pages) ? mapping.pages : [],
    conversations: Array.isArray(mapping?.conversations) ? mapping.conversations : [],
  };
}

function indexBy(rows, fieldName) {
  const result = new Map();
  for (const row of rows) {
    const key = row?.[fieldName];
    if (key) result.set(String(key), row);
  }
  return result;
}

function findDuplicateKeys(rows, fieldName) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const key = row?.[fieldName];
    if (!key) continue;
    const normalized = String(key);
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return duplicates;
}

function validateMapping(mappingInput, tenants) {
  const mapping = normalizeMapping(mappingInput);
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));
  const errors = [];

  for (const duplicate of findDuplicateKeys(mapping.pages, 'pageId')) {
    errors.push({ scope: 'pages', key: duplicate, reason: 'DUPLICATE_PAGE_ENTRY' });
  }
  for (const duplicate of findDuplicateKeys(mapping.conversations, 'conversationId')) {
    errors.push({ scope: 'conversations', key: duplicate, reason: 'DUPLICATE_CONVERSATION_ENTRY' });
  }
  for (const entry of mapping.pages) {
    if (!entry.pageId) errors.push({ scope: 'pages', key: null, reason: 'MISSING_PAGE_KEY' });
    if (!entry.targetTenantId) errors.push({ scope: 'pages', key: entry.pageId || null, reason: 'EMPTY_TARGET_TENANT' });
    else if (!tenantIds.has(entry.targetTenantId)) errors.push({ scope: 'pages', key: entry.pageId || null, reason: 'TARGET_TENANT_NOT_FOUND' });
  }
  for (const entry of mapping.conversations) {
    if (!entry.conversationId) errors.push({ scope: 'conversations', key: null, reason: 'MISSING_CONVERSATION_KEY' });
    if (!entry.targetTenantId) errors.push({ scope: 'conversations', key: entry.conversationId || null, reason: 'EMPTY_TARGET_TENANT' });
    else if (!tenantIds.has(entry.targetTenantId)) errors.push({ scope: 'conversations', key: entry.conversationId || null, reason: 'TARGET_TENANT_NOT_FOUND' });
  }
  return { mapping, errors };
}

function hasMappingError(errors, scope, key) {
  return errors.some((error) => error.scope === scope && error.key === key);
}

function classifyConversationMapping(entry) {
  const evidence = Array.isArray(entry?.evidence) ? entry.evidence : [];
  if (entry?.source === 'direct_page_relation' || evidence.includes('page_fk') || evidence.includes('immutable_page_id')) return 'A';
  if (entry?.source === 'operator_approved_strong_derived' && evidence.length >= 2) return 'B';
  return 'C';
}

function findConversationPageKey(conversation) {
  if (conversation?.facebookPageId) return String(conversation.facebookPageId);
  if (conversation?.pageId) return String(conversation.pageId);
  const context = conversation?.context && typeof conversation.context === 'object' ? conversation.context : null;
  const pageContext = conversation?.pageContext && typeof conversation.pageContext === 'object' ? conversation.pageContext : null;
  if (context?.facebookPageId) return String(context.facebookPageId);
  if (pageContext?.facebookPageId) return String(pageContext.facebookPageId);
  if (pageContext?.pageId) return String(pageContext.pageId);
  return null;
}

function actionBase(model, recordId, oldValue, newValue, status, details = {}) {
  return {
    model,
    recordId,
    oldTenantId: oldValue ?? null,
    newTenantId: newValue ?? null,
    mappingSource: details.mappingSource || null,
    evidence: details.evidence || [],
    status,
    reason: details.reason || null,
  };
}

function buildPlan(input) {
  const tenants = input.tenants || [];
  const pages = input.pages || [];
  const conversations = input.conversations || [];
  const appointments = input.appointments || [];
  const capabilities = input.modelCapabilities || {};
  const { mapping, errors } = validateMapping(input.mapping || {}, tenants);
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));
  const pageMappingByKey = indexBy(mapping.pages, 'pageId');
  const conversationMappingByKey = indexBy(mapping.conversations, 'conversationId');
  const pagesByKey = indexBy(pages, 'pageId');
  const actions = [];

  for (const page of pages) {
    const mappingEntry = pageMappingByKey.get(String(page.pageId));
    if (page.tenantId) {
      actions.push(actionBase('FacebookPage', page.id, page.tenantId, page.tenantId, STATUS.SKIP_ALREADY_ASSIGNED, { mappingSource: 'existing_owner', evidence: ['existing_assignment'] }));
      continue;
    }
    if (!mappingEntry) {
      actions.push(actionBase('FacebookPage', page.id, null, null, STATUS.SKIP_NO_MAPPING, { reason: 'NO_EXPLICIT_MAPPING' }));
      continue;
    }
    if (hasMappingError(errors, 'pages', mappingEntry.pageId)) {
      actions.push(actionBase('FacebookPage', page.id, null, mappingEntry.targetTenantId || null, STATUS.INVALID_TARGET_TENANT, { mappingSource: mappingEntry.reason || 'mapping_file', evidence: ['mapping_file'], reason: 'MAPPING_INVALID' }));
      continue;
    }
    actions.push(actionBase('FacebookPage', page.id, null, mappingEntry.targetTenantId, STATUS.READY, { mappingSource: mappingEntry.reason || 'mapping_file', evidence: ['platform_admin_assignment'] }));
  }

  for (const conversation of conversations) {
    const mappingEntry = conversationMappingByKey.get(String(conversation.id));
    if (conversation.tenantId) {
      actions.push(actionBase('Conversation', conversation.id, conversation.tenantId, conversation.tenantId, STATUS.SKIP_ALREADY_ASSIGNED, { mappingSource: 'existing_owner', evidence: ['existing_assignment'] }));
      continue;
    }
    if (mappingEntry) {
      const classification = classifyConversationMapping(mappingEntry);
      if (hasMappingError(errors, 'conversations', mappingEntry.conversationId)) {
        actions.push(actionBase('Conversation', conversation.id, null, mappingEntry.targetTenantId || null, STATUS.INVALID_TARGET_TENANT, { mappingSource: mappingEntry.source || 'mapping_file', evidence: mappingEntry.evidence || [], reason: 'MAPPING_INVALID' }));
      } else if (mappingEntry.conflict === true || classification === 'C') {
        actions.push(actionBase('Conversation', conversation.id, null, mappingEntry.targetTenantId || null, STATUS.SKIP_CONFLICT, { mappingSource: mappingEntry.source || 'mapping_file', evidence: mappingEntry.evidence || [], reason: 'CONVERSATION_PROVENANCE_NOT_AUTHORITATIVE' }));
      } else {
        actions.push(actionBase('Conversation', conversation.id, null, mappingEntry.targetTenantId, STATUS.READY, { mappingSource: mappingEntry.source || 'mapping_file', evidence: mappingEntry.evidence || [] }));
      }
      continue;
    }
    const pageKey = capabilities.conversationHasDirectPageRelation ? findConversationPageKey(conversation) : null;
    if (pageKey) {
      const page = pagesByKey.get(pageKey);
      const pageMapping = pageMappingByKey.get(pageKey);
      const target = page?.tenantId || pageMapping?.targetTenantId || null;
      if (!target) {
        actions.push(actionBase('Conversation', conversation.id, null, null, STATUS.SKIP_NO_MAPPING, { mappingSource: 'direct_page_relation', evidence: ['page_fk'], reason: 'PAGE_OWNER_MISSING' }));
      } else if (!tenantIds.has(target)) {
        actions.push(actionBase('Conversation', conversation.id, null, target, STATUS.INVALID_TARGET_TENANT, { mappingSource: 'direct_page_relation', evidence: ['page_fk'], reason: 'TARGET_TENANT_NOT_FOUND' }));
      } else {
        actions.push(actionBase('Conversation', conversation.id, null, target, STATUS.READY, { mappingSource: 'direct_page_relation', evidence: ['page_fk'] }));
      }
      continue;
    }
    actions.push(actionBase('Conversation', conversation.id, null, null, STATUS.SKIP_AMBIGUOUS, { reason: 'NO_AUTHORITATIVE_PAGE_PROVENANCE' }));
  }

  for (const appointment of appointments) {
    if (appointment.tenantId) {
      actions.push(actionBase('Appointment', appointment.id, appointment.tenantId, appointment.tenantId, STATUS.SKIP_ALREADY_ASSIGNED, { mappingSource: 'existing_owner', evidence: ['existing_assignment'] }));
    } else {
      actions.push(actionBase('Appointment', appointment.id, null, null, STATUS.SKIP_AMBIGUOUS, { reason: 'APPOINTMENT_REQUIRES_CONVERSATION_OWNER_PROOF' }));
    }
  }

  const summary = actions.reduce((acc, action) => {
    acc.total += 1;
    acc.byStatus[action.status] = (acc.byStatus[action.status] || 0) + 1;
    acc.byModel[action.model] = (acc.byModel[action.model] || 0) + 1;
    return acc;
  }, { total: 0, byStatus: {}, byModel: {} });

  const hashInput = { mapping, errors, actions, summary };
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: 'read_only_plan',
    summary,
    validationErrors: errors,
    warnings: input.warnings || [],
    actions,
    rollbackManifestSchema: { model: 'string', recordId: 'string', oldTenantId: 'string|null', newTenantId: 'string', appliedAt: 'datetime', planHash: 'sha256' },
    planHash: stableHash(hashInput),
  };
}

function inferModelCapabilities(schemaText) {
  const conversationMatch = schemaText.match(/model Conversation \{[\s\S]*?\n\}/);
  const messageMatch = schemaText.match(/model Message \{[\s\S]*?\n\}/);
  const conversationBlock = conversationMatch ? conversationMatch[0] : '';
  const messageBlock = messageMatch ? messageMatch[0] : '';
  return {
    conversationHasDirectPageRelation: /\bfacebookPageId\b|\bpageId\b/.test(conversationBlock),
    conversationHasPageContextJson: /\bpageContext\b/.test(conversationBlock) || /\bcontext\b/.test(conversationBlock),
    messageHasMetadata: /\bmetadata\b/.test(messageBlock),
    messageHasRawPayload: /\brawPayload\b|\braw\b/.test(messageBlock),
  };
}

function prismaModelHasField(prismaMeta, modelName, fieldName) {
  const models = prismaMeta?.dmmf?.datamodel?.models || [];
  const model = models.find((item) => item.name === modelName);
  return Boolean(model && model.fields.some((field) => field.name === fieldName));
}

async function collectAuditData(prisma, clientCapabilities = {}) {
  const warnings = [];
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, isActive: true }, orderBy: { id: 'asc' } });
  const pageSelect = clientCapabilities.facebookPageHasTenantField
    ? { id: true, pageId: true, isActive: true, tenantId: true }
    : { id: true, pageId: true, isActive: true };
  const rawPages = await prisma.facebookPage.findMany({ select: pageSelect, orderBy: { id: 'asc' } });
  const pages = rawPages.map((page) => ({ ...page, tenantId: clientCapabilities.facebookPageHasTenantField ? page.tenantId : null }));
  if (!clientCapabilities.facebookPageHasTenantField) warnings.push('PRISMA_CLIENT_FACEBOOK_PAGE_OWNER_FIELD_MISSING');
  const conversations = await prisma.conversation.findMany({ select: { id: true, fbUserId: true, tenantId: true, context: true, pageContext: true }, orderBy: { id: 'asc' } });
  const appointments = await prisma.appointment.findMany({ select: { id: true, conversationId: true, tenantId: true }, orderBy: { id: 'asc' } });
  return { tenants, pages, conversations, appointments, warnings };
}

function resolveDefaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(__dirname, '..', '..', 'tmp-runtime', `tenant-backfill-plan-${stamp}.json`);
}

function printUsage() {
  console.log('Usage: node scripts/tenant-backfill-planner.js --audit [--mapping <file>] [--output <file>]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const schemaPath = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
  const schemaText = fs.readFileSync(schemaPath, 'utf8');
  const modelCapabilities = inferModelCapabilities(schemaText);
  const mapping = args.mappingPath ? loadJsonFile(args.mappingPath) : { version: 1, pages: [], conversations: [] };

  require('dotenv').config({ quiet: true });
  const { PrismaClient, Prisma } = require('@prisma/client');
  const clientCapabilities = { facebookPageHasTenantField: prismaModelHasField(Prisma, 'FacebookPage', 'tenantId') };
  const prisma = new PrismaClient();

  try {
    const data = await collectAuditData(prisma, clientCapabilities);
    const plan = buildPlan({ ...data, mapping, modelCapabilities });
    const outputPath = args.outputPath ? path.resolve(args.outputPath) : resolveDefaultOutputPath();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

    console.log('tenant-backfill-planner: READ_ONLY_PLAN_READY');
    console.log(`summary: actions=${plan.summary.total}, ready=${plan.summary.byStatus.READY || 0}, blocked=${(plan.summary.byStatus.SKIP_AMBIGUOUS || 0) + (plan.summary.byStatus.SKIP_CONFLICT || 0) + (plan.summary.byStatus.INVALID_TARGET_TENANT || 0)}`);
    console.log(`output: ${outputPath}`);
  } catch (error) {
    const firstLine = String(error?.message || error).split('\n')[0];
    console.error('tenant-backfill-planner: PRISMA_CLIENT_STALE_OR_SCHEMA_MISMATCH');
    console.error(firstLine);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('tenant-backfill-planner: FAIL');
    console.error(String(error?.message || error).split('\n')[0]);
    process.exit(1);
  });
}

module.exports = {
  STATUS,
  stableHash,
  parseArgs,
  normalizeMapping,
  validateMapping,
  classifyConversationMapping,
  inferModelCapabilities,
  buildPlan,
};
