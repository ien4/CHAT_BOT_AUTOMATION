#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');
const { PrismaClient, Prisma } = require('@prisma/client');

const repoModule = require('../src/webhook/chatwootHandoffExecutionRepository');
const portModule = require('../src/webhook/chatwootHandoffExecutionPort');

const {
  createChatwootHandoffExecutionRepository,
  LOCAL_OWNERSHIP_STATE,
  PROVIDER_EXECUTION_STATE,
  RESERVE_RESULT,
  CLAIM_RESULT,
} = repoModule;
const {
  createChatwootHandoffExecutionPort,
  defaultDeriveActiveOwnershipKey,
  TARGET_KIND,
  HANDOFF_RESULT,
} = portModule;

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_ROOT = path.join(BACKEND_ROOT, 'prisma');
const MIGRATIONS_ROOT = path.join(PRISMA_ROOT, 'migrations');
const WORK_ROOT = path.join(PROJECT_ROOT, 'tmp-runtime', 'chatwoot-handoff-execution-port-implementation-01');
const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';
const DB_NAME = 'rehearsal_chatbot';
const DB_USER = 'rehearsal_user';
const PURPOSE = 'chatwoot-handoff-execution-port-implementation-01';
const PREFIX = 'handoff-port-smoke-';
const ROUNDS = 20;

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

