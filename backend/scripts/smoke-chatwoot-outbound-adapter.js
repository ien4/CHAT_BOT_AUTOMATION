'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const adapterModule = require('../src/webhook/chatwootOutboundAdapter');
const receiptModule = require('../src/webhook/chatwootOutboundReceiptRepository');
const runtimeRepositories = require('../src/webhook/chatwootRuntimeRepositories');

const {
  createChatwootOutboundAdapter,
  deriveOutboundCommandKey,
  hashContent,
  normalizeApiOrigin,
  validateSuccessResponse,
  ERROR_CODE,
} = adapterModule;
const {
  createChatwootOutboundReceiptRepository,
  RECEIPT_STATUS,
  RESERVE_RESULT,
  CLAIM_RESULT,
  DEFAULT_RETRYABLE_SAFE_ERROR_CODES,
} = receiptModule;

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_ROOT = path.join(BACKEND_ROOT, 'prisma');
const MIGRATIONS_ROOT = path.join(PRISMA_ROOT, 'migrations');
const WORK_ROOT = path.join(PROJECT_ROOT, 'tmp-runtime', 'chatwoot-outbound-adapter-implementation-01');
const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';
const DB_NAME = 'rehearsal_chatbot';
const DB_USER = 'rehearsal_user';
const PURPOSE = 'chatwoot-outbound-adapter-implementation-01';
const PREFIX = 'out-adapter-smoke-';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function assertEphemeralTarget() {
  const url = process.env.DATABASE_URL || '';
  if (!/@127\.0\.0\.1:\d+\//.test(url)) fail('REHEARSAL_DB_NOT_LOCALHOST');
  if (!/\/rehearsal_chatbot(\?|$)/.test(url)) fail('REHEARSAL_DB_NAME_MISMATCH');
  if (!process.env.CHATWOOT_OUTBOUND_REHEARSAL_CONTAINER_ID) fail('REHEARSAL_OWNERSHIP_PROOF_MISSING');
  if (/postgres:5432|:5433\/|staging|prod/i.test(url)) fail('REHEARSAL_DB_LOOKS_NON_EPHEMERAL');
}

function prismaCommand(args) {
  const cli = path.join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(cli)) fail('STOP_STATIC_VALIDATION_FAILED');
  return { file: process.execPath, args: [cli].concat(args) };
}

function runCaptured(file, args, opts) {
  const options = opts || {};
  const res = spawnSync(file, args, {
    cwd: options.cwd || BACKEND_ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs || 120000,
    windowsHide: true,
  });
  if (res.error) {
    const e = new Error((options.code || 'COMMAND_FAILED') + ': ' + res.error.message);
    e.status = null;
    throw e;
  }
  if (res.status !== 0) {
    const e = new Error(options.code || 'COMMAND_FAILED');
    e.status = res.status;
    throw e;
  }
  return { stdout: res.stdout || '', stderr: res.stderr || '' };
}

