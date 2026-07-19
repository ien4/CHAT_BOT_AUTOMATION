'use strict';

// LOCAL-E2E-FIXTURE-INSTALLER-DESIGN-01
// Locked, idempotent, manifest-scoped sanitized fixture installer.
//
// This module MODELS installation + cleanup of a fixture bundle produced by
// tenant-backfill-fixture-blueprint, but CANNOT activate database mutation:
//   - it never imports PrismaClient,
//   - it never reads DATABASE_URL / .env / process.env,
//   - it never performs a network call,
//   - it never constructs a live repository (there is none in this phase),
//   - it operates ONLY on a caller-injected repository (mock in this phase).
//
// The tenant-backfill-prisma-adapter is intentionally NOT reused: that adapter
// performs ownership transitions (updateMany), not fixture seeding.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

// Installer-specific lock. Independent of the two tenant-backfill live locks.
// Never read from env, never settable, no CLI override. Gates construction of a
// live installer repository — which does not exist in this design phase.
const FIXTURE_INSTALL_ENABLED = false;

const INSTALLER_LOCKS = Object.freeze({
  FIXTURE_INSTALL_ENABLED,
  LIVE_ENTRYPOINT_ENABLED: false,
  LIVE_WRITE_ENABLED: false,
});

// Create order derived from backend/prisma/schema.prisma foreign keys:
//   FacebookPage.tenantId -> Tenant, Conversation.tenantId -> Tenant,
//   Appointment.conversationId -> Conversation, Appointment.tenantId -> Tenant.
// Parents first; cleanup is the exact reverse.
const CREATE_ORDER = Object.freeze(['Tenant', 'FacebookPage', 'Conversation', 'Appointment']);
const CLEANUP_ORDER = Object.freeze([...CREATE_ORDER].reverse());

const REQUIRED_ENVIRONMENT_CLASS = 'LOCAL';
const REQUIRED_HOST_CLASS = 'LOCAL_LOOPBACK';
const REQUIRED_PURPOSE = 'tenant-backfill-local-e2e';
const DEFAULT_MAX_BACKUP_AGE_HOURS = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET_KEY_RE = /(secret|token|databaseurl|connectionstring|accesstoken|verifytoken|appsecret|password|apikey|privatekey)/i;

const INSTALLATION_CODE = Object.freeze({
  REQUEST_INVALID: 'REQUEST_INVALID',
  REPOSITORY_REQUIRED: 'REPOSITORY_REQUIRED',
  TARGET_CONFIRMED: 'TARGET_CONFIRMED',
  TARGET_CONFIRMATION_FAILED: 'TARGET_CONFIRMATION_FAILED',
  BLOCKED_PRODUCTION_TARGET: 'BLOCKED_PRODUCTION_TARGET',
  BLOCKED_BACKUP_PROOF_MISSING: 'BLOCKED_BACKUP_PROOF_MISSING',
  BLOCKED_BACKUP_PROOF_STALE: 'BLOCKED_BACKUP_PROOF_STALE',
  BLOCKED_BACKUP_PROOF_HASH_MISMATCH: 'BLOCKED_BACKUP_PROOF_HASH_MISMATCH',
  BUNDLE_OK: 'BUNDLE_OK',
  BUNDLE_INVALID: 'BUNDLE_INVALID',
  BUNDLE_HASH_MISMATCH: 'BUNDLE_HASH_MISMATCH',
  SCHEMA_FINGERPRINT_MISMATCH: 'SCHEMA_FINGERPRINT_MISMATCH',
  INSTALLATION_READY: 'INSTALLATION_READY',
  FIXTURE_ALREADY_INSTALLED: 'FIXTURE_ALREADY_INSTALLED',
  FIXTURE_ID_COLLISION: 'FIXTURE_ID_COLLISION',
  PARTIAL_FIXTURE_STATE_DETECTED: 'PARTIAL_FIXTURE_STATE_DETECTED',
  INSTALLATION_COMPLETED: 'INSTALLATION_COMPLETED',
  INSTALLATION_FAILED_NO_MUTATION: 'INSTALLATION_FAILED_NO_MUTATION',
  INSTALLATION_RECOVERY_REQUIRED: 'INSTALLATION_RECOVERY_REQUIRED',
  CLEANUP_COMPLETED: 'CLEANUP_COMPLETED',
  CLEANUP_CONFLICT: 'CLEANUP_CONFLICT',
  CLEANUP_RECOVERY_REQUIRED: 'CLEANUP_RECOVERY_REQUIRED',
  CLEANUP_ALREADY_COMPLETED: 'CLEANUP_ALREADY_COMPLETED',
  FIXTURE_NOT_INSTALLED: 'FIXTURE_NOT_INSTALLED',
  INSTALLATION_JOURNAL_CORRUPTED: 'INSTALLATION_JOURNAL_CORRUPTED',
});