function fail(code) {
  const e = new Error(code);
  e.code = code;
  throw e;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    e.stdout = res.stdout || '';
    e.stderr = res.stderr || '';
    throw e;
  }
  if (res.status !== 0) {
    const e = new Error(options.code || 'COMMAND_FAILED');
    e.stdout = res.stdout || '';
    e.stderr = res.stderr || '';
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

function assertEphemeralTarget() {
  const url = process.env.DATABASE_URL || '';
  if (!/@127\.0\.0\.1:\d+\//.test(url)) fail('REHEARSAL_DB_NOT_LOCALHOST');
  if (!/\/rehearsal_chatbot(\?|$)/.test(url)) fail('REHEARSAL_DB_NAME_MISMATCH');
  if (!process.env.CHATWOOT_HANDOFF_REHEARSAL_CONTAINER_ID) fail('REHEARSAL_OWNERSHIP_PROOF_MISSING');
  if (/postgres:5432|:5433\/|staging|prod/i.test(url)) fail('REHEARSAL_DB_LOOKS_NON_EPHEMERAL');
}

function prismaCommand(args) {
  const cli = path.join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(cli)) fail('STOP_HANDOFF_PORT_PRISMA_CLIENT_UNAVAILABLE');
  return { file: process.execPath, args: [cli].concat(args) };
}

function assertSafeWorkRoot() {
  const resolved = path.resolve(WORK_ROOT);
  const expectedRoot = path.resolve(PROJECT_ROOT, 'tmp-runtime') + path.sep;
  if (!resolved.startsWith(expectedRoot)) fail('STOP_HANDOFF_PORT_SMOKE_WORKDIR_UNSAFE');
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
  return { root, schemaPath: path.join(prismaDir, 'schema.prisma'), migrationCount: migrations.length, latestMigration: migrations[migrations.length - 1] || null };
}

function prismaEnv(databaseUrl, containerName) {
  const env = Object.assign({}, process.env, {
    DATABASE_URL: databaseUrl,
    CHATWOOT_HANDOFF_REHEARSAL_CONTAINER_ID: containerName,
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
    code: 'STOP_HANDOFF_PORT_PRISMA_PROOF_FAILED',
    timeoutMs: 180000,
  });
}

function startEphemeralPostgres() {
  runDocker(['image', 'inspect', POSTGRES_IMAGE, '--format', '{{.Id}}']);
  const token = String(Date.now()) + '-' + crypto.randomBytes(4).toString('hex');
  const containerName = 'bbo-chatwoot-handoff-port-' + token;
  const volumeName = 'bbo-chatwoot-handoff-port-vol-' + token;
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
  return { containerName, volumeName, databaseUrl, maskedUrl: 'postgresql://' + DB_USER + ':***@127.0.0.1:' + Number(match[1]) + '/' + DB_NAME };
}

function cleanupEphemeralPostgres(db) {
  if (!db) return { containerGone: true, volumeGone: true };
  if (db.containerName) runDockerAllowFail(['rm', '-f', db.containerName], { timeoutMs: 60000 });
  if (db.volumeName) runDockerAllowFail(['volume', 'rm', db.volumeName], { timeoutMs: 60000 });
  const containers = runDockerAllowFail(['ps', '-a', '--filter', 'name=^/' + db.containerName + '$', '--format', '{{.Names}}']);
  const volume = runDockerAllowFail(['volume', 'inspect', db.volumeName]);
  return { containerGone: !containers.stdout.trim(), volumeGone: volume.status !== 0 };
}

function createMemoryClient() {
  const rows = [];
  let nextId = 1;

  function match(row, where) {
    for (const [key, expected] of Object.entries(where || {})) {
      if (expected && typeof expected === 'object' && Array.isArray(expected.in)) {
        if (!expected.in.includes(row[key])) return false;
      } else if (row[key] !== expected) {
        return false;
      }
    }
    return true;
  }

  function applyData(row, data) {
    for (const [key, value] of Object.entries(data || {})) {
      if (value && typeof value === 'object' && Number.isInteger(value.increment)) row[key] += value.increment;
      else row[key] = value;
    }
    row.updatedAt = new Date();
  }

  function uniqueError(field) {
    const e = new Error('Unique constraint failed');
    e.code = 'P2002';
    e.meta = { target: [field] };
    return e;
  }

  return {
    _rows: rows,
    chatwootHandoffExecution: {
      async create({ data }) {
        if (rows.some((r) => r.handoffRequestKey === data.handoffRequestKey)) throw uniqueError('handoffRequestKey');
        if (data.activeOwnershipKey !== null && rows.some((r) => r.activeOwnershipKey === data.activeOwnershipKey)) throw uniqueError('activeOwnershipKey');
        const row = Object.assign({
          id: 'mem-handoff-' + String(nextId++),
          requestedAt: new Date(),
          updatedAt: new Date(),
        }, clone(data));
        rows.push(row);
        return clone(row);
      },
      async findUnique({ where }) {
        if (where.handoffRequestKey) return clone(rows.find((r) => r.handoffRequestKey === where.handoffRequestKey) || null);
        return null;
      },
      async findFirst({ where }) {
        return clone(rows.find((r) => match(r, where)) || null);
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of rows) {
          if (match(row, where)) {
            applyData(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}

function baseCommand(overrides) {
  return Object.assign({
    tenantId: PREFIX + 'tenant',
    integrationId: PREFIX + 'integration',
    handoffRequestKey: PREFIX + 'request',
    businessIdempotencyKey: PREFIX + 'business',
    externalConversationRef: 'conversation-100',
    safeReasonCode: 'SMOKE_TEST',
    assignmentTargetKind: TARGET_KIND.TEAM_EXPLICIT,
    assignmentTargetRef: 'target-team',
  }, overrides || {});
}

function createHarness(options) {
  const o = options || {};
  const client = createMemoryClient();
  const repository = createChatwootHandoffExecutionRepository({ client, clock: () => new Date('2026-07-26T00:00:00.000Z') });
  const providerCalls = [];
  const authorityCalls = [];
  const releaseCalls = [];
  const authorityResolver = {
    async resolveHandoffAuthority(query) {
      authorityCalls.push(clone(query));
      if (o.authority) return o.authority(query);
      if (query.assignmentTargetKind === TARGET_KIND.NO_TARGET) {
        return { ok: false, kind: PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED, safeErrorCode: 'NO_TARGET_FAIL_CLOSED' };
      }
      return {
        ok: true,
        tenantId: query.tenantId,
        integrationId: query.integrationId,
        target: { kind: query.assignmentTargetKind, ref: query.assignmentTargetRef },
      };
    },
  };
  const providerAdapter = {
    async executeHandoff(command) {
      providerCalls.push(clone(command));
      if (o.provider) return o.provider(command);
      return { result: PROVIDER_EXECUTION_STATE.SUCCEEDED, remoteEvidenceRef: 'fake-evidence' };
    },
  };
  const releaseAuthorizer = {
    async authorize(command, execution) {
      releaseCalls.push({ command: clone(command), execution: clone(execution) });
      if (o.authorize) return o.authorize(command, execution);
      return { authorized: false };
    },
  };
  const port = createChatwootHandoffExecutionPort({
    repository,
    authorityResolver,
    providerAdapter,
    releaseAuthorizer,
  });
  return { client, repository, port, providerCalls, authorityCalls, releaseCalls };
}

function serializedRows(client) {
  return JSON.stringify(client._rows);
}

async function runOfflineSuite() {
  const modelNames = Prisma.dmmf.datamodel.models.map((m) => m.name);
  check('01 DMMF includes ChatwootHandoffExecution', modelNames.includes('ChatwootHandoffExecution'));
  const probe = new PrismaClient();
  check('02 generated delegate exists', Boolean(probe.chatwootHandoffExecution));
  check('03 generated delegate create exists', typeof probe.chatwootHandoffExecution.create === 'function');
  check('04 generated delegate findUnique exists', typeof probe.chatwootHandoffExecution.findUnique === 'function');
  check('05 generated delegate findFirst exists', typeof probe.chatwootHandoffExecution.findFirst === 'function');
  check('06 generated delegate updateMany exists', typeof probe.chatwootHandoffExecution.updateMany === 'function');
  await probe.$disconnect();

  await record('valid team request', async () => {
    const h = createHarness();
    const result = await h.port.requestHandoff(baseCommand());
    const row = h.client._rows[0];
    check('07 valid TEAM_EXPLICIT request succeeds', result.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED);
    check('08 team success persisted', row.providerExecutionState === PROVIDER_EXECUTION_STATE.SUCCEEDED && row.localOwnershipState === LOCAL_OWNERSHIP_STATE.OWNERSHIP_ACTIVE);
    check('09 provider called once for team', h.providerCalls.length === 1 && h.providerCalls[0].targetKind === TARGET_KIND.TEAM_EXPLICIT);
  });

  await record('valid agent request', async () => {
    const h = createHarness();
    const result = await h.port.requestHandoff(baseCommand({
      handoffRequestKey: PREFIX + 'agent-request',
      businessIdempotencyKey: PREFIX + 'agent-business',
      externalConversationRef: 'conversation-101',
      assignmentTargetKind: TARGET_KIND.AGENT_EXPLICIT,
      assignmentTargetRef: 'target-agent',
    }));
    check('10 valid AGENT_EXPLICIT request succeeds', result.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED);
    check('11 provider called once for agent', h.providerCalls.length === 1 && h.providerCalls[0].targetKind === TARGET_KIND.AGENT_EXPLICIT);
  });

  await record('validation and authority blocks', async () => {
    let h = createHarness();
    const noTarget = await h.port.requestHandoff(baseCommand({
      handoffRequestKey: PREFIX + 'no-target',
      businessIdempotencyKey: PREFIX + 'no-target-business',
      externalConversationRef: 'conversation-102',
      assignmentTargetKind: TARGET_KIND.NO_TARGET,
      assignmentTargetRef: null,
    }));
    check('12 NO_TARGET fails closed after claim', noTarget.result === HANDOFF_RESULT.MAPPING_BLOCKED && h.providerCalls.length === 0);

    h = createHarness();
    check('13 unknown target kind blocked', (await h.port.requestHandoff(baseCommand({ assignmentTargetKind: 'QUEUE' }))).result === HANDOFF_RESULT.REQUEST_BLOCKED);
    check('14 missing target ref blocked', (await h.port.requestHandoff(baseCommand({ assignmentTargetRef: null }))).result === HANDOFF_RESULT.REQUEST_BLOCKED);
    check('15 target ref forbidden for NO_TARGET', (await h.port.requestHandoff(baseCommand({ assignmentTargetKind: TARGET_KIND.NO_TARGET, assignmentTargetRef: 'x' }))).result === HANDOFF_RESULT.REQUEST_BLOCKED);
    check('16 malformed command blocked', (await h.port.requestHandoff({ tenantId: 'x' })).result === HANDOFF_RESULT.REQUEST_BLOCKED);
    check('17 extra target material rejected', (await h.port.requestHandoff(Object.assign(baseCommand(), { targetMetadata: { selectedByModel: true } }))).result === HANDOFF_RESULT.REQUEST_BLOCKED);

    h = createHarness({ authority: (q) => ({ ok: true, tenantId: q.tenantId + '-other', integrationId: q.integrationId, target: { kind: q.assignmentTargetKind, ref: q.assignmentTargetRef } }) });
    const cross = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'cross-authority', businessIdempotencyKey: PREFIX + 'cross-business' }));
    check('18 cross-tenant authority blocked', cross.result === HANDOFF_RESULT.MAPPING_BLOCKED && h.providerCalls.length === 0);

    h = createHarness({ authority: () => ({ ok: false, kind: PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED, safeErrorCode: 'INTEGRATION_DISABLED' }) });
    const disabled = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'disabled', businessIdempotencyKey: PREFIX + 'disabled-business' }));
    check('19 disabled integration blocked', disabled.result === HANDOFF_RESULT.CONFIGURATION_BLOCKED && h.providerCalls.length === 0);
  });

  await record('idempotency and active ownership', async () => {
    const h = createHarness();
    const first = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'same', businessIdempotencyKey: PREFIX + 'same-business' }));
    const second = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'same', businessIdempotencyKey: PREFIX + 'same-business' }));
    check('20 same request key idempotent', first.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED && second.result === HANDOFF_RESULT.EXISTING_REQUEST);
    check('21 duplicate request does not call provider', h.providerCalls.length === 1);
    const changed = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'same', businessIdempotencyKey: PREFIX + 'changed-business' }));
    check('22 changed request key contract conflicts', changed.result === HANDOFF_RESULT.IDEMPOTENCY_CONFLICT);
    const active = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'other', businessIdempotencyKey: PREFIX + 'other-business' }));
    check('23 different request same ownership conflicts', active.result === HANDOFF_RESULT.ACTIVE_OWNERSHIP_CONFLICT);
  });

  await record('claim semantics', async () => {
    const h = createHarness();
    const reserve = await h.repository.reserve({
      tenantIntegrationId: PREFIX + 'integration',
      handoffRequestKey: PREFIX + 'claim-request',
      activeOwnershipKey: defaultDeriveActiveOwnershipKey({ integrationId: PREFIX + 'integration', externalConversationRef: 'conversation-claim' }),
      businessIdempotencyKey: PREFIX + 'claim-business',
      externalConversationRef: 'conversation-claim',
      assignmentTargetKind: TARGET_KIND.TEAM_EXPLICIT,
      assignmentTargetRef: 'target-team',
      safeReasonCode: 'SMOKE_TEST',
    });
    const claims = await Promise.all([
      h.repository.claimExecution({ tenantIntegrationId: PREFIX + 'integration', id: reserve.execution.id }),
      h.repository.claimExecution({ tenantIntegrationId: PREFIX + 'integration', id: reserve.execution.id }),
    ]);
    const winners = claims.filter((r) => r.result === CLAIM_RESULT.CLAIM_WON).length;
    const losers = claims.filter((r) => r.result === CLAIM_RESULT.CLAIM_LOST || r.result === CLAIM_RESULT.NOT_CLAIMABLE).length;
    const row = await h.repository.inspectByRequestKey({ tenantIntegrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'claim-request' });
    check('24 only one claim winner', winners === 1 && losers === 1);
    check('25 claim increments attemptCount once', row.attemptCount === 1);
    check('26 losing claim does not call provider', h.providerCalls.length === 0);
    const third = await h.repository.claimExecution({ tenantIntegrationId: PREFIX + 'integration', id: reserve.execution.id });
    check('27 CLAIMED cannot be automatically reclaimed', third.result !== CLAIM_RESULT.CLAIM_WON);
  });

  await record('authority and provider order', async () => {
    let h = createHarness();
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'order-ok', businessIdempotencyKey: PREFIX + 'order-ok-business' }));
    check('28 authority called only after claim winner', h.authorityCalls.length === 1 && h.client._rows[0].attemptCount === 1);
    h = createHarness({ authority: () => ({ ok: false, kind: PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED, safeErrorCode: 'TARGET_MAPPING_MISSING' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'order-block', businessIdempotencyKey: PREFIX + 'order-block-business' }));
    check('29 provider called only after authority success', h.authorityCalls.length === 1 && h.providerCalls.length === 0);
    const productionText = fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'webhook', 'chatwootHandoffExecutionPort.js'), 'utf8')
      + fs.readFileSync(path.join(BACKEND_ROOT, 'src', 'webhook', 'chatwootHandoffExecutionRepository.js'), 'utf8');
    check('30 no credential resolver in production handoff files', !/credential/i.test(productionText));
  });

  await record('typed provider state mapping', async () => {
    let h = createHarness();
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'typed-success', businessIdempotencyKey: PREFIX + 'typed-success-business', externalConversationRef: 'conversation-success' }));
    check('31 typed success persists SUCCEEDED', h.client._rows[0].providerExecutionState === PROVIDER_EXECUTION_STATE.SUCCEEDED);
    check('32 success retains activeOwnershipKey', typeof h.client._rows[0].activeOwnershipKey === 'string');

    h = createHarness({ provider: () => ({ result: PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED, safeErrorCode: 'BEFORE_WRITE_FAILURE', writeBoundary: 'BEFORE_WRITE' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'retryable', businessIdempotencyKey: PREFIX + 'retryable-business', externalConversationRef: 'conversation-retryable' }));
    const retryRow = h.client._rows[0];
    check('33 retryable BEFORE_WRITE persists retryable', retryRow.providerExecutionState === PROVIDER_EXECUTION_STATE.RETRYABLE_FAILED && retryRow.localOwnershipState === LOCAL_OWNERSHIP_STATE.REQUESTED);
    const retryClaim = await h.repository.claimExecution({ tenantIntegrationId: PREFIX + 'integration', id: retryRow.id });
    check('34 retryable can later be reclaimed once', retryClaim.result === CLAIM_RESULT.CLAIM_WON && retryClaim.execution.attemptCount === 2);

    h = createHarness({ provider: () => ({ result: PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME, safeErrorCode: 'AFTER_WRITE_FAILURE' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'unknown', businessIdempotencyKey: PREFIX + 'unknown-business', externalConversationRef: 'conversation-unknown' }));
    const unknownRow = h.client._rows[0];
    check('35 UNKNOWN_OUTCOME retains ownership', unknownRow.providerExecutionState === PROVIDER_EXECUTION_STATE.UNKNOWN_OUTCOME && typeof unknownRow.activeOwnershipKey === 'string');
    const unknownClaim = await h.repository.claimExecution({ tenantIntegrationId: PREFIX + 'integration', id: unknownRow.id });
    check('36 UNKNOWN_OUTCOME cannot be reclaimed', unknownClaim.result !== CLAIM_RESULT.CLAIM_WON);

    h = createHarness({ provider: () => ({ result: 'SURPRISE' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'invalid-provider', businessIdempotencyKey: PREFIX + 'invalid-provider-business', externalConversationRef: 'conversation-invalid' }));
    check('37 invalid provider result becomes reconciliation', h.client._rows[0].providerExecutionState === PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED);

    const mappingCases = [
      ['CONFIGURATION_BLOCKED', PROVIDER_EXECUTION_STATE.CONFIGURATION_BLOCKED],
      ['MAPPING_BLOCKED', PROVIDER_EXECUTION_STATE.MAPPING_BLOCKED],
      ['PROVIDER_REJECTED', PROVIDER_EXECUTION_STATE.PROVIDER_REJECTED],
    ];
    for (const [label, state] of mappingCases) {
      h = createHarness({ provider: () => ({ result: state, safeErrorCode: label }) });
      await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + label, businessIdempotencyKey: PREFIX + label + '-business', externalConversationRef: 'conversation-' + label }));
      check('38 provider state persists ' + label, h.client._rows[0].providerExecutionState === state);
    }

    h = createHarness({ provider: () => ({ result: PROVIDER_EXECUTION_STATE.PROVIDER_REJECTED, safeErrorCode: 'X'.repeat(120) }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'bounded-code', businessIdempotencyKey: PREFIX + 'bounded-code-business', externalConversationRef: 'conversation-bounded-code' }));
    check('39 safeErrorCode bounded', String(h.client._rows[0].safeErrorCode || '').length <= 96);

    h = createHarness({ provider: () => ({ result: PROVIDER_EXECUTION_STATE.SUCCEEDED, remoteEvidenceRef: 'EVIDENCE-123' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'evidence', businessIdempotencyKey: PREFIX + 'evidence-business', externalConversationRef: 'conversation-evidence' }));
    check('40 remoteEvidenceRef bounded', h.client._rows[0].remoteEvidenceRef === 'EVIDENCE-123');

    h = createHarness({ provider: () => ({ result: PROVIDER_EXECUTION_STATE.RECONCILIATION_REQUIRED, safeErrorCode: 'REMOTE_CONTRADICTION', internalOnly: 'do-not-store' }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'no-provider-body', businessIdempotencyKey: PREFIX + 'no-provider-body-business', externalConversationRef: 'conversation-no-provider-body' }));
    check('41 provider result not persisted wholesale', !serializedRows(h.client).includes('do-not-store'));
    check('42 provider result never clears ownership', typeof h.client._rows[0].activeOwnershipKey === 'string');
  });

  await record('release boundary', async () => {
    let h = createHarness();
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'release-denied-resume', businessIdempotencyKey: PREFIX + 'release-denied-resume-business', externalConversationRef: 'conversation-release-denied-resume' }));
    const deniedResume = await h.port.releaseOwnership({ tenantId: PREFIX + 'tenant', integrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'release-denied-resume', action: 'RESUME', safeReasonCode: 'SMOKE_TEST' });
    check('43 unauthorized RESUME blocked', deniedResume.result === HANDOFF_RESULT.RELEASE_BLOCKED);

    h = createHarness();
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'release-denied-cancel', businessIdempotencyKey: PREFIX + 'release-denied-cancel-business', externalConversationRef: 'conversation-release-denied-cancel' }));
    const deniedCancel = await h.port.releaseOwnership({ tenantId: PREFIX + 'tenant', integrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'release-denied-cancel', action: 'CANCEL', safeReasonCode: 'SMOKE_TEST' });
    check('44 unauthorized CANCEL blocked', deniedCancel.result === HANDOFF_RESULT.RELEASE_BLOCKED);

    h = createHarness({ authorize: () => ({ authorized: true }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'release-resume', businessIdempotencyKey: PREFIX + 'release-resume-business', externalConversationRef: 'conversation-release-resume' }));
    const resume = await h.port.releaseOwnership({ tenantId: PREFIX + 'tenant', integrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'release-resume', action: 'RESUME', safeReasonCode: 'SMOKE_TEST' });
    check('45 authorized RESUME clears key and sets RELEASED', resume.result === HANDOFF_RESULT.RELEASED && resume.execution.localOwnershipState === LOCAL_OWNERSHIP_STATE.RELEASED && resume.execution.hasActiveOwnership === false);
    check('46 historical row remains after release', h.client._rows.length === 1);
    const reacquired = await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'release-reacquire', businessIdempotencyKey: PREFIX + 'release-reacquire-business', externalConversationRef: 'conversation-release-resume' }));
    check('47 released ownership slot can be acquired again', reacquired.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED && h.client._rows.filter((r) => r.activeOwnershipKey !== null).length === 1);

    h = createHarness({ authorize: () => ({ authorized: true }) });
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'release-cancel', businessIdempotencyKey: PREFIX + 'release-cancel-business', externalConversationRef: 'conversation-release-cancel' }));
    const cancel = await h.port.releaseOwnership({ tenantId: PREFIX + 'tenant', integrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'release-cancel', action: 'CANCEL', safeReasonCode: 'SMOKE_TEST' });
    check('48 authorized CANCEL clears key and sets CANCELLED', cancel.result === HANDOFF_RESULT.CANCELLED && cancel.execution.localOwnershipState === LOCAL_OWNERSHIP_STATE.CANCELLED && cancel.execution.hasActiveOwnership === false);
  });

  await record('tenant safety and static gates', async () => {
    const h = createHarness();
    await h.port.requestHandoff(baseCommand({ handoffRequestKey: PREFIX + 'inspect', businessIdempotencyKey: PREFIX + 'inspect-business', externalConversationRef: 'conversation-inspect' }));
    const ownTenant = await h.port.inspectHandoff({ integrationId: PREFIX + 'integration', handoffRequestKey: PREFIX + 'inspect' });
    const otherTenant = await h.port.inspectHandoff({ integrationId: PREFIX + 'other-integration', handoffRequestKey: PREFIX + 'inspect' });
    check('49 inspect by request key tenant-safe', ownTenant && otherTenant === null);
    const ownOwnership = await h.port.inspectOwnership({ integrationId: PREFIX + 'integration', externalConversationRef: 'conversation-inspect' });
    const otherOwnership = await h.port.inspectOwnership({ integrationId: PREFIX + 'other-integration', externalConversationRef: 'conversation-inspect' });
    check('50 inspect ownership tenant-safe', ownOwnership && otherOwnership === null);
    const crossUpdate = await h.repository.markUnknownOutcome({ tenantIntegrationId: PREFIX + 'other-integration', handoffRequestKey: PREFIX + 'inspect', safeErrorCode: 'CROSS_TENANT' });
    check('51 cross-tenant update impossible', crossUpdate.result !== repoModule.UPDATE_RESULT.UPDATED);

    const loaded = Object.keys(require.cache).join('\n');
    check('52 no ingress/runtime module imported', !/chatwootIngress|chatwootProcessor|chatwootRoute|chatwootRuntimeRepositories|chatwootOutboundAdapter/.test(loaded));

    const productionFiles = [
      path.join(BACKEND_ROOT, 'src', 'webhook', 'chatwootHandoffExecutionRepository.js'),
      path.join(BACKEND_ROOT, 'src', 'webhook', 'chatwootHandoffExecutionPort.js'),
    ];
    const text = productionFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const forbiddenPatterns = [
      /process\.env/,
      /PrismaClient/,
      /axios/,
      /\bfetch\b/,
      /node:http/,
      /node:https/,
      /api_access_token/,
      /\/api\/v1\/accounts/,
      /toggle_status/,
      /team_id/,
      /assignee_id/,
      /private note/i,
      /https?:\/\//,
      /decrypt/i,
      /console\./,
      /raw payload/i,
      /raw content/i,
      /raw provider response/i,
      /token/i,
      /secret/i,
      /header/i,
    ];
    check('53 production files have no real network code', !forbiddenPatterns.some((re) => re.test(text)));
    check('54 production files stay provider-neutral', !/apiBaseUrl|endpoint path|status=open/.test(text));

    const protectedHashes = {
      'backend/src/webhook/chatwootIngress.js': '791cc8ca899384bee2baa33199cd279ef2809389',
      'backend/src/webhook/chatwootProcessor.js': '94faedf0b74070ef652314b8bc9878123c3054d4',
      'backend/src/webhook/chatwootRoute.js': 'e9a826a3e3fc8534d0c50ccc9eb8ab62639bd96a',
      'backend/src/webhook/chatwootOutboundAdapter.js': '220be9b8573c43852bae65475d95f5b0ab449eb4',
      'backend/src/webhook/chatwootOutboundReceiptRepository.js': 'b06e6771dbfb81a621ec18437f7f2237ede7a261',
      'backend/src/webhook/chatwootRuntimeRepositories.js': '50bac895db0c4dbd833ab3b3a26210bf633a92a4',
      'backend/prisma/schema.prisma': '83f6cba49233eff517d8cb5b500e91c381888661',
      'backend/prisma/migrations/20260725120000_add_chatwoot_handoff_durability/migration.sql': '7ec696fc6529948c2a1ec864e4213daad2b2d402',
      'backend/scripts/smoke-chatwoot-handoff-durability-schema.js': '24301cc32c6579cfe94a0320b0fa4673d3df9ab9',
      'backend/scripts/smoke-chatwoot-db-concurrency.js': 'cc8c61a13f4e35eb42aec1e3fd969313be1049a8',
    };
    let protectedOk = true;
    for (const [repoPath, expected] of Object.entries(protectedHashes)) {
      const actual = runCaptured('git', ['hash-object', '--path=' + repoPath, repoPath], { cwd: PROJECT_ROOT }).stdout.trim();
      if (actual !== expected) protectedOk = false;
    }
    check('55 protected files remain unchanged', protectedOk);
  });
}