function runAllowFail(file, args, opts) {
  const options = opts || {};
  const res = spawnSync(file, args, {
    cwd: options.cwd || BACKEND_ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs || 30000,
    windowsHide: true,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', error: res.error || null };
}

function runDocker(args, opts) {
  return runCaptured('docker', args, Object.assign({ code: 'STOP_EPHEMERAL_DB_ENV_UNAVAILABLE', timeoutMs: 120000 }, opts || {}));
}

function runDockerAllowFail(args, opts) {
  return runAllowFail('docker', args, Object.assign({ timeoutMs: 60000 }, opts || {}));
}

function assertSafeWorkRoot() {
  const resolved = path.resolve(WORK_ROOT);
  const expectedRoot = path.resolve(PROJECT_ROOT, 'tmp-runtime') + path.sep;
  if (!resolved.startsWith(expectedRoot)) fail('STOP_OUTBOUND_SMOKE_WORKDIR_UNSAFE');
  return resolved;
}

function prepareMigrationMirror() {
  const root = assertSafeWorkRoot();
  fs.rmSync(root, { recursive: true, force: true });
  const prismaDir = path.join(root, 'prisma-fresh');
  const migrationsDir = path.join(prismaDir, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.copyFileSync(path.join(PRISMA_ROOT, 'schema.prisma'), path.join(prismaDir, 'schema.prisma'));
  fs.copyFileSync(path.join(MIGRATIONS_ROOT, 'migration_lock.toml'), path.join(migrationsDir, 'migration_lock.toml'));
  const migrations = fs.readdirSync(MIGRATIONS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^\d{14}_[A-Za-z0-9_]+$/.test(name))
    .filter((name) => fs.existsSync(path.join(MIGRATIONS_ROOT, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b));
  for (const name of migrations) fs.cpSync(path.join(MIGRATIONS_ROOT, name), path.join(migrationsDir, name), { recursive: true });
  return { root, prismaDir, schemaPath: path.join(prismaDir, 'schema.prisma'), migrationCount: migrations.length };
}

function prismaEnv(databaseUrl, containerName) {
  const env = Object.assign({}, process.env, {
    DATABASE_URL: databaseUrl,
    CHATWOOT_OUTBOUND_REHEARSAL_CONTAINER_ID: containerName,
    NO_COLOR: '1',
  });
  delete env.DIRECT_URL;
  delete env.SHADOW_DATABASE_URL;
  return env;
}

function runPrisma(args, databaseUrl, mirror, containerName) {
  const cmd = prismaCommand(args);
  return runCaptured(cmd.file, cmd.args, {
    cwd: mirror.root,
    env: prismaEnv(databaseUrl, containerName),
    code: 'STOP_OUTBOUND_REPOSITORY_PROOF_FAILED',
    timeoutMs: 180000,
  });
}

function startEphemeralPostgres() {
  runDocker(['image', 'inspect', POSTGRES_IMAGE, '--format', '{{.Id}}']);
  const token = String(Date.now()) + '-' + crypto.randomBytes(4).toString('hex');
  const containerName = 'bbo-chatwoot-outbound-adapter-' + token;
  const volumeName = 'bbo-chatwoot-outbound-adapter-vol-' + token;
  const password = crypto.randomBytes(18).toString('hex');
  runDocker([
    'volume', 'create',
    '--label', 'bbo.project=chatbot-automation',
    '--label', 'bbo.purpose=' + PURPOSE,
    '--label', 'bbo.disposable=true',
    volumeName,
  ]);
  runDocker([
    'run', '-d',
    '--name', containerName,
    '--label', 'bbo.project=chatbot-automation',
    '--label', 'bbo.purpose=' + PURPOSE,
    '--label', 'bbo.disposable=true',
    '-e', 'POSTGRES_USER=' + DB_USER,
    '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_DB=' + DB_NAME,
    '-p', '127.0.0.1::5432',
    '-v', volumeName + ':/var/lib/postgresql/data',
    POSTGRES_IMAGE,
  ]);
  for (let i = 0; i < 60; i += 1) {
    const ready = runDockerAllowFail(['exec', containerName, 'pg_isready', '-U', DB_USER, '-d', DB_NAME], { timeoutMs: 10000 });
    if (ready.status === 0) break;
    if (i === 59) fail('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
    sleepMs(1000);
  }
  const portOut = runDocker(['port', containerName, '5432/tcp']).stdout.trim();
  const match = /^127\.0\.0\.1:(\d+)$/.exec(portOut);
  if (!match) fail('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
  const databaseUrl = `postgresql://${DB_USER}:${password}@127.0.0.1:${Number(match[1])}/${DB_NAME}`;
  if (!/@127\.0\.0\.1:\d+\//.test(databaseUrl) || !/\/rehearsal_chatbot(?:\?|$)/.test(databaseUrl)) fail('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
  return { containerName, volumeName, databaseUrl };
}

function cleanupEphemeralPostgres(db) {
  if (!db) return { containerGone: true, volumeGone: true };
  if (db.containerName) runDockerAllowFail(['rm', '-f', db.containerName], { timeoutMs: 60000 });
  if (db.volumeName) runDockerAllowFail(['volume', 'rm', db.volumeName], { timeoutMs: 60000 });
  const containers = runDockerAllowFail(['ps', '-a', '--filter', 'name=^/' + db.containerName + '$', '--format', '{{.Names}}']);
  const volume = runDockerAllowFail(['volume', 'inspect', db.volumeName]);
  return { containerGone: !containers.stdout.trim(), volumeGone: volume.status !== 0 };
}

function mapOutboundReceiptRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantIntegrationId: row.tenant_integration_id,
    outboundCommandKey: row.outbound_command_key,
    businessIdempotencyKey: row.business_idempotency_key,
    externalConversationRef: row.external_conversation_ref,
    contentHash: row.content_hash,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    remoteMessageId: row.remote_message_id,
    safeErrorCode: row.safe_error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRawSqlError(err) {
  if (err && err.meta && err.meta.code === '23505') err.code = 'P2002';
  if (err && err.meta && err.meta.code === '23503') err.code = 'P2003';
  return err;
}

function createOutboundReceiptRawTable(prisma) {
  return {
    async create({ data }) {
      try {
        const rows = await prisma.$queryRawUnsafe(
          'INSERT INTO outbound_delivery_receipts (id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, created_at, updated_at',
          crypto.randomUUID(),
          data.tenantIntegrationId,
          data.outboundCommandKey,
          data.businessIdempotencyKey,
          data.externalConversationRef,
          data.contentHash,
          data.status,
          data.attemptCount,
          data.remoteMessageId,
          data.safeErrorCode,
        );
        return mapOutboundReceiptRow(rows[0]);
      } catch (e) {
        throw normalizeRawSqlError(e);
      }
    },
    async findUnique({ where }) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, created_at, updated_at FROM outbound_delivery_receipts WHERE outbound_command_key=$1 LIMIT 1',
        where.outboundCommandKey,
      );
      return mapOutboundReceiptRow(rows[0]);
    },
    async updateMany({ where }) {
      const retryableCodes = where.OR && where.OR[1] && where.OR[1].safeErrorCode && Array.isArray(where.OR[1].safeErrorCode.in)
        ? where.OR[1].safeErrorCode.in
        : DEFAULT_RETRYABLE_SAFE_ERROR_CODES;
      const placeholders = retryableCodes.map((_, index) => '$' + String(index + 2)).join(',');
      const sql = 'UPDATE outbound_delivery_receipts SET status=$' + String(retryableCodes.length + 2) + ', safe_error_code=NULL, attempt_count=attempt_count+1, updated_at=NOW() WHERE outbound_command_key=$1 AND (status=\'RESERVED\' OR (status=\'RETRYABLE_FAILED\' AND safe_error_code IN (' + placeholders + ')))';
      const count = await prisma.$executeRawUnsafe(sql, where.outboundCommandKey, ...retryableCodes, RECEIPT_STATUS.DISPATCHING);
      return { count };
    },
    async update({ where, data }) {
      const current = await this.findUnique({ where });
      if (!current) fail('OUTBOUND_RAW_ROW_NOT_FOUND');
      const next = Object.assign({}, current, data || {});
      const rows = await prisma.$queryRawUnsafe(
        'UPDATE outbound_delivery_receipts SET status=$2, remote_message_id=$3, safe_error_code=$4, updated_at=NOW() WHERE outbound_command_key=$1 RETURNING id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, created_at, updated_at',
        where.outboundCommandKey,
        next.status,
        next.remoteMessageId,
        next.safeErrorCode,
      );
      return mapOutboundReceiptRow(rows[0]);
    },
    async findManyByCommandKey(outboundCommandKey) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, created_at, updated_at FROM outbound_delivery_receipts WHERE outbound_command_key=$1 ORDER BY id',
        outboundCommandKey,
      );
      return rows.map(mapOutboundReceiptRow);
    },
    async findManyByTenantIntegrationId(tenantIntegrationId) {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, tenant_integration_id, outbound_command_key, business_idempotency_key, external_conversation_ref, content_hash, status, attempt_count, remote_message_id, safe_error_code, created_at, updated_at FROM outbound_delivery_receipts WHERE tenant_integration_id=$1 ORDER BY id',
        tenantIntegrationId,
      );
      return rows.map(mapOutboundReceiptRow);
    },
    async deleteManyByTenantIntegrationId(tenantIntegrationId) {
      return prisma.$executeRawUnsafe('DELETE FROM outbound_delivery_receipts WHERE tenant_integration_id=$1', tenantIntegrationId);
    },
  };
}

if (process.argv.includes('--repo-worker')) {
  assertEphemeralTarget();
  const prisma = new PrismaClient();
  const repo = createChatwootOutboundReceiptRepository({ client: { outboundDeliveryReceipt: createOutboundReceiptRawTable(prisma) } });

  async function handle(msg) {
    const { id, op, args } = msg || {};
    try {
      if (op === 'reserve') {
        const r = await repo.reserve(args.receipt);
        return { id, ok: true, outcome: r.result, status: r.receipt && r.receipt.status, attemptCount: r.receipt && r.receipt.attemptCount };
      }
      if (op === 'claim') {
        const r = await repo.claimDispatch(args);
        return { id, ok: true, outcome: r.result, status: r.receipt && r.receipt.status, attemptCount: r.receipt && r.receipt.attemptCount };
      }
      return { id, ok: false, error: 'UNKNOWN_OP' };
    } catch (e) {
      return { id, ok: false, code: (e && e.code) || null, error: (e && e.message) || 'ERR' };
    }
  }

  process.on('message', async (msg) => {
    if (msg && msg.op === 'DISCONNECT') {
      await prisma.$disconnect();
      process.send({ id: msg.id, ok: true, outcome: 'DISCONNECTED' });
      process.exit(0);
      return;
    }
    const res = await handle(msg);
    process.send(res);
  });
  process.send({ type: 'READY', pid: process.pid });
  return;
}

let checks = 0;
const failures = [];

function check(name, condition) {
  checks += 1;
  if (!condition) failures.push(name);
}

async function record(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(name + ': ' + ((e && e.code) || (e && e.message) || 'ERR'));
  }
}

async function expectRejects(fn) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  fail('EXPECTED_REJECTION');
}