const RECOVERY_STATE = Object.freeze({
  CLEAN_NOT_STARTED: 'CLEAN_NOT_STARTED',
  PREPARED_NO_CREATE: 'PREPARED_NO_CREATE',
  PARTIALLY_INSTALLED: 'PARTIALLY_INSTALLED',
  FULLY_INSTALLED: 'FULLY_INSTALLED',
  INSTALLATION_MANIFEST_PENDING: 'INSTALLATION_MANIFEST_PENDING',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  INSTALLATION_JOURNAL_CORRUPTED: 'INSTALLATION_JOURNAL_CORRUPTED',
  CLEANUP_PARTIAL: 'CLEANUP_PARTIAL',
  CLEANUP_COMPLETED: 'CLEANUP_COMPLETED',
});

const JOURNAL_EVENT = Object.freeze({
  INSTALLATION_PREPARED: 'INSTALLATION_PREPARED',
  ENTITY_CREATE_PENDING: 'ENTITY_CREATE_PENDING',
  ENTITY_CREATED: 'ENTITY_CREATED',
  ENTITY_CREATE_FAILED: 'ENTITY_CREATE_FAILED',
  INSTALLATION_COMPLETED: 'INSTALLATION_COMPLETED',
  INSTALLATION_RECOVERY_REQUIRED: 'INSTALLATION_RECOVERY_REQUIRED',
  CLEANUP_PREPARED: 'CLEANUP_PREPARED',
  ENTITY_DELETE_PENDING: 'ENTITY_DELETE_PENDING',
  ENTITY_DELETED: 'ENTITY_DELETED',
  CLEANUP_COMPLETED: 'CLEANUP_COMPLETED',
});

const REPOSITORY_METHODS = Object.freeze({
  Tenant: { get: 'getTenantById', create: 'createTenant', delete: 'deleteTenant' },
  FacebookPage: { get: 'getFacebookPageById', create: 'createFacebookPage', delete: 'deleteFacebookPage' },
  Conversation: { get: 'getConversationById', create: 'createConversation', delete: 'deleteConversation' },
  Appointment: { get: 'getAppointmentById', create: 'createAppointment', delete: 'deleteAppointment' },
});

// ---- Deterministic primitives -------------------------------------------------
function defaultHashFunction(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function nowMs(clock) {
  if (typeof clock === 'function') {
    const value = clock();
    return typeof value === 'number' ? value : new Date(value).getTime();
  }
  return Date.now();
}

function hashPrefix(value) {
  return String(value || '').slice(0, 12);
}

function assertNoSecrets(value, pathPrefix = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${pathPrefix}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    if (SECRET_KEY_RE.test(key)) {
      const error = new Error(`INSTALLER_SECRET_KEY:${pathPrefix ? `${pathPrefix}.` : ''}${key}`);
      error.code = 'INSTALLER_SECRET_KEY';
      throw error;
    }
    assertNoSecrets(value[key], pathPrefix ? `${pathPrefix}.${key}` : key);
  }
}

// ---- Logger safety ------------------------------------------------------------
const SAFE_LOG_KEYS = new Set([
  'fixtureId', 'phase', 'model', 'sequence', 'count', 'status', 'safeErrorCode',
  'target', 'hashPrefix', 'ok', 'created', 'deleted', 'recoverable', 'requiresOperator',
]);

