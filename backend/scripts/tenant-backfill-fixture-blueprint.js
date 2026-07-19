'use strict';

// LOCAL-E2E-FIXTURE-DESIGN-01
// Deterministic, sanitized fixture blueprint for the LOCKED tenant backfill
// protocol. This module PROVES protocol behavior over synthetic in-memory data
// but CANNOT create or mutate database state. It intentionally:
//   - never imports PrismaClient,
//   - never reads DATABASE_URL / .env / process.env,
//   - never performs a network call,
//   - never writes a file at import (or ever, by default),
//   - never requires runtime source under ../src.
//
// It consumes ONLY the public, side-effect-free exports of the landed tooling
// (planner + executor). Plan generation goes through the real Planner contract
// (buildPlan) so fixtures cannot drift from production classification logic.

const crypto = require('crypto');

const {
  STATUS,
  buildPlan,
} = require('./tenant-backfill-planner');
const {
  computePlanExecHash,
  validatePlan,
  createMockRepository,
  SUPPORTED_MODELS,
} = require('./tenant-backfill-executor');

// ---- Sanitized, local-only identity vocabulary --------------------------------
const DEFAULT_PURPOSE = 'tenant-backfill-local-e2e';
const FIXTURE_NAMESPACE = 'fixture-tenant-backfill-local-e2e';
const TARGET = 'bbotech-local-sanitized';
const DATABASE_NAME = 'bbotech_local_db';
const ENVIRONMENT_CLASS = 'LOCAL';
const HOST_CLASS = 'LOCAL_LOOPBACK';
const PROVIDER = 'postgresql';
// approval.purpose is bound by operational-safety policy and is DISTINCT from the
// fixture identity purpose above.
const APPROVAL_PURPOSE = 'tenant-backfill';

const FIXTURE_CODE = Object.freeze({
  FIXTURE_SPEC_OK: 'FIXTURE_SPEC_OK',
  FIXTURE_SPEC_INVALID: 'FIXTURE_SPEC_INVALID',
});

// Static schema fingerprint of the exact fields the fixture depends on. Kept in
// sync with backend/prisma/schema.prisma (all ids are String @default(uuid())).
const SCHEMA_SURFACE = Object.freeze({
  Tenant: ['id', 'slug', 'isActive'],
  FacebookPage: ['id', 'pageId', 'isActive', 'tenantId'],
  Conversation: ['id', 'fbUserId', 'tenantId', 'context', 'pageContext'],
  Appointment: ['id', 'conversationId', 'tenantId'],
});

const SCENARIOS = Object.freeze([
  'A', // happy-path READY
  'B', // no-action
  'C', // apply-time write conflict
  'D', // unsupported model
  'E', // target mismatch
  'F', // approval hash mismatch
  'G', // duplicate action
  'H', // backup proof stale / missing
]);

// Secret / connection material that must NEVER appear anywhere in a fixture,
// including the schema-faithful candidate snapshot.
const SECRET_KEY_RE = /(secret|token|databaseurl|connectionstring|accesstoken|verifytoken|appsecret|password|apikey|privatekey|raw|payload)/i;
// PII-linked keys that must not be persisted into PROTOCOL artifacts (approval,
// backup proof, descriptor, mapping, cleanup, rollback). The read-only candidate
// snapshot is exempt because it intentionally mirrors real schema field names
// (e.g. Conversation.fbUserId) with synthetic values.
const PII_KEY_RE = /(message|content|phone|email|fbuserid|fbusername|customername|customerid|username)/i;