function baseCommand(overrides) {
  return Object.assign({
    provider: 'CHATWOOT',
    channel: 'WEBSITE_CHAT',
    integrationId: PREFIX + 'int-1',
    tenantId: PREFIX + 'tenant-1',
    externalConversationRef: '1001',
    content: 'hello from bot',
    idempotencyKey: PREFIX + 'idem-1',
    correlationId: PREFIX + 'corr-1',
  }, overrides || {});
}

function baseAuthority(overrides) {
  return Object.assign({
    status: 'RESOLVED',
    tenantIntegrationId: PREFIX + 'int-1',
    integrationId: PREFIX + 'int-1',
    tenantId: PREFIX + 'tenant-1',
    tenantActive: true,
    webhookEndpointId: PREFIX + 'ep-1',
    provider: 'CHATWOOT',
    channel: 'WEBSITE_CHAT',
    integrationStatus: true,
    endpointStatus: true,
    externalAccountId: '42',
    apiBaseUrl: 'https://chatwoot.example.test',
  }, overrides || {});
}

function baseCredential(overrides) {
  return Object.assign({
    id: PREFIX + 'cred-1',
    webhookEndpointId: PREFIX + 'ep-1',
    credentialType: 'CHATWOOT_API_TOKEN',
    ciphertext: 'encrypted-api-token',
    keyVersion: 1,
    algorithmVersion: 'aes-256-gcm',
    status: 'ACTIVE',
  }, overrides || {});
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInMemoryReceiptRepository() {
  const rows = new Map();
  function nowIso() { return new Date().toISOString(); }
  function required(value) {
    if (typeof value !== 'string' || !value.trim()) fail('IN_MEMORY_REQUIRED_FIELD');
    return value;
  }
  function update(outboundCommandKey, data) {
    const row = rows.get(outboundCommandKey);
    if (!row) fail('IN_MEMORY_ROW_NOT_FOUND');
    Object.assign(row, data, { updatedAt: nowIso() });
    return clone(row);
  }
  const repo = {
    _rows: rows,
    _seed(row) { rows.set(row.outboundCommandKey, Object.assign({ id: 'mem-' + rows.size, attemptCount: 0, safeErrorCode: null, remoteMessageId: null, createdAt: nowIso(), updatedAt: nowIso() }, clone(row))); },
    async reserve(receipt) {
      const outboundCommandKey = required(receipt.outboundCommandKey);
      if (rows.has(outboundCommandKey)) return { result: RESERVE_RESULT.DUPLICATE, receipt: clone(rows.get(outboundCommandKey)) };
      const row = {
        id: 'mem-' + rows.size,
        tenantIntegrationId: required(receipt.tenantIntegrationId),
        outboundCommandKey,
        businessIdempotencyKey: required(receipt.businessIdempotencyKey),
        externalConversationRef: required(receipt.externalConversationRef),
        contentHash: required(receipt.contentHash),
        status: RECEIPT_STATUS.RESERVED,
        attemptCount: 0,
        remoteMessageId: null,
        safeErrorCode: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      rows.set(outboundCommandKey, row);
      return { result: RESERVE_RESULT.RESERVED_NEW, receipt: clone(row) };
    },
    async inspect(outboundCommandKey) {
      return rows.has(outboundCommandKey) ? clone(rows.get(outboundCommandKey)) : null;
    },
    async claimDispatch(params) {
      const row = rows.get(params.outboundCommandKey);
      if (!row) return { result: CLAIM_RESULT.NOT_FOUND, receipt: null };
      const retryable = params.retryableSafeErrorCodes || DEFAULT_RETRYABLE_SAFE_ERROR_CODES;
      const claimable = row.status === RECEIPT_STATUS.RESERVED || (row.status === RECEIPT_STATUS.RETRYABLE_FAILED && retryable.includes(row.safeErrorCode));
      if (!claimable) return { result: CLAIM_RESULT.NOT_CLAIMED, receipt: clone(row) };
      row.status = RECEIPT_STATUS.DISPATCHING;
      row.safeErrorCode = null;
      row.attemptCount += 1;
      row.updatedAt = nowIso();
      return { result: CLAIM_RESULT.CLAIMED, receipt: clone(row) };
    },
    async markSucceeded(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.SUCCEEDED, remoteMessageId: required(params.remoteMessageId), safeErrorCode: null }); },
    async markRetryableFailed(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.RETRYABLE_FAILED, safeErrorCode: required(params.safeErrorCode) }); },
    async markUnknownOutcome(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.UNKNOWN_OUTCOME, safeErrorCode: required(params.safeErrorCode) }); },
    async markConfigurationBlocked(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.CONFIGURATION_BLOCKED, safeErrorCode: required(params.safeErrorCode) }); },
    async markMappingBlocked(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.MAPPING_BLOCKED, safeErrorCode: required(params.safeErrorCode) }); },
    async markPayloadRejected(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.PAYLOAD_REJECTED, safeErrorCode: required(params.safeErrorCode) }); },
    async markReconciliationRequired(params) { return update(params.outboundCommandKey, { status: RECEIPT_STATUS.RECONCILIATION_REQUIRED, safeErrorCode: required(params.safeErrorCode) }); },
  };
  return repo;
}

function createHarness(options) {
  const o = options || {};
  const receiptRepository = o.receiptRepository || createInMemoryReceiptRepository();
  const transportCalls = [];
  const originCalls = [];
  const credentialCalls = [];
  const decryptCalls = [];
  const authorityCalls = [];
  const authority = Object.prototype.hasOwnProperty.call(o, 'authority') ? o.authority : baseAuthority();
  const credential = Object.prototype.hasOwnProperty.call(o, 'credential') ? o.credential : baseCredential();
  const deps = {
    authorityResolver: {
      async resolveOutboundAuthorityByIntegrationId(integrationId) {
        authorityCalls.push(integrationId);
        if (typeof o.authorityFn === 'function') return o.authorityFn(integrationId);
        return authority;
      },
    },
    credentialRepository: {
      async findActiveApiTokenCredential(webhookEndpointId) {
        credentialCalls.push(webhookEndpointId);
        if (typeof o.credentialFn === 'function') return o.credentialFn(webhookEndpointId);
        return credential;
      },
    },
    credentialDecryptor: {
      decrypt(c) {
        decryptCalls.push(c && c.id);
        if (o.decryptThrows) fail('DECRYPT_AUTH_FAILED');
        return o.token || 'plain-api-token';
      },
    },
    receiptRepository,
    originPolicy: {
      async assertAllowed(ctx) {
        originCalls.push(clone(ctx));
        if (o.originReject) {
          const e = new Error('ORIGIN_REJECTED');
          e.code = 'CHATWOOT_API_ORIGIN_NOT_ALLOWED';
          e.safeErrorCode = 'CHATWOOT_API_ORIGIN_NOT_ALLOWED';
          throw e;
        }
        return true;
      },
    },
    transport: {
      async send(request) {
        transportCalls.push(request);
        if (o.transportThrows) throw o.transportThrows;
        if (typeof o.transportFn === 'function') return o.transportFn(request);
        return Object.prototype.hasOwnProperty.call(o, 'transportResult') ? o.transportResult : { status: 200, body: { id: 777 } };
      },
    },
  };
  return {
    adapter: createChatwootOutboundAdapter(deps),
    receiptRepository,
    transportCalls,
    originCalls,
    credentialCalls,
    decryptCalls,
    authorityCalls,
  };
}