function sanitizeInstallerLogMeta(meta = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!SAFE_LOG_KEYS.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

function safeLog(logger, level, label, meta = {}) {
  if (!logger || typeof logger[level] !== 'function') return;
  logger[level](label, sanitizeInstallerLogMeta(meta));
}

// ---- Default filesystem port (durable append; scoped to a directory) ----------
function createDefaultFilesystem() {
  return {
    async mkdir(dirPath) { await fsp.mkdir(dirPath, { recursive: true }); },
    async pathExists(filePath) {
      try { await fsp.access(filePath, fs.constants.F_OK); return true; }
      catch (error) { if (error && error.code === 'ENOENT') return false; throw error; }
    },
    async appendLine(filePath, line) {
      let handle;
      try {
        handle = await fsp.open(filePath, 'a');
        await handle.write(line, 0, 'utf8');
        await handle.sync();
      } finally {
        if (handle) await handle.close();
      }
    },
    async writeJson(filePath, obj) {
      let handle;
      try {
        handle = await fsp.open(filePath, 'w');
        await handle.write(`${JSON.stringify(obj, null, 2)}\n`, 0, 'utf8');
        await handle.sync();
      } finally {
        if (handle) await handle.close();
      }
    },
    async readText(filePath) { return fsp.readFile(filePath, 'utf8'); },
  };
}

function normalizeFilesystem(filesystem) {
  return { ...createDefaultFilesystem(), ...(filesystem || {}) };
}

function installationPaths(installationDirectory, fixtureId) {
  const dir = path.join(installationDirectory, 'fixture-installations');
  return {
    dir,
    journalPath: path.join(dir, `${fixtureId}.installation.journal.jsonl`),
    manifestPath: path.join(dir, `${fixtureId}.installation-manifest.json`),
  };
}

// ---- Mock installer repository (the ONLY repository shipped in this phase) -----
function createMockInstallerRepository({ seed = [], failOn = null } = {}) {
  const stores = { Tenant: new Map(), FacebookPage: new Map(), Conversation: new Map(), Appointment: new Map() };
  for (const entry of seed) {
    stores[entry.model].set(entry.recordId, clone(entry.payload));
  }
  let createCalls = 0;
  let deleteCalls = 0;
  function shouldFail(model, recordId) {
    if (!failOn) return false;
    return failOn.model === model && (failOn.recordId == null || failOn.recordId === recordId);
  }
  function makeGet(model) {
    return async (id) => (stores[model].has(id) ? clone(stores[model].get(id)) : null);
  }
  function makeCreate(model) {
    return async (payload) => {
      createCalls += 1;
      if (shouldFail(model, payload && payload.id)) {
        const error = new Error('MOCK_CREATE_FAILED');
        error.code = 'MOCK_CREATE_FAILED';
        throw error;
      }
      if (stores[model].has(payload.id)) {
        const error = new Error('MOCK_UNIQUE_VIOLATION');
        error.code = 'MOCK_UNIQUE_VIOLATION';
        throw error;
      }
      stores[model].set(payload.id, clone(payload));
      return { id: payload.id };
    };
  }
  function makeDelete(model) {
    return async (id) => {
      deleteCalls += 1;
      if (shouldFail(model, id)) {
        const error = new Error('MOCK_DELETE_FAILED');
        error.code = 'MOCK_DELETE_FAILED';
        throw error;
      }
      const existed = stores[model].delete(id);
      return { deleted: existed ? 1 : 0 };
    };
  }
  return {
    getTenantById: makeGet('Tenant'),
    getFacebookPageById: makeGet('FacebookPage'),
    getConversationById: makeGet('Conversation'),
    getAppointmentById: makeGet('Appointment'),
    createTenant: makeCreate('Tenant'),
    createFacebookPage: makeCreate('FacebookPage'),
    createConversation: makeCreate('Conversation'),
    createAppointment: makeCreate('Appointment'),
    deleteTenant: makeDelete('Tenant'),
    deleteFacebookPage: makeDelete('FacebookPage'),
    deleteConversation: makeDelete('Conversation'),
    deleteAppointment: makeDelete('Appointment'),
    async disconnect() {},
    _counts() { return { createCalls, deleteCalls }; },
    _setRecord(model, id, payload) { stores[model].set(id, clone(payload)); },
    _snapshot() {
      return Object.fromEntries(Object.entries(stores).map(([model, map]) => [model, [...map.keys()]]));
    },
  };
}

// ---- Create payloads (schema-aware; non-secret required fields synthesized) ----
// NOTE: FacebookPage.accessToken is a required non-null column but is a SECRET;
// it is intentionally NOT part of a fixture payload. A future real apply must
// obtain it from a sealed installer-apply policy, never from the fixture bundle.
function buildCreatePayload(model, entity) {
  if (model === 'Tenant') {
    return { id: entity.id, slug: entity.slug, name: `Fixture Tenant ${entity.slug}`, isActive: entity.isActive !== false };
  }
  if (model === 'FacebookPage') {
    return { id: entity.id, pageId: entity.pageId, pageName: `Fixture Page ${entity.pageId}`, isActive: entity.isActive !== false, tenantId: entity.tenantId ?? null };
  }
  if (model === 'Conversation') {
    return { id: entity.id, fbUserId: entity.fbUserId, tenantId: entity.tenantId ?? null, context: entity.context ?? null, pageContext: entity.pageContext ?? null };
  }
  if (model === 'Appointment') {
    return { id: entity.id, conversationId: entity.conversationId, tenantId: entity.tenantId ?? null };
  }
  const error = new Error(`UNSUPPORTED_FIXTURE_MODEL:${model}`);
  error.code = 'UNSUPPORTED_FIXTURE_MODEL';
  throw error;
}

// ---- Request validation -------------------------------------------------------
function validateInstallationRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object') {
    return { ok: false, code: INSTALLATION_CODE.REQUEST_INVALID, errors: ['REQUEST_NOT_OBJECT'] };
  }
  if (!request.fixtureBundle || typeof request.fixtureBundle !== 'object') errors.push('FIXTURE_BUNDLE_REQUIRED');
  if (!request.targetDescriptor || typeof request.targetDescriptor !== 'object') errors.push('TARGET_DESCRIPTOR_REQUIRED');
  if (!request.backupProof || typeof request.backupProof !== 'object') errors.push('BACKUP_PROOF_REQUIRED');
  if (!request.confirmTarget || typeof request.confirmTarget !== 'string') errors.push('CONFIRM_TARGET_REQUIRED');
  if (!request.installationDirectory || typeof request.installationDirectory !== 'string') errors.push('INSTALLATION_DIRECTORY_REQUIRED');
  if (request.operatorConfirmation !== true) errors.push('OPERATOR_CONFIRMATION_REQUIRED');
  try { assertNoSecrets({ targetDescriptor: request.targetDescriptor, backupProof: request.backupProof }); }
  catch (error) { errors.push(error.code || 'INSTALLER_SECRET_KEY'); }
  return { ok: errors.length === 0, code: errors.length === 0 ? INSTALLATION_CODE.BUNDLE_OK : INSTALLATION_CODE.REQUEST_INVALID, errors };
}