// ---- Injectable, deterministic primitives -------------------------------------
function defaultHashFunction(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

// Shape a 32-hex digest into a valid RFC4122 UUID (version 5, name-based style).
// The DB column is String @default(uuid()); a deterministic UUID-shaped value is
// schema-compatible while remaining reproducible with no Date.now / no random.
function toUuidShape(hex) {
  const h = String(hex).padEnd(32, '0').slice(0, 32);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function makeDeps(deps = {}) {
  const hashFunction = typeof deps.hashFunction === 'function' ? deps.hashFunction : defaultHashFunction;
  const clock = typeof deps.clock === 'function' ? deps.clock : () => Date.parse('2026-07-19T00:00:00.000Z');
  const idFactory = typeof deps.idFactory === 'function'
    ? deps.idFactory
    : (kind, seed) => toUuidShape(hashFunction(`${FIXTURE_NAMESPACE}:${kind}:${seed}`));
  return { hashFunction, clock, idFactory };
}

function nowMs(clock) {
  const value = clock();
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function iso(clock, offsetMs = 0) {
  return new Date(nowMs(clock) + offsetMs).toISOString();
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

// Deep clone via structuredClone when available, else JSON round-trip. Used so
// callers can never mutate frozen source fixtures through returned references.
function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function assertKeys(value, keyRe, code, pathPrefix = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertKeys(item, keyRe, code, `${pathPrefix}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (keyRe.test(key)) {
      const error = new Error(`${code}:${currentPath}`);
      error.code = code;
      throw error;
    }
    assertKeys(value[key], keyRe, code, currentPath);
  }
}

// No secrets anywhere (entities included).
function assertNoSecrets(value) {
  assertKeys(value, SECRET_KEY_RE, 'FIXTURE_SECRET_KEY');
}

// Full sanitization for persisted protocol artifacts: no secrets AND no PII keys.
function assertSanitized(value) {
  assertKeys(value, SECRET_KEY_RE, 'FIXTURE_SECRET_KEY');
  assertKeys(value, PII_KEY_RE, 'FIXTURE_PII_KEY');
}

// ---- Fixture identity ---------------------------------------------------------
function schemaFingerprint(hashFunction) {
  return hashFunction(stableStringify(SCHEMA_SURFACE)).slice(0, 32);
}

function buildFixtureIdentity(deps) {
  const { idFactory, clock, hashFunction } = makeDeps(deps);
  return {
    version: 1,
    fixtureId: idFactory('fixture', 'root'),
    fixtureNamespace: FIXTURE_NAMESPACE,
    purpose: DEFAULT_PURPOSE,
    target: TARGET,
    createdAt: iso(clock),
    schemaFingerprint: schemaFingerprint(hashFunction),
  };
}

// ---- Fixture spec -------------------------------------------------------------
// A spec is the declarative intent for one scenario: which tenant, which legacy
// candidates, and the expected classification outcome. Pure data; no I/O.
function buildFixtureSpec(options = {}) {
  const deps = makeDeps(options);
  const { idFactory } = deps;
  const scenario = options.scenario || 'A';

  const tenantId = idFactory('tenant', 'alpha');
  const readyPageId = idFactory('facebookPage', 'ready');
  const assignedPageId = idFactory('facebookPage', 'assigned');
  const conversationId = idFactory('conversation', 'ambiguous');
  const appointmentId = idFactory('appointment', 'ambiguous');
  const pagePublicId = `fixture-page-${idFactory('pagePublicId', 'ready').slice(0, 8)}`;

  const identity = buildFixtureIdentity(options);

  // Base tenant + candidate set shared by scenarios A/B/C.
  const tenant = { id: tenantId, slug: 'fixture-tenant-alpha', isActive: true };

  const spec = {
    version: 1,
    fixtureId: identity.fixtureId,
    fixtureNamespace: FIXTURE_NAMESPACE,
    purpose: DEFAULT_PURPOSE,
    scenario,
    target: TARGET,
    createdAt: identity.createdAt,
    schemaFingerprint: identity.schemaFingerprint,
    tenant,
    ids: { tenantId, readyPageId, assignedPageId, conversationId, appointmentId, pagePublicId },
    entities: {
      tenants: [tenant],
      // Legacy candidate (tenantId null) to be backfilled.
      facebookPages: [
        { id: readyPageId, pageId: pagePublicId, isActive: true, tenantId: null },
        // Already-assigned page to exercise SKIP_ALREADY_ASSIGNED coverage.
        { id: assignedPageId, pageId: `fixture-page-${assignedPageId.slice(0, 8)}`, isActive: true, tenantId },
      ],
      conversations: [
        { id: conversationId, fbUserId: 'fixture-user-0001', tenantId: null, context: null, pageContext: null },
      ],
      appointments: [
        { id: appointmentId, conversationId, tenantId: null },
      ],
    },
    // Strict mapping only assigns the READY page to the fixture tenant.
    mapping: {
      version: 1,
      pages: [{ pageId: pagePublicId, targetTenantId: tenantId, reason: 'fixture_platform_admin_assignment' }],
      conversations: [],
    },
    modelCapabilities: { conversationHasDirectPageRelation: false },
  };

  if (scenario === 'B') {
    // No-action: drop the READY page candidate and its mapping so readyCount = 0.
    spec.entities.facebookPages = [
      { id: assignedPageId, pageId: `fixture-page-${assignedPageId.slice(0, 8)}`, isActive: true, tenantId },
    ];
    spec.mapping.pages = [];
  }

  assertNoSecrets(spec);
  return spec;
}

function validateFixtureSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, code: FIXTURE_CODE.FIXTURE_SPEC_INVALID, errors: ['SPEC_NOT_OBJECT'] };
  }
  if (spec.version !== 1) errors.push('VERSION_UNSUPPORTED');
  if (spec.fixtureNamespace !== FIXTURE_NAMESPACE) errors.push('NAMESPACE_INVALID');
  if (spec.purpose !== DEFAULT_PURPOSE) errors.push('PURPOSE_INVALID');
  if (spec.target !== TARGET) errors.push('TARGET_INVALID');
  if (!spec.entities || typeof spec.entities !== 'object') errors.push('ENTITIES_REQUIRED');
  try {
    assertNoSecrets(spec);
    // PII keys are allowed only inside the schema-faithful candidate snapshot,
    // so check every non-entity subtree for PII leakage.
    const { entities, ids, ...specWithoutEntities } = spec;
    assertKeys(specWithoutEntities, PII_KEY_RE, 'FIXTURE_PII_KEY');
  } catch (error) {
    errors.push(error.code || 'FIXTURE_UNSAFE_KEY');
  }
  // Every candidate id must be UUID-shaped (schema-compatible with @default(uuid())).
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const allIds = [
    ...(spec.entities?.tenants || []).map((t) => t.id),
    ...(spec.entities?.facebookPages || []).map((p) => p.id),
    ...(spec.entities?.conversations || []).map((c) => c.id),
    ...(spec.entities?.appointments || []).map((a) => a.id),
  ];
  if (!allIds.every((id) => uuidRe.test(String(id)))) errors.push('ID_NOT_SCHEMA_COMPATIBLE');
  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? FIXTURE_CODE.FIXTURE_SPEC_OK : FIXTURE_CODE.FIXTURE_SPEC_INVALID,
    errors,
  };
}

// ---- Read-only candidate snapshot (Planner input) -----------------------------
function buildFixtureCandidateSnapshot(spec) {
  return {
    tenants: clone(spec.entities.tenants),
    pages: clone(spec.entities.facebookPages),
    conversations: clone(spec.entities.conversations),
    appointments: clone(spec.entities.appointments),
    modelCapabilities: clone(spec.modelCapabilities),
    warnings: [],
  };
}

// ---- Strict mapping artifact (UTF-8, no BOM, strict JSON) ----------------------
function buildStrictMappingArtifact(spec) {
  return {
    version: 1,
    generatedBy: 'tenant-backfill-fixture-blueprint',
    fixtureNamespace: FIXTURE_NAMESPACE,
    pages: clone(spec.mapping.pages),
    conversations: clone(spec.mapping.conversations),
  };
}

// ---- Plan generation via the real Planner contract ----------------------------
function buildFixturePlan(spec, deps = {}) {
  const { clock } = makeDeps(deps);
  const snapshot = buildFixtureCandidateSnapshot(spec);
  const mapping = buildStrictMappingArtifact(spec);
  const plan = buildPlan({ ...snapshot, mapping });
  // planHash/execHash exclude generatedAt (see planner/executor). Normalize the
  // volatile timestamp with the injected clock so the whole artifact is
  // byte-deterministic; hashes are unaffected.
  plan.generatedAt = iso(clock);
  return plan;
}

// ---- Approval artifact --------------------------------------------------------
function buildFixtureApproval(spec, plan, deps = {}) {
  const { clock, idFactory } = makeDeps(deps);
  const validation = validatePlan(plan);
  const readyActions = validation.readyActions || [];
  const readyCount = readyActions.length;
  const allowedModels = [...new Set(readyActions.map((a) => a.model))];
  const approval = {
    version: 1,
    approvalId: idFactory('approval', spec.scenario || 'A'),
    purpose: APPROVAL_PURPOSE,
    target: TARGET,
    planHash: plan.planHash,
    execHash: computePlanExecHash(plan),
    approvedBy: 'fixture-operator',
    approvedAt: iso(clock, -5 * 60 * 1000),
    expiresAt: iso(clock, 45 * 60 * 1000),
    allowedModels: allowedModels.length > 0 ? allowedModels : ['FacebookPage'],
    maxActions: readyCount,
    allowClassB: false,
    expectedDatabaseName: DATABASE_NAME,
    expectedEnvironmentClass: ENVIRONMENT_CLASS,
  };
  assertSanitized(approval);
  return approval;
}

// ---- Backup proof artifact (synthetic metadata; NO real dump) ------------------
function buildFixtureBackupProof(spec, deps = {}) {
  const { clock, idFactory } = makeDeps(deps);
  const proof = {
    version: 1,
    backupId: `fixture-backup-${idFactory('backup', spec.scenario || 'A').slice(0, 12)}`,
    target: TARGET,
    createdAt: iso(clock, -10 * 60 * 1000),
    artifactType: 'pg-dump',
    artifactPath: 'fixture-local-sanitized.dump',
    restoreProcedureRef: 'runbook://fixture/local/restore',
    databaseName: DATABASE_NAME,
    operator: 'fixture-operator',
  };
  assertSanitized(proof);
  return proof;
}

// ---- Target descriptor (sanitized; no connection material) ---------------------
function buildFixtureTargetDescriptor() {
  return {
    version: 1,
    target: TARGET,
    environmentClass: ENVIRONMENT_CLASS,
    hostClass: HOST_CLASS,
    databaseName: DATABASE_NAME,
    provider: PROVIDER,
  };
}

// ---- Cleanup manifest (descriptive only; NO executable SQL) ---------------------
function buildFixtureCleanupManifest(spec, plan) {
  const validation = validatePlan(plan);
  const readyActions = validation.readyActions || [];
  const createdEntityRefs = [
    { model: 'Tenant', recordId: spec.ids.tenantId },
    ...spec.entities.facebookPages.map((p) => ({ model: 'FacebookPage', recordId: p.id })),
    ...spec.entities.conversations.map((c) => ({ model: 'Conversation', recordId: c.id })),
    ...spec.entities.appointments.map((a) => ({ model: 'Appointment', recordId: a.id })),
  ];
  return {
    version: 1,
    fixtureId: spec.fixtureId,
    fixtureNamespace: FIXTURE_NAMESPACE,
    target: TARGET,
    createdEntityRefs,
    // Records the backfill would touch, and the owner to restore them to.
    expectedOriginalState: readyActions.map((a) => ({
      model: a.model,
      recordId: a.recordId,
      tenantId: a.oldTenantId ?? null,
    })),
    // Delete children before parents (Appointment -> Conversation -> FacebookPage -> Tenant).
    cleanupOrder: ['Appointment', 'Conversation', 'FacebookPage', 'Tenant'],
    verificationQueries: [
      'count Appointment where fixtureNamespace-owned == 0',
      'count Conversation where fixtureNamespace-owned == 0',
      'count FacebookPage where fixtureNamespace-owned == 0',
      'count Tenant where slug startsWith fixture- == 0',
    ],
    restoreFallback: 'runbook://fixture/local/restore',
    // Future Apply phase MUST: only delete fixture namespace, verify current
    // owner/state before delete, and stop on conflict. No cascade.
    cleanupPolicy: 'FIXTURE_NAMESPACE_ONLY_VERIFY_BEFORE_DELETE_STOP_ON_CONFLICT',
  };
}

// ---- Expected rollback contract ------------------------------------------------
function buildFixtureRollbackExpectation(spec, plan) {
  const validation = validatePlan(plan);
  const readyActions = validation.readyActions || [];
  return {
    version: 1,
    operationBinding: {
      planHashPresent: Boolean(plan.planHash),
      execHashPresent: Boolean(computePlanExecHash(plan)),
      target: TARGET,
    },
    expectations: readyActions.map((a) => ({
      model: a.model,
      recordId: a.recordId,
      restoreTenantId: a.oldTenantId ?? null,
    })),
    conflictPolicy: 'SKIP_ROLLBACK_CONFLICT_NO_OVERWRITE',
    untouchedGuarantee: 'RECORDS_OUTSIDE_MANIFEST_UNCHANGED',
    verifiedWith: 'mock-repository-only',
  };
}

// ---- Negative-scenario artifact helpers ---------------------------------------
// Deliberately-malformed plan carrying an unsupported model action.
function buildUnsupportedModelPlan(spec, deps = {}) {
  const plan = buildFixturePlan(spec, deps);
  const action = {
    model: 'Message',
    recordId: spec.ids.conversationId,
    oldTenantId: null,
    newTenantId: spec.ids.tenantId,
    status: STATUS.READY,
    mappingSource: 'fixture',
    evidence: ['fixture'],
  };
  return { ...plan, actions: [...plan.actions, action] };
}

// Plan carrying a duplicated action key (same model:recordId).
function buildDuplicateActionPlan(spec, deps = {}) {
  const plan = buildFixturePlan(spec, deps);
  const ready = (validatePlan(plan).readyActions || [])[0];
  if (!ready) return plan;
  return { ...plan, actions: [...plan.actions, { ...ready }] };
}

// A mock repository whose current owner differs from the READY action's
// oldTenantId, forcing SKIP_WRITE_CONFLICT at apply time.
function buildConflictRepository(spec, plan) {
  const ready = (validatePlan(plan).readyActions || []);
  const repo = createMockRepository({ tenants: ready.map((a) => a.newTenantId) });
  for (const action of ready) {
    // Set a foreign current owner so current !== oldTenantId (null).
    repo._setOwner(action.model, action.recordId, spec.ids.tenantId);
  }
  return repo;
}

// ---- Full bundle --------------------------------------------------------------
function buildScenarioArtifacts(scenario, deps) {
  const spec = buildFixtureSpec({ ...deps, scenario });
  const plan = buildFixturePlan(spec, deps);
  const validation = validatePlan(plan);
  const readyCount = (validation.readyActions || []).length;
  const artifacts = {
    scenario,
    spec,
    mapping: buildStrictMappingArtifact(spec),
    candidateSnapshot: buildFixtureCandidateSnapshot(spec),
    plan,
    planHash: plan.planHash,
    execHash: computePlanExecHash(plan),
    approval: buildFixtureApproval(spec, plan, deps),
    backupProof: buildFixtureBackupProof(spec, deps),
    targetDescriptor: buildFixtureTargetDescriptor(),
    cleanupManifest: buildFixtureCleanupManifest(spec, plan),
    rollbackExpectation: buildFixtureRollbackExpectation(spec, plan),
    expected: {
      readyCount,
      statuses: plan.summary.byStatus,
      models: Object.keys(plan.summary.byModel),
    },
  };
  return artifacts;
}

function buildFixtureBundle(options = {}) {
  const deps = makeDeps(options);
  const identity = buildFixtureIdentity(options);
  const scenarios = {};
  for (const scenario of ['A', 'B']) {
    scenarios[scenario] = buildScenarioArtifacts(scenario, deps);
  }
  const bundle = {
    version: 1,
    identity,
    scenarios,
    liveLocks: { LIVE_ENTRYPOINT_ENABLED: false, LIVE_WRITE_ENABLED: false },
  };
  // Bundle contains schema-faithful entities (fbUserId), so only secrets are
  // globally forbidden here; protocol artifacts were fully sanitized at build.
  assertNoSecrets(bundle);
  return deepFreeze(bundle);
}

// ---- Safe summary / logger redaction ------------------------------------------
const SAFE_LOG_KEYS = new Set([
  'fixtureId', 'scenario', 'model', 'count', 'status', 'hashPrefix', 'target',
  'ok', 'readyCount', 'exists',
]);

function sanitizeFixtureLogMeta(meta = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!SAFE_LOG_KEYS.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

function summarizeFixtureBundle(bundle) {
  const hashPrefix = (value) => String(value || '').slice(0, 12);
  return {
    fixtureId: bundle.identity.fixtureId,
    target: bundle.identity.target,
    schemaFingerprintPrefix: hashPrefix(bundle.identity.schemaFingerprint),
    scenarios: Object.keys(bundle.scenarios).map((key) => ({
      scenario: key,
      readyCount: bundle.scenarios[key].expected.readyCount,
      planHashPrefix: hashPrefix(bundle.scenarios[key].planHash),
      execHashPrefix: hashPrefix(bundle.scenarios[key].execHash),
      models: bundle.scenarios[key].expected.models,
    })),
    liveLocks: bundle.liveLocks,
  };
}

// ---- File-output helper (returns a string ONLY; never chooses a path) ----------
function serializeFixtureArtifact(artifact) {
  // Strict JSON, UTF-8, no BOM. Caller decides where (if anywhere) to write.
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

module.exports = {
  DEFAULT_PURPOSE,
  FIXTURE_NAMESPACE,
  TARGET,
  DATABASE_NAME,
  ENVIRONMENT_CLASS,
  HOST_CLASS,
  PROVIDER,
  APPROVAL_PURPOSE,
  SCHEMA_SURFACE,
  SCENARIOS,
  FIXTURE_CODE,
  SUPPORTED_MODELS,
  buildFixtureIdentity,
  buildFixtureSpec,
  validateFixtureSpec,
  buildFixtureCandidateSnapshot,
  buildStrictMappingArtifact,
  buildFixturePlan,
  buildFixtureApproval,
  buildFixtureBackupProof,
  buildFixtureTargetDescriptor,
  buildFixtureCleanupManifest,
  buildFixtureRollbackExpectation,
  buildUnsupportedModelPlan,
  buildDuplicateActionPlan,
  buildConflictRepository,
  buildFixtureBundle,
  summarizeFixtureBundle,
  sanitizeFixtureLogMeta,
  serializeFixtureArtifact,
};