function outboundKeyFor(command) {
  return deriveOutboundCommandKey({ integrationId: command.integrationId, businessIdempotencyKey: command.idempotencyKey });
}

function seededReceiptFor(command, status, overrides) {
  return Object.assign({
    tenantIntegrationId: command.integrationId,
    outboundCommandKey: outboundKeyFor(command),
    businessIdempotencyKey: command.idempotencyKey,
    externalConversationRef: String(command.externalConversationRef),
    contentHash: hashContent(command.content),
    status,
    attemptCount: 0,
    remoteMessageId: null,
    safeErrorCode: null,
  }, overrides || {});
}

async function runOfflineSuite() {
  await record('adapter exports are DI functions', async () => {
    check('01 createChatwootOutboundAdapter export', typeof createChatwootOutboundAdapter === 'function');
    check('02 receipt repo factory export', typeof createChatwootOutboundReceiptRepository === 'function');
    check('03 runtime repo outbound method available', typeof runtimeRepositories.createIntegrationIdentityResolver === 'function');
    check('04 deterministic command key length', deriveOutboundCommandKey({ integrationId: 'i', businessIdempotencyKey: 'b' }).length === 64);
    check('05 content hash length', hashContent('hello').length === 64);
    check('05b validateSuccessResponse export', typeof validateSuccessResponse === 'function');
  });

  await record('origin normalizer rejects unsafe base URLs', async () => {
    check('06 origin trims trailing slash', normalizeApiOrigin('https://chatwoot.example.test/') === 'https://chatwoot.example.test');
    check('07 origin keeps localhost origin for injected policy decision', normalizeApiOrigin('http://127.0.0.1:3000') === 'http://127.0.0.1:3000');
    const pathErr = await expectRejects(async () => normalizeApiOrigin('https://chatwoot.example.test/api'));
    check('08 origin path blocked', pathErr.safeErrorCode === 'CHATWOOT_API_ORIGIN_PATH_BLOCKED');
    const userErr = await expectRejects(async () => normalizeApiOrigin('https://u:p@chatwoot.example.test'));
    check('09 origin userinfo blocked', userErr.safeErrorCode === 'CHATWOOT_API_ORIGIN_INVALID');
    const protoErr = await expectRejects(async () => normalizeApiOrigin('file:///tmp/x'));
    check('10 origin protocol blocked', protoErr.safeErrorCode === 'CHATWOOT_API_ORIGIN_PROTOCOL_BLOCKED');
  });

  await record('successful dispatch stores only safe receipt data', async () => {
    const h = createHarness();
    const command = baseCommand();
    const out = await h.adapter.send(command);
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('11 success result', out.result === 'SUCCEEDED' && out.duplicate === false);
    check('12 transport invoked once', h.transportCalls.length === 1);
    check('13 exact method', h.transportCalls[0].method === 'POST');
    check('14 exact path', h.transportCalls[0].path === '/api/v1/accounts/42/conversations/1001/messages');
    check('15 api token header plus json content type only', h.transportCalls[0].headers.api_access_token === 'plain-api-token' && h.transportCalls[0].headers['Content-Type'] === 'application/json' && Object.keys(h.transportCalls[0].headers).length === 2);
    check('16 exact text outgoing body', h.transportCalls[0].body.content === command.content
      && h.transportCalls[0].body.message_type === 'outgoing'
      && h.transportCalls[0].body.private === false
      && h.transportCalls[0].body.content_type === 'text'
      && h.transportCalls[0].body.content_attributes && Object.keys(h.transportCalls[0].body.content_attributes).length === 0
      && Object.keys(h.transportCalls[0].body).length === 5);
    check('17 safe origin supplied by DB authority', h.transportCalls[0].apiOrigin === 'https://chatwoot.example.test');
    check('18 row succeeded', row.status === RECEIPT_STATUS.SUCCEEDED && row.remoteMessageId === '777');
    check('19 attempt increments on claim only', row.attemptCount === 1);
    const serialized = JSON.stringify(row);
    check('20 no raw content/token/origin in receipt', !serialized.includes(command.content) && !serialized.includes('plain-api-token') && !serialized.includes('chatwoot.example.test'));
  });

  await record('duplicate success is zero transport', async () => {
    const h = createHarness();
    const command = baseCommand({ idempotencyKey: PREFIX + 'dup-success' });
    await h.adapter.send(command);
    const firstCallCount = h.transportCalls.length;
    const out = await h.adapter.send(command);
    check('21 duplicate success returns remote id', out.duplicate === true && out.remoteMessageId === '777');
    check('22 duplicate success zero additional transport', h.transportCalls.length === firstCallCount);
  });

  await record('duplicate mismatch is rejected before transport', async () => {
    const h = createHarness();
    const command = baseCommand({ idempotencyKey: PREFIX + 'dup-mismatch' });
    h.receiptRepository._seed(seededReceiptFor(command, RECEIPT_STATUS.RETRYABLE_FAILED, { contentHash: hashContent('different'), safeErrorCode: 'HTTP_500' }));
    const err = await expectRejects(async () => h.adapter.send(command));
    check('23 replay mismatch code', err.code === ERROR_CODE.PAYLOAD_REJECTED && err.safeErrorCode === 'OUTBOUND_COMMAND_REPLAY_MISMATCH');
    check('24 replay mismatch zero transport', h.transportCalls.length === 0);
  });

  await record('retryable existing receipt can be reclaimed', async () => {
    const h = createHarness();
    const command = baseCommand({ idempotencyKey: PREFIX + 'retry-claim' });
    h.receiptRepository._seed(seededReceiptFor(command, RECEIPT_STATUS.RETRYABLE_FAILED, { attemptCount: 2, safeErrorCode: 'HTTP_500' }));
    const out = await h.adapter.send(command);
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('25 retryable existing succeeded', out.result === 'SUCCEEDED');
    check('26 retryable existing attempt incremented once', row.attemptCount === 3);
    check('27 retryable existing one transport', h.transportCalls.length === 1);
  });

  const blockedStatuses = [
    [RECEIPT_STATUS.DISPATCHING, ERROR_CODE.DISPATCH_IN_PROGRESS],
    [RECEIPT_STATUS.UNKNOWN_OUTCOME, ERROR_CODE.RECONCILIATION_REQUIRED],
    [RECEIPT_STATUS.RECONCILIATION_REQUIRED, ERROR_CODE.RECONCILIATION_REQUIRED],
    [RECEIPT_STATUS.CONFIGURATION_BLOCKED, ERROR_CODE.CONFIGURATION_BLOCKED],
    [RECEIPT_STATUS.MAPPING_BLOCKED, ERROR_CODE.MAPPING_BLOCKED],
    [RECEIPT_STATUS.PAYLOAD_REJECTED, ERROR_CODE.PAYLOAD_REJECTED],
  ];
  for (const [status, code] of blockedStatuses) {
    await record('consult-on-entry blocks ' + status, async () => {
      const h = createHarness();
      const command = baseCommand({ idempotencyKey: PREFIX + 'blocked-' + status });
      h.receiptRepository._seed(seededReceiptFor(command, status, { safeErrorCode: status + '_SAFE', remoteMessageId: status === RECEIPT_STATUS.SUCCEEDED ? '1' : null }));
      const err = await expectRejects(async () => h.adapter.send(command));
      check('28 blocked status maps ' + status, err.code === code);
      check('29 blocked status zero transport ' + status, h.transportCalls.length === 0);
    });
  }

  const invalidCommands = [
    ['missing integration', { integrationId: '' }, 'INTEGRATION_ID_REQUIRED'],
    ['missing tenant', { tenantId: '' }, 'TENANT_ID_REQUIRED'],
    ['missing idempotency', { idempotencyKey: '' }, 'BUSINESS_IDEMPOTENCY_KEY_REQUIRED'],
    ['bad conversation', { externalConversationRef: 'abc' }, 'EXTERNAL_CONVERSATION_REF_INVALID'],
    ['blank content', { content: '   ' }, 'CONTENT_REQUIRED'],
    ['forbidden command key', { apiUrl: 'https://attacker.example.test' }, 'OUTBOUND_COMMAND_FORBIDDEN_FIELD'],
  ];
  for (const [label, override, safeErrorCode] of invalidCommands) {
    await record('command validation ' + label, async () => {
      const h = createHarness();
      const err = await expectRejects(async () => h.adapter.send(baseCommand(Object.assign({ idempotencyKey: PREFIX + label }, override))));
      check('30 invalid command safe code ' + label, err.safeErrorCode === safeErrorCode);
      check('31 invalid command zero transport ' + label, h.transportCalls.length === 0);
      check('32 invalid command zero receipt ' + label, h.receiptRepository._rows.size === 0);
    });
  }

  await record('tenant mismatch is durable mapping block before transport', async () => {
    const h = createHarness();
    const command = baseCommand({ tenantId: PREFIX + 'other-tenant', idempotencyKey: PREFIX + 'tenant-mismatch' });
    const err = await expectRejects(async () => h.adapter.send(command));
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('33 tenant mismatch code', err.code === ERROR_CODE.MAPPING_BLOCKED);
    check('34 tenant mismatch row', row.status === RECEIPT_STATUS.MAPPING_BLOCKED && row.safeErrorCode === 'TENANT_MISMATCH');
    check('35 tenant mismatch zero transport', h.transportCalls.length === 0);
  });

  await record('configuration blocks are durable before transport', async () => {
    const originBlocked = createHarness({ originReject: true });
    const originCommand = baseCommand({ idempotencyKey: PREFIX + 'origin-block' });
    const originErr = await expectRejects(async () => originBlocked.adapter.send(originCommand));
    const originRow = originBlocked.receiptRepository._rows.get(outboundKeyFor(originCommand));
    check('36 origin blocked code', originErr.code === ERROR_CODE.CONFIGURATION_BLOCKED);
    check('37 origin blocked row', originRow.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED);
    check('38 origin blocked zero transport', originBlocked.transportCalls.length === 0);

    const missingCred = createHarness({ credential: null });
    const credCommand = baseCommand({ idempotencyKey: PREFIX + 'missing-cred' });
    const credErr = await expectRejects(async () => missingCred.adapter.send(credCommand));
    const credRow = missingCred.receiptRepository._rows.get(outboundKeyFor(credCommand));
    check('39 missing credential code', credErr.safeErrorCode === 'CHATWOOT_API_TOKEN_MISSING');
    check('40 missing credential row', credRow.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED && credRow.attemptCount === 1);
    check('41 missing credential zero transport', missingCred.transportCalls.length === 0);

    const wrongType = createHarness({ credential: baseCredential({ credentialType: 'WEBHOOK_SIGNING_SECRET' }) });
    const wrongTypeCommand = baseCommand({ idempotencyKey: PREFIX + 'wrong-cred-type' });
    const wrongTypeErr = await expectRejects(async () => wrongType.adapter.send(wrongTypeCommand));
    const wrongTypeRow = wrongType.receiptRepository._rows.get(outboundKeyFor(wrongTypeCommand));
    check('41b wrong credential type blocked', wrongTypeErr.safeErrorCode === 'CHATWOOT_API_TOKEN_TYPE_INVALID' && wrongTypeRow.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED);

    const missingAccount = createHarness({ authority: baseAuthority({ externalAccountId: null }) });
    const accountCommand = baseCommand({ idempotencyKey: PREFIX + 'missing-account' });
    const accountErr = await expectRejects(async () => missingAccount.adapter.send(accountCommand));
    const accountRow = missingAccount.receiptRepository._rows.get(outboundKeyFor(accountCommand));
    check('41c missing account blocked zero transport', accountErr.safeErrorCode === 'CHATWOOT_ACCOUNT_ID_INVALID' && accountRow.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED && missingAccount.transportCalls.length === 0);

    const missingOrigin = createHarness({ authority: baseAuthority({ apiBaseUrl: null }) });
    const originMissingCommand = baseCommand({ idempotencyKey: PREFIX + 'missing-origin' });
    const originMissingErr = await expectRejects(async () => missingOrigin.adapter.send(originMissingCommand));
    const originMissingRow = missingOrigin.receiptRepository._rows.get(outboundKeyFor(originMissingCommand));
    check('41d missing origin blocked zero transport', originMissingErr.safeErrorCode === 'CHATWOOT_API_ORIGIN_REQUIRED' && originMissingRow.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED && missingOrigin.transportCalls.length === 0);
  });

  const credentialStatuses = ['ROTATION_REQUIRED', 'REVOKED', 'DISABLED', 'PENDING'];
  for (const status of credentialStatuses) {
    await record('credential status blocked ' + status, async () => {
      const h = createHarness({ credential: baseCredential({ status }) });
      const command = baseCommand({ idempotencyKey: PREFIX + 'cred-' + status });
      const err = await expectRejects(async () => h.adapter.send(command));
      const row = h.receiptRepository._rows.get(outboundKeyFor(command));
      check('42 credential blocked safe code ' + status, err.safeErrorCode === 'CHATWOOT_API_TOKEN_' + status);
      check('43 credential blocked row ' + status, row.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED);
      check('44 credential blocked zero transport ' + status, h.transportCalls.length === 0);
    });
  }

  await record('decrypt failure is config blocked', async () => {
    const h = createHarness({ decryptThrows: true });
    const command = baseCommand({ idempotencyKey: PREFIX + 'decrypt-fail' });
    const err = await expectRejects(async () => h.adapter.send(command));
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('45 decrypt failure safe code', err.safeErrorCode === 'CHATWOOT_API_TOKEN_DECRYPT_FAILED');
    check('46 decrypt failure row', row.status === RECEIPT_STATUS.CONFIGURATION_BLOCKED);
    check('47 decrypt failure zero transport', h.transportCalls.length === 0);
  });

  const responseMatrix = [
    [401, RECEIPT_STATUS.CONFIGURATION_BLOCKED, ERROR_CODE.CONFIGURATION_BLOCKED],
    [403, RECEIPT_STATUS.CONFIGURATION_BLOCKED, ERROR_CODE.CONFIGURATION_BLOCKED],
    [404, RECEIPT_STATUS.MAPPING_BLOCKED, ERROR_CODE.MAPPING_BLOCKED],
    [400, RECEIPT_STATUS.PAYLOAD_REJECTED, ERROR_CODE.PAYLOAD_REJECTED],
    [422, RECEIPT_STATUS.PAYLOAD_REJECTED, ERROR_CODE.PAYLOAD_REJECTED],
    [408, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [425, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [429, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [500, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [502, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [503, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [504, RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED],
    [409, RECEIPT_STATUS.UNKNOWN_OUTCOME, ERROR_CODE.RECONCILIATION_REQUIRED],
    [418, RECEIPT_STATUS.UNKNOWN_OUTCOME, ERROR_CODE.RECONCILIATION_REQUIRED],
  ];
  for (const [status, receiptStatus, errorCode] of responseMatrix) {
    await record('transport status classification ' + status, async () => {
      const h = createHarness({ transportResult: { status, body: { error: 'safe' } } });
      const command = baseCommand({ idempotencyKey: PREFIX + 'status-' + status });
      const err = await expectRejects(async () => h.adapter.send(command));
      const row = h.receiptRepository._rows.get(outboundKeyFor(command));
      check('48 response status maps error ' + status, err.code === errorCode);
      check('49 response status persists ' + status, row.status === receiptStatus && row.safeErrorCode === 'HTTP_' + status);
      check('50 response status one transport ' + status, h.transportCalls.length === 1 && row.attemptCount === 1);
    });
  }

  await record('success validation accepts only non-contradictory remote response', async () => {
    const h = createHarness({ transportResult: { status: 201, body: { id: 888, conversation_id: '1001', account_id: '42', message_type: 'outgoing', private: false } } });
    const command = baseCommand({ idempotencyKey: PREFIX + 'validated-success' });
    const out = await h.adapter.send(command);
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('51 valid success response resolves', out.result === 'SUCCEEDED' && out.remoteMessageId === '888');
    check('52 valid success persisted remote id', row.status === RECEIPT_STATUS.SUCCEEDED && row.remoteMessageId === '888');
  });

  await record('malformed success is unknown outcome', async () => {
    const h = createHarness({ transportResult: { status: 200, body: { message: { id: '001' } } } });
    const command = baseCommand({ idempotencyKey: PREFIX + 'malformed-2xx' });
    const err = await expectRejects(async () => h.adapter.send(command));
    const row = h.receiptRepository._rows.get(outboundKeyFor(command));
    check('53 malformed success code', err.code === ERROR_CODE.RECONCILIATION_REQUIRED);
    check('54 malformed success row', row.status === RECEIPT_STATUS.UNKNOWN_OUTCOME && row.safeErrorCode === 'REMOTE_MESSAGE_ID_MISSING');
  });

  const invalidSuccessCases = [
    ['conversation-mismatch', { id: 889, conversation_id: '999', message_type: 'outgoing', private: false }, 'REMOTE_CONVERSATION_MISMATCH'],
    ['account-mismatch', { id: 890, conversation_id: '1001', account_id: '43', message_type: 'outgoing', private: false }, 'REMOTE_ACCOUNT_MISMATCH'],
    ['incoming-message', { id: 891, conversation_id: '1001', account_id: '42', message_type: 'incoming', private: false }, 'REMOTE_MESSAGE_TYPE_UNEXPECTED'],
    ['private-message', { id: 892, conversation_id: '1001', account_id: '42', message_type: 'outgoing', private: true }, 'REMOTE_PRIVATE_FLAG_UNEXPECTED'],
  ];
  for (const [label, body, safeErrorCode] of invalidSuccessCases) {
    await record('invalid success response ' + label, async () => {
      const h = createHarness({ transportResult: { status: 200, body } });
      const command = baseCommand({ idempotencyKey: PREFIX + 'invalid-success-' + label });
      const err = await expectRejects(async () => h.adapter.send(command));
      const row = h.receiptRepository._rows.get(outboundKeyFor(command));
      check('55 invalid success code ' + label, err.code === ERROR_CODE.RECONCILIATION_REQUIRED && err.safeErrorCode === safeErrorCode);
      check('56 invalid success persisted unknown ' + label, row.status === RECEIPT_STATUS.UNKNOWN_OUTCOME && row.safeErrorCode === safeErrorCode);
    });
  }

  const phases = [
    ['BEFORE_WRITE', RECEIPT_STATUS.RETRYABLE_FAILED, ERROR_CODE.RETRYABLE_FAILED, 'BEFORE_WRITE_FAILURE'],
    ['AFTER_WRITE', RECEIPT_STATUS.UNKNOWN_OUTCOME, ERROR_CODE.RECONCILIATION_REQUIRED, 'AFTER_WRITE_FAILURE'],
    ['UNKNOWN', RECEIPT_STATUS.UNKNOWN_OUTCOME, ERROR_CODE.RECONCILIATION_REQUIRED, 'UNKNOWN_TRANSPORT_OUTCOME'],
  ];
  for (const [phase, status, code, safeErrorCode] of phases) {
    await record('transport phase classification ' + phase, async () => {
      const h = createHarness({ transportThrows: Object.assign(new Error('transport failed'), { phase }) });
      const command = baseCommand({ idempotencyKey: PREFIX + 'phase-' + phase });
      const err = await expectRejects(async () => h.adapter.send(command));
      const row = h.receiptRepository._rows.get(outboundKeyFor(command));
      check('53 phase maps error ' + phase, err.code === code);
      check('54 phase persists ' + phase, row.status === status && row.safeErrorCode === safeErrorCode);
      check('55 phase one transport ' + phase, h.transportCalls.length === 1);
    });
  }

  await record('runtime repositories return safe outbound metadata', async () => {
    const endpoint = baseAuthority({ status: undefined });
    const cred = baseCredential({ status: 'ACTIVE' });
    const client = {
      integrationIdentity: { findMany: async () => [] },
      tenantIntegration: {
        findUnique: async () => ({
          id: endpoint.integrationId,
          tenantId: endpoint.tenantId,
          webhookEndpointId: endpoint.webhookEndpointId,
          provider: endpoint.provider,
          channel: endpoint.channel,
          processingMode: 'AUTO_BOT',
          handoffPolicy: 'BOT_FIRST',
          isEnabled: true,
          configVersion: 3,
          tenant: { id: endpoint.tenantId, isActive: true },
          webhookEndpoint: {
            id: endpoint.webhookEndpointId,
            provider: 'CHATWOOT',
            channel: 'WEBSITE_CHAT',
            mechanism: 'ACCOUNT_INTEGRATION_WEBHOOK',
            deploymentKey: PREFIX + 'deploy',
            externalAccountId: endpoint.externalAccountId,
            apiBaseUrl: endpoint.apiBaseUrl,
            minimumSupportedVersion: '4.13.0',
            exactVersion: 'v4.13.0',
            isEnabled: true,
            configVersion: 4,
          },
        }),
      },
      integrationCredential: {
        findUnique: async ({ where }) => {
          if (where.webhookEndpointId_credentialType.credentialType !== 'CHATWOOT_API_TOKEN') return null;
          return cred;
        },
      },
    };
    const identityRepo = runtimeRepositories.createIntegrationIdentityResolver({ client });
    const credentialRepo = runtimeRepositories.createIntegrationCredentialRepository({ client });
    const resolved = await identityRepo.resolveOutboundAuthorityByIntegrationId(endpoint.integrationId);
    const encrypted = await credentialRepo.findActiveApiTokenCredential(endpoint.webhookEndpointId);
    check('56 authority resolved', resolved.status === 'RESOLVED' && resolved.apiBaseUrl === endpoint.apiBaseUrl);
    check('57 authority no token/ciphertext', !JSON.stringify(resolved).includes('encrypted-api-token'));
    check('58 credential returns encrypted metadata only', encrypted.ciphertext === cred.ciphertext && encrypted.status === 'ACTIVE');
  });
}

function spawnWorker(tag, env) {
  const child = fork(path.join(__dirname, path.basename(__filename)), ['--repo-worker'], { env, windowsHide: true });
  const pending = new Map();
  let nextId = 1;
  let ready = false;
  const readyP = new Promise((resolve) => {
    child.once('message', (m) => {
      if (m && m.type === 'READY') {
        ready = true;
        resolve(m);
      }
    });
  });
  child.on('message', (m) => {
    if (m && m.id && pending.has(m.id)) {
      const item = pending.get(m.id);
      pending.delete(m.id);
      item.resolve(m);
    }
  });
  let crashed = false;
  child.on('exit', (code) => { if (!child.__clean && code !== 0) crashed = true; });
  return {
    tag,
    readyP,
    isReady: () => ready,
    isCrashed: () => crashed,
    send(op, args) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        child.send({ id, op, args });
      });
    },
    async disconnect() {
      child.__clean = true;
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, { resolve });
        child.send({ id, op: 'DISCONNECT' });
        child.once('exit', () => resolve({ ok: true }));
      });
    },
  };
}