// ---- Target gate --------------------------------------------------------------
function assertTargetGate({ confirmTarget, fixtureBundle, targetDescriptor, backupProof }) {
  const bundleTarget = fixtureBundle && fixtureBundle.identity && fixtureBundle.identity.target;
  const purpose = fixtureBundle && fixtureBundle.identity && fixtureBundle.identity.purpose;
  const targets = new Set([confirmTarget, bundleTarget, targetDescriptor && targetDescriptor.target, backupProof && backupProof.target].filter(Boolean));
  if (!confirmTarget || targets.size !== 1) {
    return { ok: false, code: INSTALLATION_CODE.TARGET_CONFIRMATION_FAILED, targetCount: targets.size };
  }
  const environmentClass = targetDescriptor && targetDescriptor.environmentClass;
  const hostClass = targetDescriptor && targetDescriptor.hostClass;
  if (environmentClass !== REQUIRED_ENVIRONMENT_CLASS || hostClass !== REQUIRED_HOST_CLASS) {
    return { ok: false, code: INSTALLATION_CODE.BLOCKED_PRODUCTION_TARGET, environmentClass, hostClass };
  }
  if (purpose !== REQUIRED_PURPOSE) {
    return { ok: false, code: INSTALLATION_CODE.TARGET_CONFIRMATION_FAILED, reason: 'PURPOSE_MISMATCH' };
  }
  return { ok: true, code: INSTALLATION_CODE.TARGET_CONFIRMED, target: confirmTarget };
}

// ---- Backup gate (synthetic/mock metadata in this phase) ----------------------
function assertBackupGate(backupProof, { clock = null, maxBackupAgeHours = DEFAULT_MAX_BACKUP_AGE_HOURS, expectedArtifactHash = null } = {}) {
  if (!backupProof || typeof backupProof !== 'object') {
    return { ok: false, code: INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_MISSING };
  }
  const required = ['backupId', 'target', 'createdAt', 'artifactType', 'restoreProcedureRef', 'databaseName', 'operator'];
  const missing = required.filter((key) => !backupProof[key]);
  if (!backupProof.artifactPath && !backupProof.snapshotId) missing.push('artifactPath|snapshotId');
  if (missing.length > 0) {
    return { ok: false, code: INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_MISSING, missing };
  }
  const createdMs = Date.parse(backupProof.createdAt);
  if (!Number.isFinite(createdMs)) return { ok: false, code: INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_MISSING, missing: ['createdAt'] };
  const ageMs = nowMs(clock) - createdMs;
  if (ageMs > maxBackupAgeHours * 60 * 60 * 1000) {
    return { ok: false, code: INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_STALE, ageHours: Math.round(ageMs / 3600000) };
  }
  if (expectedArtifactHash && backupProof.artifactHash && backupProof.artifactHash !== expectedArtifactHash) {
    return { ok: false, code: INSTALLATION_CODE.BLOCKED_BACKUP_PROOF_HASH_MISMATCH };
  }
  return { ok: true, code: 'BACKUP_PROOF_OK' };
}

// ---- Bundle validation --------------------------------------------------------
function computeBundleHash(bundle, hashFunction = defaultHashFunction) {
  return hashFunction(stableStringify(bundle));
}

function collectInstallableEntities(bundle) {
  // The installable set is the canonical happy-path scenario (A): the full
  // candidate fixture. Scenario B is a strict subset and is not installed.
  const scenario = bundle && bundle.scenarios && bundle.scenarios.A;
  const entities = (scenario && scenario.spec && scenario.spec.entities) || {};
  const byModel = {
    Tenant: entities.tenants || [],
    FacebookPage: entities.facebookPages || [],
    Conversation: entities.conversations || [],
    Appointment: entities.appointments || [],
  };
  return byModel;
}

function validateFixtureBundleForInstall(bundle, { expectedBundleHash = null, expectedSchemaFingerprint = null, hashFunction = defaultHashFunction } = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object' || !bundle.identity) {
    return { ok: false, code: INSTALLATION_CODE.BUNDLE_INVALID, errors: ['BUNDLE_NOT_OBJECT'] };
  }
  const identity = bundle.identity;
  if (bundle.version !== 1) errors.push('BUNDLE_VERSION_UNSUPPORTED');
  if (!identity.fixtureNamespace || !/^fixture[-_]/i.test(identity.fixtureNamespace)) errors.push('NAMESPACE_INVALID');
  if (identity.purpose !== REQUIRED_PURPOSE) errors.push('PURPOSE_INVALID');
  if (!identity.target) errors.push('TARGET_REQUIRED');
  if (!identity.schemaFingerprint) errors.push('SCHEMA_FINGERPRINT_REQUIRED');

  const byModel = collectInstallableEntities(bundle);
  const allIds = [];
  for (const model of CREATE_ORDER) {
    for (const entity of byModel[model]) {
      if (!UUID_RE.test(String(entity.id))) errors.push(`ID_NOT_DETERMINISTIC:${model}`);
      allIds.push(entity.id);
    }
  }
  if (new Set(allIds).size !== allIds.length) errors.push('DUPLICATE_ENTITY_IDS');
  try { assertNoSecrets({ scenarios: bundle.scenarios }); } catch (error) { errors.push(error.code || 'INSTALLER_SECRET_KEY'); }

  const bundleHash = computeBundleHash(bundle, hashFunction);
  if (expectedSchemaFingerprint && identity.schemaFingerprint !== expectedSchemaFingerprint) {
    return { ok: false, code: INSTALLATION_CODE.SCHEMA_FINGERPRINT_MISMATCH, bundleHash, errors };
  }
  if (expectedBundleHash && bundleHash !== expectedBundleHash) {
    return { ok: false, code: INSTALLATION_CODE.BUNDLE_HASH_MISMATCH, bundleHash, errors };
  }
  if (errors.length > 0) {
    return { ok: false, code: INSTALLATION_CODE.BUNDLE_INVALID, bundleHash, errors };
  }
  const expectedCounts = Object.fromEntries(CREATE_ORDER.map((model) => [model, byModel[model].length]));
  return { ok: true, code: INSTALLATION_CODE.BUNDLE_OK, bundleHash, expectedCounts };
}

