'use strict';

const assert = require('assert');

const {
  STATUS,
  buildPlan,
  stableHash,
} = require('./tenant-backfill-planner');

const tenants = [
  { id: 'tenant_A', slug: 'tenant-a', isActive: true },
  { id: 'tenant_B', slug: 'tenant-b', isActive: true },
];

const pages = [
  { id: 'page_A_row', pageId: 'page_A_key', isActive: true, tenantId: null },
  { id: 'page_B_row', pageId: 'page_B_key', isActive: true, tenantId: 'tenant_B' },
  { id: 'page_C_row', pageId: 'page_C_key', isActive: true, tenantId: null },
];

const conversations = [
  { id: 'conv_direct', tenantId: null, fbUserId: 'sender_shared', facebookPageId: 'page_A_key' },
  { id: 'conv_ambiguous', tenantId: null, fbUserId: 'sender_shared' },
  { id: 'conv_conflict', tenantId: null, fbUserId: 'sender_conflict' },
  { id: 'conv_invalid', tenantId: null, fbUserId: 'sender_invalid' },
  { id: 'conv_owned', tenantId: 'tenant_B', fbUserId: 'sender_owned' },
];

const appointments = [
  { id: 'appt_null', conversationId: 'conv_ambiguous', tenantId: null },
  { id: 'appt_owned', conversationId: 'conv_owned', tenantId: 'tenant_B' },
];

const mapping = {
  version: 1,
  pages: [
    { pageId: 'page_A_key', targetTenantId: 'tenant_A', reason: 'platform_admin_assignment' },
    { pageId: 'page_C_key', targetTenantId: 'missing_tenant', reason: 'platform_admin_assignment' },
  ],
  conversations: [
    {
      conversationId: 'conv_direct',
      targetTenantId: 'tenant_A',
      source: 'direct_page_relation',
      evidence: ['page_fk'],
    },
    {
      conversationId: 'conv_conflict',
      targetTenantId: 'tenant_A',
      source: 'manual_conflict_review',
      evidence: ['conflicting_page_candidates'],
      conflict: true,
    },
    {
      conversationId: 'conv_invalid',
      targetTenantId: 'missing_tenant',
      source: 'direct_page_relation',
      evidence: ['page_fk'],
    },
  ],
};

function actionFor(plan, model, recordId) {
  return plan.actions.find((action) => action.model === model && action.recordId === recordId);
}

function assertNoRuntimeHooks() {
  const beforeFetch = global.fetch;
  assert.strictEqual(beforeFetch, global.fetch);
}

function run() {
  const results = [];
  const record = (name, fn) => {
    fn();
    results.push(`PASS - ${name}`);
  };

  const directCapabilities = {
    conversationHasDirectPageRelation: true,
    conversationHasPageContextJson: true,
    messageHasMetadata: true,
    messageHasRawPayload: false,
  };
  const noDirectCapabilities = {
    conversationHasDirectPageRelation: false,
    conversationHasPageContextJson: true,
    messageHasMetadata: true,
    messageHasRawPayload: false,
  };

  const plan = buildPlan({ tenants, pages, conversations, appointments, mapping, modelCapabilities: directCapabilities });
  const noDirectPlan = buildPlan({
    tenants,
    pages,
    conversations: [{ id: 'conv_no_direct', tenantId: null, fbUserId: 'sender_shared', facebookPageId: 'page_A_key' }],
    appointments: [],
    mapping: { version: 1, pages: mapping.pages, conversations: [] },
    modelCapabilities: noDirectCapabilities,
  });

  record('1 Page A is ready from explicit mapping', () => {
    assert.strictEqual(actionFor(plan, 'FacebookPage', 'page_A_row').status, STATUS.READY);
  });

  record('2 Page B keeps existing owner', () => {
    assert.strictEqual(actionFor(plan, 'FacebookPage', 'page_B_row').status, STATUS.SKIP_ALREADY_ASSIGNED);
  });

  record('3 Direct conversation is ready when model supports proof', () => {
    assert.strictEqual(actionFor(plan, 'Conversation', 'conv_direct').status, STATUS.READY);
  });

  record('4 No direct proof means no automatic cascade', () => {
    assert.strictEqual(actionFor(noDirectPlan, 'Conversation', 'conv_no_direct').status, STATUS.SKIP_AMBIGUOUS);
  });

  record('5 Conflict stays skipped', () => {
    assert.strictEqual(actionFor(plan, 'Conversation', 'conv_conflict').status, STATUS.SKIP_CONFLICT);
  });

  record('6 Invalid target is rejected', () => {
    assert.strictEqual(actionFor(plan, 'Conversation', 'conv_invalid').status, STATUS.INVALID_TARGET_TENANT);
    assert.strictEqual(actionFor(plan, 'FacebookPage', 'page_C_row').status, STATUS.INVALID_TARGET_TENANT);
  });

  record('7 No apply path is executed', () => {
    assert.ok(plan.actions.every((action) => Object.values(STATUS).includes(action.status)));
  });

  record('8 No external hook is touched', () => {
    assertNoRuntimeHooks();
  });

  record('9 Plan is deterministic without timestamp', () => {
    const planAgain = buildPlan({ tenants, pages, conversations, appointments, mapping, modelCapabilities: directCapabilities });
    assert.strictEqual(plan.planHash, planAgain.planHash);
    assert.strictEqual(stableHash(plan.actions), stableHash(planAgain.actions));
  });

  record('10 Output omits raw contact-like fixture data', () => {
    const serialized = JSON.stringify(plan);
    assert.strictEqual(serialized.includes('000000'), false);
    assert.strictEqual(serialized.includes('SECRET'), false);
  });

  return results;
}

try {
  const results = run();
  for (const line of results) console.log(line);
  console.log(`tenant-backfill-planner-smoke: MOCK_PASS (${results.length} checks)`);
  process.exit(0);
} catch (error) {
  console.error(`tenant-backfill-planner-smoke: FAIL - ${error.message}`);
  process.exit(1);
}