function outcomeCounts(results) {
  const counts = new Map();
  for (const r of results) counts.set(r.outcome, (counts.get(r.outcome) || 0) + 1);
  return counts;
}

async function runRepositoryConcurrencySuite(databaseUrl, containerName) {
  assertEphemeralTarget();
  const env = prismaEnv(databaseUrl, containerName);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const receiptTable = createOutboundReceiptRawTable(prisma);
  let w1 = null;
  let w2 = null;
  const ts = String(Date.now());
  const tenantId = PREFIX + 'tenant-' + ts;
  const endpointId = PREFIX + 'endpoint-' + ts;
  const integrationId = PREFIX + 'integration-' + ts;
  const baseReceipt = {
    tenantIntegrationId: integrationId,
    outboundCommandKey: sha256Hex(PREFIX + 'command-' + ts),
    businessIdempotencyKey: PREFIX + 'business-' + ts,
    externalConversationRef: '2002',
    contentHash: sha256Hex('repo content ' + ts),
  };
  try {
    const tableRows = await prisma.$queryRawUnsafe("SELECT 1 FROM information_schema.tables WHERE table_name='outbound_delivery_receipts'");
    const fkRows = await prisma.$queryRawUnsafe("SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid='outbound_delivery_receipts'::regclass");
    check('59 outbound receipt table exists', Array.isArray(tableRows) && tableRows.length === 1);
    check('60 outbound receipt FK restrict exists', Array.isArray(fkRows) && fkRows.some((r) => r.confdeltype === 'r'));

    await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Outbound Adapter Smoke Tenant' } });
    await prisma.providerWebhookEndpoint.create({
      data: {
        id: endpointId,
        deploymentKey: PREFIX + 'deploy-' + ts,
        externalAccountId: '42',
        publicEndpointKey: PREFIX + 'pub-' + ts,
        exactVersion: 'v4.13.0',
        isEnabled: true,
      },
    });
    await prisma.tenantIntegration.create({ data: { id: integrationId, tenantId, webhookEndpointId: endpointId, isEnabled: true } });

    w1 = spawnWorker('w1', env);
    w2 = spawnWorker('w2', env);
    await Promise.all([w1.readyP, w2.readyP]);
    check('61 workers ready', w1.isReady() && w2.isReady());

    const reserveRace = await Promise.all([
      w1.send('reserve', { receipt: baseReceipt }),
      w2.send('reserve', { receipt: baseReceipt }),
    ]);
    const reserveCounts = outcomeCounts(reserveRace);
    const reservedRows = await receiptTable.findManyByCommandKey(baseReceipt.outboundCommandKey);
    check('62 reserve workers returned ok', reserveRace.every((r) => r.ok === true));
    check('63 one reserve winner', reserveCounts.get(RESERVE_RESULT.RESERVED_NEW) === 1);
    check('64 one reserve duplicate', reserveCounts.get(RESERVE_RESULT.DUPLICATE) === 1);
    check('65 exactly one DB receipt', reservedRows.length === 1);
    if (reservedRows.length !== 1) {
      failures.push('reserve race details: ' + JSON.stringify(reserveRace.map((r) => ({ ok: r.ok, outcome: r.outcome, code: r.code, error: r.error }))));
      return;
    }
    const reservedRow = reservedRows[0] || {};
    check('66 reserve attempt count zero', reservedRow.attemptCount === 0 && reservedRow.status === RECEIPT_STATUS.RESERVED);

    const claimRace = await Promise.all([
      w1.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
      w2.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
    ]);
    const claimCounts = outcomeCounts(claimRace);
    const afterClaim = await receiptTable.findUnique({ where: { outboundCommandKey: baseReceipt.outboundCommandKey } });
    check('67 claim workers returned ok', claimRace.every((r) => r.ok === true));
    check('68 one claim winner', claimCounts.get(CLAIM_RESULT.CLAIMED) === 1);
    check('69 one claim loser', claimCounts.get(CLAIM_RESULT.NOT_CLAIMED) === 1);
    check('70 claim attempt increments once', afterClaim && afterClaim.attemptCount === 1 && afterClaim.status === RECEIPT_STATUS.DISPATCHING);

    await receiptTable.update({
      where: { outboundCommandKey: baseReceipt.outboundCommandKey },
      data: { status: RECEIPT_STATUS.RETRYABLE_FAILED, safeErrorCode: 'HTTP_500' },
    });
    const retryRace = await Promise.all([
      w1.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey, retryableSafeErrorCodes: ['HTTP_500'] }),
      w2.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey, retryableSafeErrorCodes: ['HTTP_500'] }),
    ]);
    const retryCounts = outcomeCounts(retryRace);
    const afterRetry = await receiptTable.findUnique({ where: { outboundCommandKey: baseReceipt.outboundCommandKey } });
    check('71 retryable claim workers returned ok', retryRace.every((r) => r.ok === true));
    check('72 retryable one claim winner', retryCounts.get(CLAIM_RESULT.CLAIMED) === 1);
    check('73 retryable one claim loser', retryCounts.get(CLAIM_RESULT.NOT_CLAIMED) === 1);
    check('74 retryable increments once', afterRetry && afterRetry.attemptCount === 2 && afterRetry.status === RECEIPT_STATUS.DISPATCHING);

    await receiptTable.update({
      where: { outboundCommandKey: baseReceipt.outboundCommandKey },
      data: { status: RECEIPT_STATUS.UNKNOWN_OUTCOME, safeErrorCode: 'AFTER_WRITE_FAILURE' },
    });
    const unknownRace = await Promise.all([
      w1.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
      w2.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
    ]);
    const unknownCounts = outcomeCounts(unknownRace);
    const afterUnknown = await receiptTable.findUnique({ where: { outboundCommandKey: baseReceipt.outboundCommandKey } });
    check('75 unknown claim workers returned ok', unknownRace.every((r) => r.ok === true));
    check('76 unknown has no claim winner', !unknownCounts.get(CLAIM_RESULT.CLAIMED));
    check('77 unknown keeps attempt count', afterUnknown && afterUnknown.attemptCount === 2 && afterUnknown.status === RECEIPT_STATUS.UNKNOWN_OUTCOME);

    await receiptTable.update({
      where: { outboundCommandKey: baseReceipt.outboundCommandKey },
      data: { status: RECEIPT_STATUS.SUCCEEDED, remoteMessageId: '909', safeErrorCode: null },
    });
    const succeededRace = await Promise.all([
      w1.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
      w2.send('claim', { outboundCommandKey: baseReceipt.outboundCommandKey }),
    ]);
    const succeededCounts = outcomeCounts(succeededRace);
    const afterSucceeded = await receiptTable.findUnique({ where: { outboundCommandKey: baseReceipt.outboundCommandKey } });
    check('78 succeeded claim workers returned ok', succeededRace.every((r) => r.ok === true));
    check('79 succeeded has no claim winner', !succeededCounts.get(CLAIM_RESULT.CLAIMED));
    check('80 succeeded keeps remote id', afterSucceeded && afterSucceeded.attemptCount === 2 && afterSucceeded.remoteMessageId === '909');

    const fkError = await w1.send('reserve', {
      receipt: Object.assign({}, baseReceipt, {
        tenantIntegrationId: PREFIX + 'missing-integration',
        outboundCommandKey: sha256Hex(PREFIX + 'bad-fk-' + ts),
      }),
    });
    check('81 FK failure surfaces as error', fkError.ok === false && fkError.outcome !== RESERVE_RESULT.DUPLICATE);

    const rows = await receiptTable.findManyByTenantIntegrationId(integrationId);
    const serializedRows = JSON.stringify(rows);
    check('82 repository rows contain no raw content/token/origin', !serializedRows.includes('repo content') && !serializedRows.includes('plain-api-token') && !serializedRows.includes('chatwoot.example.test'));

    await receiptTable.deleteManyByTenantIntegrationId(integrationId);
    await prisma.tenantIntegration.deleteMany({ where: { id: integrationId } });
    await prisma.providerWebhookEndpoint.deleteMany({ where: { id: endpointId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    const leftovers = await receiptTable.findManyByTenantIntegrationId(integrationId);
    check('83 repository cleanup completed', leftovers.length === 0);
  } finally {
    if (w1) await w1.disconnect();
    if (w2) await w2.disconnect();
    await prisma.$disconnect();
  }
}

async function runEphemeralRepositoryProof() {
  let db = null;
  let cleanup = null;
  try {
    const mirror = prepareMigrationMirror();
    db = startEphemeralPostgres();
    runPrisma(['migrate', 'deploy', '--schema', mirror.schemaPath], db.databaseUrl, mirror, db.containerName);
    process.env.DATABASE_URL = db.databaseUrl;
    process.env.CHATWOOT_OUTBOUND_REHEARSAL_CONTAINER_ID = db.containerName;
    await runRepositoryConcurrencySuite(db.databaseUrl, db.containerName);
    check('84 migration mirror copied migrations', mirror.migrationCount > 0);
  } finally {
    delete process.env.DATABASE_URL;
    delete process.env.CHATWOOT_OUTBOUND_REHEARSAL_CONTAINER_ID;
    cleanup = cleanupEphemeralPostgres(db);
    check('85 ephemeral container cleanup', cleanup.containerGone === true);
    check('86 ephemeral volume cleanup', cleanup.volumeGone === true);
  }
}

async function main() {
  await runOfflineSuite();
  await runEphemeralRepositoryProof();
  if (failures.length > 0) {
    console.error('smoke:chatwoot-outbound-adapter failures=' + failures.length);
    for (const f of failures) console.error(' - ' + f);
    process.exit(1);
    return;
  }
  console.log('smoke:chatwoot-outbound-adapter checks=' + checks + ' failures=0');
  console.log('OUTBOUND_REPOSITORY_CONCURRENCY_PASS');
  console.log('CHATWOOT_OUTBOUND_ADAPTER_LOCAL_PASS');
}

main().catch((e) => {
  console.error('smoke:chatwoot-outbound-adapter failed: ' + ((e && e.code) || (e && e.message) || 'ERR'));
  process.exit(1);
});