// ---- Installation plan --------------------------------------------------------
function buildFixtureInstallationPlan(bundle, { clock = null, hashFunction = defaultHashFunction } = {}) {
  const validation = validateFixtureBundleForInstall(bundle, { hashFunction });
  if (!validation.ok) {
    return { ok: false, code: validation.code, errors: validation.errors };
  }
  const identity = bundle.identity;
  const byModel = collectInstallableEntities(bundle);
  const entities = [];
  let sequence = 0;
  for (const model of CREATE_ORDER) {
    for (const entity of byModel[model]) {
      sequence += 1;
      const payload = buildCreatePayload(model, entity);
      assertNoSecrets(payload);
      entities.push({
        model,
        recordId: entity.id,
        sequence,
        payload,
        expectedStateHash: hashFunction(stableStringify(payload)),
      });
    }
  }
  const operationId = hashFunction(stableStringify({ fixtureId: identity.fixtureId, bundleHash: validation.bundleHash, target: identity.target }));
  return {
    ok: true,
    code: INSTALLATION_CODE.BUNDLE_OK,
    version: 1,
    operationId,
    fixtureId: identity.fixtureId,
    target: identity.target,
    bundleHash: validation.bundleHash,
    schemaFingerprint: identity.schemaFingerprint,
    expectedCounts: validation.expectedCounts,
    createOrder: [...CREATE_ORDER],
    cleanupOrder: [...CLEANUP_ORDER],
    entities,
  };
}

// ---- Repository access --------------------------------------------------------
function repoGet(repository, model, recordId) {
  const method = REPOSITORY_METHODS[model].get;
  if (typeof repository[method] !== 'function') {
    const error = new Error(`REPOSITORY_METHOD_MISSING:${method}`);
    error.code = INSTALLATION_CODE.REPOSITORY_REQUIRED;
    throw error;
  }
  return repository[method](recordId);
}

function currentStateHash(record, hashFunction) {
  return record ? hashFunction(stableStringify(record)) : null;
}

// ---- Preflight collision scan (exact-ID only; no broad scan) -------------------
async function preflightFixtureInstallation({ plan, repository, hashFunction = defaultHashFunction }) {
  if (!repository) return { ok: false, code: INSTALLATION_CODE.REPOSITORY_REQUIRED };
  const existing = [];
  const missing = [];
  let collision = false;
  for (const entity of plan.entities) {
    const record = await repoGet(repository, entity.model, entity.recordId);
    if (!record) {
      missing.push({ model: entity.model, recordId: entity.recordId });
      continue;
    }
    const matches = currentStateHash(record, hashFunction) === entity.expectedStateHash;
    existing.push({ model: entity.model, recordId: entity.recordId, matches });
    if (!matches) collision = true;
  }
  if (existing.length === 0) {
    return { ok: true, code: INSTALLATION_CODE.INSTALLATION_READY, existing, missing };
  }
  if (missing.length === 0 && !collision) {
    return { ok: true, code: INSTALLATION_CODE.FIXTURE_ALREADY_INSTALLED, existing, missing };
  }
  if (collision && missing.length === 0) {
    return { ok: false, code: INSTALLATION_CODE.FIXTURE_ID_COLLISION, existing, missing };
  }
  return { ok: false, code: INSTALLATION_CODE.PARTIAL_FIXTURE_STATE_DETECTED, existing, missing };
}

// ---- Journal / manifest helpers ----------------------------------------------
function journalEvent(operationId, fixtureId, eventType, payload = {}) {
  return { version: 1, operationId, fixtureId, eventType, ...payload };
}

async function appendJournal(filesystem, journalPath, event, clock) {
  const line = `${stableStringify({ ...event, timestamp: new Date(nowMs(clock)).toISOString() })}\n`;
  await filesystem.appendLine(journalPath, line);
}

function parseJournal(content) {
  if (!content) return [];
  if (!content.endsWith('\n')) {
    const error = new Error('INSTALLATION_JOURNAL_CORRUPTED');
    error.code = INSTALLATION_CODE.INSTALLATION_JOURNAL_CORRUPTED;
    throw error;
  }
  return content.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); }
    catch (_) {
      const error = new Error('INSTALLATION_JOURNAL_CORRUPTED');
      error.code = INSTALLATION_CODE.INSTALLATION_JOURNAL_CORRUPTED;
      throw error;
    }
  });
}