if (process.argv.includes('--handoff-worker')) {
  assertEphemeralTarget();
  const prisma = new PrismaClient();
  const repository = createChatwootHandoffExecutionRepository({ client: prisma });
  async function handle(msg) {
    const { id, op, args } = msg || {};
    try {
      if (op === 'reserve') {
        const r = await repository.reserve(args);
        return { id, ok: true, outcome: r.result, execution: r.execution ? { id: r.execution.id, attemptCount: r.execution.attemptCount, providerExecutionState: r.execution.providerExecutionState, activeOwnershipKey: r.execution.activeOwnershipKey } : null };
      }
      if (op === 'claim') {
        const r = await repository.claimExecution(args);
        return { id, ok: true, outcome: r.result, execution: r.execution ? { id: r.execution.id, attemptCount: r.execution.attemptCount, providerExecutionState: r.execution.providerExecutionState, activeOwnershipKey: r.execution.activeOwnershipKey } : null };
      }
      return { id, ok: false, code: 'UNKNOWN_OP' };
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
    process.send(await handle(msg));
  });
  process.send({ type: 'READY', pid: process.pid });
  return;
}

function spawnWorker(tag, env) {
  const child = fork(path.join(__dirname, path.basename(__filename)), ['--handoff-worker'], { env, windowsHide: true });
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

function countOutcomes(results, name) {
  return results.filter((r) => r && r.ok === true && r.outcome === name).length;
}

async function seedIntegration(prisma, suffix) {
  const token = suffix || String(Date.now());
  const tenantId = PREFIX + 'tenant-' + token;
  const endpointId = PREFIX + 'endpoint-' + token;
  const integrationId = PREFIX + 'integration-' + token;
  await prisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Handoff Port Smoke Tenant ' + token } });
  await prisma.providerWebhookEndpoint.create({
    data: {
      id: endpointId,
      deploymentKey: PREFIX + 'deploy-' + token,
      externalAccountId: 'acct-' + token,
      publicEndpointKey: PREFIX + 'public-' + token,
      exactVersion: 'v4.13.0',
      isEnabled: true,
    },
  });
  await prisma.tenantIntegration.create({ data: { id: integrationId, tenantId, webhookEndpointId: endpointId, isEnabled: true } });
  return { tenantId, endpointId, integrationId };
}

async function cleanupIntegration(prisma, fixture) {
  await prisma.chatwootHandoffExecution.deleteMany({ where: { tenantIntegrationId: fixture.integrationId } });
  await prisma.tenantIntegration.deleteMany({ where: { id: fixture.integrationId } });
  await prisma.providerWebhookEndpoint.deleteMany({ where: { id: fixture.endpointId } });
  await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
}

function repoInput(fixture, suffix, overrides) {
  const conversation = 'conversation-' + suffix;
  return Object.assign({
    tenantIntegrationId: fixture.integrationId,
    handoffRequestKey: PREFIX + 'request-' + suffix,
    activeOwnershipKey: defaultDeriveActiveOwnershipKey({ integrationId: fixture.integrationId, externalConversationRef: conversation }),
    businessIdempotencyKey: PREFIX + 'business-' + suffix,
    externalConversationRef: conversation,
    assignmentTargetKind: TARGET_KIND.TEAM_EXPLICIT,
    assignmentTargetRef: 'target-team',
    safeReasonCode: 'SMOKE_TEST',
  }, overrides || {});
}

function portCommand(fixture, suffix, overrides) {
  return Object.assign({
    tenantId: fixture.tenantId,
    integrationId: fixture.integrationId,
    handoffRequestKey: PREFIX + 'port-request-' + suffix,
    businessIdempotencyKey: PREFIX + 'port-business-' + suffix,
    externalConversationRef: 'port-conversation-' + suffix,
    safeReasonCode: 'SMOKE_TEST',
    assignmentTargetKind: TARGET_KIND.TEAM_EXPLICIT,
    assignmentTargetRef: 'target-team',
  }, overrides || {});
}

async function runPgSuite(databaseUrl, containerName, mirror) {
  const env = prismaEnv(databaseUrl, containerName);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let w1 = null;
  let w2 = null;
  try {
    const fixture = await seedIntegration(prisma, 'db-' + Date.now());
    const repository = createChatwootHandoffExecutionRepository({ client: prisma });
    w1 = spawnWorker('w1', env);
    w2 = spawnWorker('w2', env);
    await Promise.all([w1.readyP, w2.readyP]);
    check('56 PG16 workers ready', w1.isReady() && w2.isReady() && !w1.isCrashed() && !w2.isCrashed());
    check('57 full migration inventory applied', mirror.migrationCount > 0 && typeof mirror.latestMigration === 'string');

    let requestRaceOk = true;
    for (let r = 0; r < ROUNDS; r += 1) {
      const input = repoInput(fixture, 'same-key-' + r);
      const results = await Promise.all([w1.send('reserve', input), w2.send('reserve', input)]);
      const rows = await prisma.chatwootHandoffExecution.count({ where: { handoffRequestKey: input.handoffRequestKey } });
      requestRaceOk = requestRaceOk
        && countOutcomes(results, RESERVE_RESULT.RESERVED_NEW) === 1
        && countOutcomes(results, RESERVE_RESULT.EXISTING_REQUEST) === 1
        && rows === 1;
    }
    check('58 handoffRequestKey race 20/20', requestRaceOk);

    let activeRaceOk = true;
    for (let r = 0; r < ROUNDS; r += 1) {
      const activeOwnershipKey = defaultDeriveActiveOwnershipKey({ integrationId: fixture.integrationId, externalConversationRef: 'active-race-' + r });
      const a = repoInput(fixture, 'active-a-' + r, { activeOwnershipKey, externalConversationRef: 'active-race-' + r });
      const b = repoInput(fixture, 'active-b-' + r, { activeOwnershipKey, externalConversationRef: 'active-race-' + r });
      const results = await Promise.all([w1.send('reserve', a), w2.send('reserve', b)]);
      const activeRows = await prisma.chatwootHandoffExecution.count({ where: { activeOwnershipKey } });
      activeRaceOk = activeRaceOk
        && countOutcomes(results, RESERVE_RESULT.RESERVED_NEW) === 1
        && countOutcomes(results, RESERVE_RESULT.ACTIVE_OWNERSHIP_CONFLICT) === 1
        && activeRows === 1;
    }
    check('59 activeOwnershipKey race 20/20', activeRaceOk);

    let claimRaceOk = true;
    for (let r = 0; r < ROUNDS; r += 1) {
      const input = repoInput(fixture, 'claim-' + r);
      const reserve = await repository.reserve(input);
      const results = await Promise.all([
        w1.send('claim', { tenantIntegrationId: fixture.integrationId, id: reserve.execution.id }),
        w2.send('claim', { tenantIntegrationId: fixture.integrationId, id: reserve.execution.id }),
      ]);
      const row = await repository.inspectByRequestKey({ tenantIntegrationId: fixture.integrationId, handoffRequestKey: input.handoffRequestKey });
      claimRaceOk = claimRaceOk
        && countOutcomes(results, CLAIM_RESULT.CLAIM_WON) === 1
        && (countOutcomes(results, CLAIM_RESULT.CLAIM_LOST) + countOutcomes(results, CLAIM_RESULT.NOT_CLAIMABLE)) === 1
        && row.attemptCount === 1;
    }
    check('60 claim race 20/20 and attemptCount=1', claimRaceOk);

    const retryInput = repoInput(fixture, 'retry-reclaim');
    const retryReserve = await repository.reserve(retryInput);
    await repository.claimExecution({ tenantIntegrationId: fixture.integrationId, id: retryReserve.execution.id });
    await repository.markRetryableFailed({ tenantIntegrationId: fixture.integrationId, id: retryReserve.execution.id, safeErrorCode: 'BEFORE_WRITE_FAILURE', writeBoundary: 'BEFORE_WRITE' });
    const retryResults = await Promise.all([
      w1.send('claim', { tenantIntegrationId: fixture.integrationId, id: retryReserve.execution.id }),
      w2.send('claim', { tenantIntegrationId: fixture.integrationId, id: retryReserve.execution.id }),
    ]);
    const retryRow = await repository.inspectByRequestKey({ tenantIntegrationId: fixture.integrationId, handoffRequestKey: retryInput.handoffRequestKey });
    check('61 retryable reclaim one winner', countOutcomes(retryResults, CLAIM_RESULT.CLAIM_WON) === 1 && retryRow.attemptCount === 2);

    const unknownInput = repoInput(fixture, 'unknown-guard');
    const unknownReserve = await repository.reserve(unknownInput);
    await repository.claimExecution({ tenantIntegrationId: fixture.integrationId, id: unknownReserve.execution.id });
    await repository.markUnknownOutcome({ tenantIntegrationId: fixture.integrationId, id: unknownReserve.execution.id, safeErrorCode: 'AFTER_WRITE_FAILURE' });
    const unknownResults = await Promise.all([
      w1.send('claim', { tenantIntegrationId: fixture.integrationId, id: unknownReserve.execution.id }),
      w2.send('claim', { tenantIntegrationId: fixture.integrationId, id: unknownReserve.execution.id }),
    ]);
    const unknownRow = await repository.inspectByRequestKey({ tenantIntegrationId: fixture.integrationId, handoffRequestKey: unknownInput.handoffRequestKey });
    check('62 unknown outcome zero reclaim winners', countOutcomes(unknownResults, CLAIM_RESULT.CLAIM_WON) === 0 && typeof unknownRow.activeOwnershipKey === 'string');

    const pgProviderCalls = [];
    const port = createChatwootHandoffExecutionPort({
      repository,
      authorityResolver: {
        async resolveHandoffAuthority(q) {
          return { ok: true, tenantId: q.tenantId, integrationId: q.integrationId, target: { kind: q.assignmentTargetKind, ref: q.assignmentTargetRef } };
        },
      },
      providerAdapter: {
        async executeHandoff(command) {
          pgProviderCalls.push(command);
          return { result: PROVIDER_EXECUTION_STATE.SUCCEEDED, remoteEvidenceRef: 'pg-evidence' };
        },
      },
      releaseAuthorizer: {
        async authorize() { return { authorized: true }; },
      },
    });
    const releaseFirst = await port.requestHandoff(portCommand(fixture, 'release-window'));
    const released = await port.releaseOwnership({
      tenantId: fixture.tenantId,
      integrationId: fixture.integrationId,
      handoffRequestKey: PREFIX + 'port-request-release-window',
      action: 'RESUME',
      safeReasonCode: 'SMOKE_TEST',
    });
    const releaseSecond = await port.requestHandoff(portCommand(fixture, 'release-window-2', { externalConversationRef: 'port-conversation-release-window' }));
    const activeKey = defaultDeriveActiveOwnershipKey({ integrationId: fixture.integrationId, externalConversationRef: 'port-conversation-release-window' });
    const activeCount = await prisma.chatwootHandoffExecution.count({ where: { activeOwnershipKey: activeKey } });
    const historicalCount = await prisma.chatwootHandoffExecution.count({
      where: { tenantIntegrationId: fixture.integrationId, externalConversationRef: 'port-conversation-release-window' },
    });
    check('63 release/reacquire works on PG16', releaseFirst.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED && released.result === HANDOFF_RESULT.RELEASED && releaseSecond.result === HANDOFF_RESULT.RESERVED_AND_EXECUTED && activeCount === 1 && historicalCount === 2);

    const badFk = await (async () => {
      try {
        await repository.reserve(repoInput({ integrationId: PREFIX + 'missing-integration' }, 'bad-fk'));
        return 'NO_ERROR';
      } catch (e) {
        return (e && e.code) || 'ERR';
      }
    })();
    check('64 invalid TenantIntegration FK is not duplicate', badFk !== RESERVE_RESULT.EXISTING_REQUEST && badFk !== RESERVE_RESULT.ACTIVE_OWNERSHIP_CONFLICT && badFk !== 'NO_ERROR');

    const crossInspect = await repository.inspectByRequestKey({ tenantIntegrationId: PREFIX + 'other-integration', handoffRequestKey: retryInput.handoffRequestKey });
    const crossUpdate = await repository.markUnknownOutcome({ tenantIntegrationId: PREFIX + 'other-integration', handoffRequestKey: retryInput.handoffRequestKey, safeErrorCode: 'CROSS_TENANT' });
    check('65 cross-tenant inspect/update denied on PG16', crossInspect === null && crossUpdate.result !== repoModule.UPDATE_RESULT.UPDATED);

    const restrictInput = repoInput(fixture, 'restrict-proof');
    await repository.reserve(restrictInput);
    const deleteOutcome = await (async () => {
      try {
        await prisma.tenantIntegration.delete({ where: { id: fixture.integrationId } });
        return 'DELETED';
      } catch (e) {
        return (e && e.code) || 'ERR';
      }
    })();
    check('66 TenantIntegration delete remains Restrict while evidence exists', deleteOutcome !== 'DELETED');
    check('67 fake provider used by PG16 port proof', pgProviderCalls.length === 2);

    await cleanupIntegration(prisma, fixture);
  } finally {
    if (w1) await w1.disconnect();
    if (w2) await w2.disconnect();
    await prisma.$disconnect();
  }
}

async function runEphemeralPg16Proof() {
  let db = null;
  let cleanup = null;
  try {
    const mirror = prepareMigrationMirror();
    db = startEphemeralPostgres();
    console.log('ephemeral_postgres_started=true');
    console.log('postgres_image=' + POSTGRES_IMAGE);
    console.log('database_url=' + db.maskedUrl);
    runPrisma(['migrate', 'deploy', '--schema', mirror.schemaPath], db.databaseUrl, mirror, db.containerName);
    runPrisma(['migrate', 'status', '--schema', mirror.schemaPath], db.databaseUrl, mirror, db.containerName);
    await runPgSuite(db.databaseUrl, db.containerName, mirror);
  } finally {
    cleanup = cleanupEphemeralPostgres(db);
    check('68 ephemeral container cleanup', cleanup.containerGone === true);
    check('69 ephemeral volume cleanup', cleanup.volumeGone === true);
  }
}

async function main() {
  await runOfflineSuite();
  await runEphemeralPg16Proof();
  if (failures.length > 0) {
    console.error('smoke:chatwoot-handoff-execution-port failures=' + failures.length);
    for (const failure of failures) console.error(' - ' + failure);
    process.exit(1);
    return;
  }
  console.log('smoke:chatwoot-handoff-execution-port checks=' + checks + ' failures=0');
  console.log('CHATWOOT_HANDOFF_EXECUTION_REPOSITORY_CONCURRENCY_PASS');
  console.log('CHATWOOT_HANDOFF_EXECUTION_PORT_LOCAL_PASS');
}

main().catch((e) => {
  console.error('smoke:chatwoot-handoff-execution-port failed: ' + ((e && e.code) || (e && e.message) || 'ERR'));
  process.exit(1);
});