// ---- Install ------------------------------------------------------------------
async function installFixtureBundle(request, {
  repository = null,
  filesystem = null,
  clock = null,
  logger = null,
  hashFunction = defaultHashFunction,
} = {}) {
  const requestCheck = validateInstallationRequest(request);
  if (!requestCheck.ok) {
    return { ok: false, code: INSTALLATION_CODE.REQUEST_INVALID, phase: 'REQUEST', errors: requestCheck.errors };
  }
  if (!repository) {
    // No live installer repository exists in this phase; one must be injected.
    return { ok: false, code: INSTALLATION_CODE.REPOSITORY_REQUIRED, phase: 'REQUEST' };
  }
  const fsPort = normalizeFilesystem(filesystem);
  const { fixtureBundle, targetDescriptor, backupProof, confirmTarget } = request;

  const targetGate = assertTargetGate({ confirmTarget, fixtureBundle, targetDescriptor, backupProof });
  if (!targetGate.ok) return { ok: false, code: targetGate.code, phase: 'TARGET' };

  const backupGate = assertBackupGate(backupProof, { clock, maxBackupAgeHours: request.maxBackupAgeHours, expectedArtifactHash: request.expectedArtifactHash });
  if (!backupGate.ok) return { ok: false, code: backupGate.code, phase: 'BACKUP' };

  const bundleCheck = validateFixtureBundleForInstall(fixtureBundle, {
    expectedBundleHash: request.expectedBundleHash || null,
    expectedSchemaFingerprint: request.expectedSchemaFingerprint || null,
    hashFunction,
  });
  if (!bundleCheck.ok) return { ok: false, code: bundleCheck.code, phase: 'BUNDLE', errors: bundleCheck.errors };

  const plan = buildFixtureInstallationPlan(fixtureBundle, { clock, hashFunction });
  if (!plan.ok) return { ok: false, code: plan.code, phase: 'PLAN', errors: plan.errors };

  // FULL-bundle preflight BEFORE any create.
  const preflight = await preflightFixtureInstallation({ plan, repository, hashFunction });
  if (preflight.code !== INSTALLATION_CODE.INSTALLATION_READY) {
    safeLog(logger, 'info', 'fixture_install_preflight', { fixtureId: plan.fixtureId, status: preflight.code, phase: 'PREFLIGHT' });
    return {
      ok: preflight.code === INSTALLATION_CODE.FIXTURE_ALREADY_INSTALLED,
      code: preflight.code,
      phase: 'PREFLIGHT',
      requiresOperator: preflight.code === INSTALLATION_CODE.FIXTURE_ID_COLLISION || preflight.code === INSTALLATION_CODE.PARTIAL_FIXTURE_STATE_DETECTED,
      createdCount: 0,
    };
  }

  const paths = installationPaths(request.installationDirectory, plan.fixtureId);
  await fsPort.mkdir(paths.dir);
  await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.INSTALLATION_PREPARED, {
    bundleHash: plan.bundleHash, expectedCounts: plan.expectedCounts,
  }), clock);

  const createdEntities = [];
  for (const entity of plan.entities) {
    // Durable ENTITY_CREATE_PENDING BEFORE the repository call.
    await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.ENTITY_CREATE_PENDING, {
      model: entity.model, sequence: entity.sequence, entityIdHash: hashFunction(entity.recordId),
    }), clock);
    try {
      await repository[REPOSITORY_METHODS[entity.model].create](clone(entity.payload));
    } catch (error) {
      await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.ENTITY_CREATE_FAILED, {
        model: entity.model, sequence: entity.sequence, safeErrorCode: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'CREATE_FAILED',
      }), clock);
      if (createdEntities.length === 0) {
        safeLog(logger, 'warn', 'fixture_install_failed', { fixtureId: plan.fixtureId, status: INSTALLATION_CODE.INSTALLATION_FAILED_NO_MUTATION, phase: 'CREATE' });
        return { ok: false, code: INSTALLATION_CODE.INSTALLATION_FAILED_NO_MUTATION, phase: 'CREATE', createdCount: 0 };
      }
      await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.INSTALLATION_RECOVERY_REQUIRED, {
        count: createdEntities.length,
      }), clock);
      safeLog(logger, 'warn', 'fixture_install_recovery', { fixtureId: plan.fixtureId, status: INSTALLATION_CODE.INSTALLATION_RECOVERY_REQUIRED, phase: 'RECOVERY', count: createdEntities.length });
      // No auto-cleanup, no auto-retry: hand to operator.
      return { ok: false, code: INSTALLATION_CODE.INSTALLATION_RECOVERY_REQUIRED, phase: 'RECOVERY', createdCount: createdEntities.length, requiresOperator: true };
    }
    await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.ENTITY_CREATED, {
      model: entity.model, sequence: entity.sequence,
    }), clock);
    createdEntities.push({
      model: entity.model,
      entityIdHash: hashFunction(entity.recordId),
      expectedStateHash: entity.expectedStateHash,
      sequence: entity.sequence,
      repositoryResult: 'CREATED',
      createdAt: new Date(nowMs(clock)).toISOString(),
    });
  }

  await appendJournal(fsPort, paths.journalPath, journalEvent(plan.operationId, plan.fixtureId, JOURNAL_EVENT.INSTALLATION_COMPLETED, {
    count: createdEntities.length,
  }), clock);

  const manifest = {
    version: 1,
    fixtureId: plan.fixtureId,
    operationId: plan.operationId,
    target: plan.target,
    bundleHash: plan.bundleHash,
    schemaFingerprint: plan.schemaFingerprint,
    createdAt: new Date(nowMs(clock)).toISOString(),
    completedAt: new Date(nowMs(clock)).toISOString(),
    status: INSTALLATION_CODE.INSTALLATION_COMPLETED,
    createOrder: plan.createOrder,
    cleanupOrder: plan.cleanupOrder,
    entities: createdEntities,
  };
  assertNoSecrets(manifest);
  await fsPort.writeJson(paths.manifestPath, manifest);

  safeLog(logger, 'info', 'fixture_install_completed', { fixtureId: plan.fixtureId, status: INSTALLATION_CODE.INSTALLATION_COMPLETED, phase: 'COMPLETION', count: createdEntities.length });
  return { ok: true, code: INSTALLATION_CODE.INSTALLATION_COMPLETED, phase: 'COMPLETION', createdCount: createdEntities.length, manifest, manifestPath: paths.manifestPath };
}

// ---- Inspect / recovery classification ----------------------------------------
async function inspectFixtureInstallation({ fixtureId, installationDirectory, filesystem = null }) {
  const fsPort = normalizeFilesystem(filesystem);
  const paths = installationPaths(installationDirectory, fixtureId);
  let events = [];
  let journalCorrupted = false;
  if (await fsPort.pathExists(paths.journalPath)) {
    try { events = parseJournal(await fsPort.readText(paths.journalPath)); }
    catch (_) { journalCorrupted = true; }
  }
  const manifestExists = await fsPort.pathExists(paths.manifestPath);
  const state = classifyFixtureRecoveryState({ events, manifestExists, journalCorrupted });
  return {
    ok: !journalCorrupted,
    fixtureId,
    state,
    eventCount: events.length,
    manifestExists,
    journalCorrupted,
  };
}

function classifyFixtureRecoveryState({ events = [], manifestExists = false, journalCorrupted = false } = {}) {
  if (journalCorrupted) return RECOVERY_STATE.INSTALLATION_JOURNAL_CORRUPTED;
  const types = events.map((event) => event.eventType);
  if (events.length === 0) return RECOVERY_STATE.CLEAN_NOT_STARTED;
  if (types.includes(JOURNAL_EVENT.CLEANUP_COMPLETED)) return RECOVERY_STATE.CLEANUP_COMPLETED;
  if (types.includes(JOURNAL_EVENT.ENTITY_DELETED) && !types.includes(JOURNAL_EVENT.CLEANUP_COMPLETED)) return RECOVERY_STATE.CLEANUP_PARTIAL;
  if (types.includes(JOURNAL_EVENT.INSTALLATION_RECOVERY_REQUIRED)) return RECOVERY_STATE.RECOVERY_REQUIRED;
  if (types.includes(JOURNAL_EVENT.INSTALLATION_COMPLETED)) {
    return manifestExists ? RECOVERY_STATE.FULLY_INSTALLED : RECOVERY_STATE.INSTALLATION_MANIFEST_PENDING;
  }
  const created = types.filter((t) => t === JOURNAL_EVENT.ENTITY_CREATED).length;
  if (created > 0) return RECOVERY_STATE.PARTIALLY_INSTALLED;
  if (types.includes(JOURNAL_EVENT.INSTALLATION_PREPARED)) return RECOVERY_STATE.PREPARED_NO_CREATE;
  return RECOVERY_STATE.PREPARED_NO_CREATE;
}

// ---- Cleanup (manifest-scoped only) -------------------------------------------
async function cleanupFixtureInstallation(request, {
  repository = null,
  filesystem = null,
  clock = null,
  logger = null,
  hashFunction = defaultHashFunction,
} = {}) {
  if (!repository) return { ok: false, code: INSTALLATION_CODE.REPOSITORY_REQUIRED, phase: 'REQUEST' };
  if (request.allowCleanup !== true) return { ok: false, code: INSTALLATION_CODE.REQUEST_INVALID, phase: 'REQUEST', errors: ['CLEANUP_NOT_AUTHORIZED'] };
  const fsPort = normalizeFilesystem(filesystem);
  const fixtureId = request.fixtureId || (request.fixtureBundle && request.fixtureBundle.identity && request.fixtureBundle.identity.fixtureId);
  if (!fixtureId) return { ok: false, code: INSTALLATION_CODE.REQUEST_INVALID, phase: 'REQUEST', errors: ['FIXTURE_ID_REQUIRED'] };
  const paths = installationPaths(request.installationDirectory, fixtureId);

  if (!(await fsPort.pathExists(paths.manifestPath))) {
    return { ok: false, code: INSTALLATION_CODE.FIXTURE_NOT_INSTALLED, phase: 'CLEANUP' };
  }
  let manifest;
  try { manifest = JSON.parse(await fsPort.readText(paths.manifestPath)); }
  catch (_) { return { ok: false, code: INSTALLATION_CODE.INSTALLATION_JOURNAL_CORRUPTED, phase: 'CLEANUP' }; }
  if (manifest.status === INSTALLATION_CODE.CLEANUP_COMPLETED) {
    return { ok: true, code: INSTALLATION_CODE.CLEANUP_ALREADY_COMPLETED, phase: 'CLEANUP', deletedCount: 0 };
  }

  await appendJournal(fsPort, paths.journalPath, journalEvent(manifest.operationId, fixtureId, JOURNAL_EVENT.CLEANUP_PREPARED, {
    count: manifest.entities.length,
  }), clock);

  // Delete strictly in the manifest's cleanup order, ONLY manifest entities.
  const orderedEntities = [];
  for (const model of manifest.cleanupOrder) {
    for (const entity of manifest.entities.filter((e) => e.model === model)) orderedEntities.push(entity);
  }

  let deleted = 0;
  for (const entity of orderedEntities) {
    // Resolve the concrete record id from the plan-equivalent; the manifest only
    // stores entityIdHash, so cleanup requires the caller-supplied plan for ids.
    const planEntity = (request.plan && request.plan.entities || []).find((p) => hashFunction(p.recordId) === entity.entityIdHash);
    if (!planEntity) {
      await appendJournal(fsPort, paths.journalPath, journalEvent(manifest.operationId, fixtureId, JOURNAL_EVENT.ENTITY_DELETE_PENDING, { model: entity.model, sequence: entity.sequence, status: 'PLAN_ID_MISSING' }), clock);
      return { ok: false, code: INSTALLATION_CODE.CLEANUP_CONFLICT, phase: 'CLEANUP', deletedCount: deleted, requiresOperator: true };
    }
    await appendJournal(fsPort, paths.journalPath, journalEvent(manifest.operationId, fixtureId, JOURNAL_EVENT.ENTITY_DELETE_PENDING, { model: entity.model, sequence: entity.sequence }), clock);
    // Verify exact ID + namespace + expected state before delete.
    const record = await repoGet(repository, entity.model, planEntity.recordId);
    if (!record || currentStateHash(record, hashFunction) !== entity.expectedStateHash) {
      safeLog(logger, 'warn', 'fixture_cleanup_conflict', { fixtureId, model: entity.model, status: INSTALLATION_CODE.CLEANUP_CONFLICT, phase: 'CLEANUP' });
      return { ok: false, code: INSTALLATION_CODE.CLEANUP_CONFLICT, phase: 'CLEANUP', deletedCount: deleted, requiresOperator: true };
    }
    try {
      await repository[REPOSITORY_METHODS[entity.model].delete](planEntity.recordId);
    } catch (error) {
      return { ok: false, code: INSTALLATION_CODE.CLEANUP_RECOVERY_REQUIRED, phase: 'CLEANUP', deletedCount: deleted, requiresOperator: true };
    }
    deleted += 1;
    await appendJournal(fsPort, paths.journalPath, journalEvent(manifest.operationId, fixtureId, JOURNAL_EVENT.ENTITY_DELETED, { model: entity.model, sequence: entity.sequence }), clock);
  }

  if (deleted !== manifest.entities.length) {
    return { ok: false, code: INSTALLATION_CODE.CLEANUP_RECOVERY_REQUIRED, phase: 'CLEANUP', deletedCount: deleted, requiresOperator: true };
  }
  await appendJournal(fsPort, paths.journalPath, journalEvent(manifest.operationId, fixtureId, JOURNAL_EVENT.CLEANUP_COMPLETED, { count: deleted }), clock);
  await fsPort.writeJson(paths.manifestPath, { ...manifest, status: INSTALLATION_CODE.CLEANUP_COMPLETED, cleanupCompletedAt: new Date(nowMs(clock)).toISOString() });
  safeLog(logger, 'info', 'fixture_cleanup_completed', { fixtureId, status: INSTALLATION_CODE.CLEANUP_COMPLETED, phase: 'CLEANUP', count: deleted });
  return { ok: true, code: INSTALLATION_CODE.CLEANUP_COMPLETED, phase: 'CLEANUP', deletedCount: deleted };
}

module.exports = {
  FIXTURE_INSTALL_ENABLED,
  INSTALLER_LOCKS,
  INSTALLATION_CODE,
  RECOVERY_STATE,
  JOURNAL_EVENT,
  CREATE_ORDER,
  CLEANUP_ORDER,
  REPOSITORY_METHODS,
  computeBundleHash,
  buildCreatePayload,
  validateInstallationRequest,
  assertTargetGate,
  assertBackupGate,
  validateFixtureBundleForInstall,
  buildFixtureInstallationPlan,
  preflightFixtureInstallation,
  installFixtureBundle,
  inspectFixtureInstallation,
  classifyFixtureRecoveryState,
  cleanupFixtureInstallation,
  sanitizeInstallerLogMeta,
  createMockInstallerRepository,
};
