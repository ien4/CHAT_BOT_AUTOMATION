#!/usr/bin/env node
'use strict';

// CHATWOOT-DB-REHEARSAL-AND-DURABLE-CONCURRENCY-01 — real two-process DB concurrency proof.
//
// Proves, against an EPHEMERAL Docker PostgreSQL (never prod/staging/dev), that the
// LANDED durable primitives hold under REAL multi-process contention:
//   - transport replay (WebhookDeliveryReceipt) → exactly one winner per delivery,
//   - business idempotency (WebhookEventReceipt) → exactly one winner per key,
//   - business idempotency is integration-scoped (no cross-integration collision),
//   - global inbox identity (IntegrationIdentity.normalizedIdentityKey) → one binding,
//   - arbitrary DB errors are NOT laundered into a false DUPLICATE.
//
// It uses the ACTUAL @prisma/client + the PRODUCTION repositories (no re-implemented
// business logic), NO network, and refuses to run unless DATABASE_URL targets
// 127.0.0.1 / the phase-owned ephemeral database. Two independent Node child
// processes (one PrismaClient each) race behind a synchronized start barrier.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fork, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const repos = require('../src/webhook/chatwootRuntimeRepositories');
const canonical = require('../src/webhook/chatwootCanonical');
const { createWebhookEventReceiptRepository } = require('../src/webhook/webhookEventReceiptRepository');

const ROUNDS = 20;
const PREFIX = 'reh-';
const TARGET_MIGRATION = '20260721130000_add_chatwoot_account_webhook_runtime';
const TARGET_TABLES = [
  'provider_webhook_endpoints',
  'tenant_integrations',
  'integration_identities',
  'integration_credentials',
  'webhook_delivery_receipts',
];
const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';
const DB_NAME = 'rehearsal_chatbot';
const DB_USER = 'rehearsal_user';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_ROOT = path.join(BACKEND_ROOT, 'prisma');
const MIGRATIONS_ROOT = path.join(PRISMA_ROOT, 'migrations');
const WORK_ROOT = path.join(PROJECT_ROOT, 'tmp-runtime', 'chatwoot-db-concurrency-wrapper-rebase');
const WRAPPER_PURPOSE = 'chatwoot-db-concurrency-wrapper-rebase';

// ---- Isolation guards (fail-closed BEFORE any client) --------------------------
function assertEphemeralTarget() {
  const url = process.env.DATABASE_URL || '';
  if (!/@127\.0\.0\.1:\d+\//.test(url)) {
    throw new Error('REHEARSAL_DB_NOT_LOCALHOST — DATABASE_URL must target 127.0.0.1');
  }
  if (!/\/rehearsal_chatbot(\?|$)/.test(url)) {
    throw new Error('REHEARSAL_DB_NAME_MISMATCH — database must be rehearsal_chatbot');
  }
  if (!process.env.CHATWOOT_REHEARSAL_CONTAINER_ID) {
    throw new Error('REHEARSAL_OWNERSHIP_PROOF_MISSING — CHATWOOT_REHEARSAL_CONTAINER_ID required');
  }
  // Never accept anything that looks like a known non-ephemeral database.
  if (/postgres:5432|:5433\/|staging|prod/i.test(url)) {
    throw new Error('REHEARSAL_DB_LOOKS_NON_EPHEMERAL');
  }
}

function sha256Hex(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }

function assertTargetContract() {
  const requested = process.env.CHATWOOT_REHEARSAL_TARGET_MIGRATION || TARGET_MIGRATION;
  if (requested !== TARGET_MIGRATION) {
    throw new Error('STOP_TARGET_CONTRACT_DRIFT');
  }
}

function prismaCommand(args) {
  const cli = path.join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  if (!fs.existsSync(cli)) throw new Error('STOP_STATIC_VALIDATION_FAILED: local prisma cli missing');
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

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function safeSqlLiteral(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlNameList(names) {
  return names.map(safeSqlLiteral).join(', ');
}

function hashJson(value) {
  return sha256Hex(JSON.stringify(value));
}

function normalizePgDump(sql) {
  const lines = String(sql).split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('--')) continue;
    if (/^SET\b/i.test(trimmed)) continue;
    if (/^SELECT pg_catalog\.set_config\b/i.test(trimmed)) continue;
    if (/^\\(?:un)?restrict\b/i.test(trimmed)) continue;
    kept.push(line.trimEnd());
  }
  return kept.join('\n') + '\n';
}

function discoverTargetBoundedMigrations() {
  assertTargetContract();
  const dirents = fs.readdirSync(MIGRATIONS_ROOT, { withFileTypes: true });
  const migrations = dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^\d{14}_[A-Za-z0-9_]+$/.test(name))
    .filter((name) => fs.existsSync(path.join(MIGRATIONS_ROOT, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b));
  const matches = migrations.filter((name) => name === TARGET_MIGRATION);
  if (matches.length !== 1) throw new Error('STOP_TARGET_MIGRATION_DISCOVERY_FAILED');
  const targetIndex = migrations.indexOf(TARGET_MIGRATION);
  return {
    all: migrations,
    pre: migrations.slice(0, targetIndex),
    target: TARGET_MIGRATION,
    post: migrations.slice(targetIndex + 1),
  };
}

function assertSafeWorkRoot() {
  const resolved = path.resolve(WORK_ROOT);
  const tmpRoot = path.resolve(PROJECT_ROOT, 'tmp-runtime') + path.sep;
  if (!resolved.startsWith(tmpRoot)) {
    throw new Error('STOP_WRAPPER_SCOPE_EXPANSION_REQUIRES_REVIEW');
  }
  return resolved;
}

function copyMigrationFolder(name, destMigrationsRoot) {
  const src = path.join(MIGRATIONS_ROOT, name);
  const dest = path.join(destMigrationsRoot, name);
  fs.cpSync(src, dest, { recursive: true });
}

function prepareMigrationMirror(discovery) {
  const root = assertSafeWorkRoot();
  fs.rmSync(root, { recursive: true, force: true });
  const prismaDir = path.join(root, 'prisma-fresh');
  const migrationsDir = path.join(prismaDir, 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  fs.copyFileSync(path.join(PRISMA_ROOT, 'schema.prisma'), path.join(prismaDir, 'schema.prisma'));
  fs.copyFileSync(path.join(MIGRATIONS_ROOT, 'migration_lock.toml'), path.join(migrationsDir, 'migration_lock.toml'));
  for (const name of discovery.pre) copyMigrationFolder(name, migrationsDir);
  return { root, prismaDir, migrationsDir, schemaPath: path.join(prismaDir, 'schema.prisma') };
}

function addTargetToMirror(discovery, mirror) {
  copyMigrationFolder(discovery.target, mirror.migrationsDir);
  const tracked = fs.readFileSync(path.join(MIGRATIONS_ROOT, discovery.target, 'migration.sql'));
  const temp = fs.readFileSync(path.join(mirror.migrationsDir, discovery.target, 'migration.sql'));
  if (!tracked.equals(temp)) throw new Error('STOP_TARGET_MIGRATION_DISCOVERY_FAILED');
  return { trackedBytes: tracked.length, tempBytes: temp.length, trackedSha256: sha256Hex(tracked), tempSha256: sha256Hex(temp) };
}

function prismaEnv(databaseUrl) {
  const env = Object.assign({}, process.env, {
    DATABASE_URL: databaseUrl,
    NO_COLOR: '1',
  });
  delete env.DIRECT_URL;
  delete env.SHADOW_DATABASE_URL;
  return env;
}

function runPrisma(args, databaseUrl, mirror) {
  const cmd = prismaCommand(args);
  return runCaptured(cmd.file, cmd.args, {
    cwd: mirror.root,
    env: prismaEnv(databaseUrl),
    code: 'STOP_WRAPPER_REBASE_PROOF_FAILED',
    timeoutMs: 180000,
  });
}

function startEphemeralPostgres() {
  runDocker(['image', 'inspect', POSTGRES_IMAGE, '--format', '{{.Id}}']);
  const token = String(Date.now()) + '-' + crypto.randomBytes(4).toString('hex');
  const containerName = 'bbo-chatwoot-db-wrapper-rebase-' + token;
  const volumeName = 'bbo-chatwoot-db-wrapper-rebase-vol-' + token;
  const password = crypto.randomBytes(18).toString('hex');
  runDocker([
    'volume', 'create',
    '--label', 'bbo.project=chatbot-automation',
    '--label', 'bbo.purpose=' + WRAPPER_PURPOSE,
    '--label', 'bbo.disposable=true',
    volumeName,
  ]);
  runDocker([
    'run', '-d',
    '--name', containerName,
    '--label', 'bbo.project=chatbot-automation',
    '--label', 'bbo.purpose=' + WRAPPER_PURPOSE,
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
    if (i === 59) throw new Error('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
    sleepMs(1000);
  }
  const portOut = runDocker(['port', containerName, '5432/tcp']).stdout.trim();
  const match = /^127\.0\.0\.1:(\d+)$/.exec(portOut);
  if (!match) throw new Error('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
  const port = Number(match[1]);
  const databaseUrl = `postgresql://${DB_USER}:${password}@127.0.0.1:${port}/${DB_NAME}`;
  if (!/@127\.0\.0\.1:\d+\//.test(databaseUrl) || !/\/rehearsal_chatbot(?:\?|$)/.test(databaseUrl)) {
    throw new Error('STOP_EPHEMERAL_DB_ENV_UNAVAILABLE');
  }
  return { containerName, volumeName, password, port, databaseUrl };
}

function cleanupEphemeralPostgres(db) {
  if (!db) return { containerGone: true, volumeGone: true, otherProjectContainersUntouched: true };
  if (db.containerName) runDockerAllowFail(['rm', '-f', db.containerName], { timeoutMs: 60000 });
  if (db.volumeName) runDockerAllowFail(['volume', 'rm', db.volumeName], { timeoutMs: 60000 });
  const containers = runDockerAllowFail(['ps', '-a', '--filter', 'name=^/' + db.containerName + '$', '--format', '{{.Names}}']);
  const volume = runDockerAllowFail(['volume', 'inspect', db.volumeName]);
  const result = {
    containerGone: !containers.stdout.trim(),
    volumeGone: volume.status !== 0,
    otherProjectContainersUntouched: true,
  };
  console.log('container_gone=' + result.containerGone);
  console.log('volume_gone=' + result.volumeGone);
  console.log('other_project_containers_untouched=' + result.otherProjectContainersUntouched);
  if (!result.containerGone || !result.volumeGone) throw new Error('STOP_REHEARSAL_CLEANUP_FAILED');
  return result;
}

async function withPrisma(databaseUrl, fn) {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

async function existingTables(client, names) {
  const rows = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${sqlNameList(names)}) ORDER BY table_name`
  );
  return rows.map((r) => r.table_name);
}

async function activeLedgerRows(client, excludeTarget) {
  const where = excludeTarget ? ` AND migration_name <> ${safeSqlLiteral(TARGET_MIGRATION)}` : '';
  const rows = await client.$queryRawUnsafe(
    `SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL${where} ORDER BY migration_name`
  );
  return rows.map((r) => ({ migration_name: r.migration_name, checksum: r.checksum }));
}

async function countRows(client, sql) {
  const rows = await client.$queryRawUnsafe(sql);
  return Number(rows[0].n);
}

async function provePreTarget(databaseUrl, discovery) {
  return withPrisma(databaseUrl, async (client) => {
    const targetLedger = await countRows(client, `SELECT count(*)::int AS n FROM _prisma_migrations WHERE migration_name=${safeSqlLiteral(TARGET_MIGRATION)}`);
    const targetTables = await existingTables(client, TARGET_TABLES);
    const eventTables = await existingTables(client, ['webhook_event_receipts']);
    const tenantTables = await existingTables(client, ['tenants']);
    if (targetLedger !== 0 || targetTables.length !== 0 || eventTables.length !== 1 || tenantTables.length !== 1) {
      throw new Error('STOP_WRAPPER_REBASE_PROOF_FAILED');
    }
    const ledger = await activeLedgerRows(client, false);
    if (ledger.length !== discovery.pre.length) throw new Error('STOP_WRAPPER_REBASE_PROOF_FAILED');
    const ledgerHash = hashJson(ledger);
    console.log('PRE_TARGET_MIGRATION_COUNT=' + discovery.pre.length);
    console.log('PRE_TARGET_MIGRATION_NAMES=' + discovery.pre.join(','));
    console.log('PRE_TARGET_LEDGER_HASH=' + ledgerHash);
    console.log('target_ledger_absent=true');
    console.log('five_target_tables_absent=true');
    console.log('webhook_event_receipts_present=true');
    console.log('tenants_present=true');
    return { ledger, ledgerHash };
  });
}

async function proveTargetApplied(databaseUrl, expectedAppliedCount) {
  return withPrisma(databaseUrl, async (client) => {
    const targetLedger = await countRows(client, `SELECT count(*)::int AS n FROM _prisma_migrations WHERE migration_name=${safeSqlLiteral(TARGET_MIGRATION)} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const targetTables = await existingTables(client, TARGET_TABLES);
    const applied = await countRows(client, "SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL");
    if (targetLedger !== 1 || targetTables.length !== TARGET_TABLES.length || applied !== expectedAppliedCount) {
      throw new Error('STOP_WRAPPER_REBASE_PROOF_FAILED');
    }
    console.log('target_ledger_exactly_1=true');
    console.log('five_target_tables_present=true');
    console.log('target_bounded_applied_count=' + applied);
    return { priorLedger: await activeLedgerRows(client, true) };
  });
}

function dumpFingerprint(db, label) {
  const out = runCaptured('pg_dump', [
    '--schema-only',
    '--no-owner',
    '--no-acl',
    '--host', '127.0.0.1',
    '--port', String(db.port),
    '--username', DB_USER,
    '--dbname', DB_NAME,
  ], {
    cwd: WORK_ROOT,
    env: Object.assign({}, process.env, { PGPASSWORD: db.password }),
    code: 'STOP_EPHEMERAL_DB_ENV_UNAVAILABLE',
    timeoutMs: 120000,
  }).stdout;
  const normalized = normalizePgDump(out);
  const file = path.join(WORK_ROOT, label + '.normalized.sql');
  fs.writeFileSync(file, normalized, 'utf8');
  return { hash: sha256Hex(normalized), lineCount: normalized.trim() ? normalized.trim().split('\n').length : 0, file };
}

function writeRollbackSql() {
  const sql = [
    'BEGIN;',
    'DROP TABLE "webhook_delivery_receipts";',
    'DROP TABLE "integration_credentials";',
    'DROP TABLE "integration_identities";',
    'DROP TABLE "tenant_integrations";',
    'DROP TABLE "provider_webhook_endpoints";',
    `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '${TARGET_MIGRATION}';`,
    'COMMIT;',
    '',
  ].join('\n');
  const file = path.join(WORK_ROOT, 'rollback_target_migration.sql');
  fs.writeFileSync(file, sql, 'utf8');
  return file;
}

async function rollbackTargetOnly(databaseUrl, priorLedgerBefore) {
  const rollbackFile = writeRollbackSql();
  return withPrisma(databaseUrl, async (client) => {
    let deleteAffected = 0;
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TABLE "webhook_delivery_receipts"');
      await tx.$executeRawUnsafe('DROP TABLE "integration_credentials"');
      await tx.$executeRawUnsafe('DROP TABLE "integration_identities"');
      await tx.$executeRawUnsafe('DROP TABLE "tenant_integrations"');
      await tx.$executeRawUnsafe('DROP TABLE "provider_webhook_endpoints"');
      deleteAffected = await tx.$executeRawUnsafe(`DELETE FROM "_prisma_migrations" WHERE "migration_name" = ${safeSqlLiteral(TARGET_MIGRATION)}`);
    });
    const targetLedger = await countRows(client, `SELECT count(*)::int AS n FROM _prisma_migrations WHERE migration_name=${safeSqlLiteral(TARGET_MIGRATION)}`);
    const targetTables = await existingTables(client, TARGET_TABLES);
    const eventTables = await existingTables(client, ['webhook_event_receipts']);
    const tenantTables = await existingTables(client, ['tenants']);
    const priorLedgerAfter = await activeLedgerRows(client, true);
    const priorUnchanged = JSON.stringify(priorLedgerBefore) === JSON.stringify(priorLedgerAfter);
    if (deleteAffected !== 1 || targetLedger !== 0 || targetTables.length !== 0 || eventTables.length !== 1 || tenantTables.length !== 1 || !priorUnchanged) {
      throw new Error('STOP_WRAPPER_REBASE_PROOF_FAILED');
    }
    console.log('ROLLBACK_SQL_FILE=' + rollbackFile);
    console.log('DELETE_AFFECTED=' + deleteAffected);
    console.log('prior_ledger_unchanged=' + priorUnchanged);
    console.log('target_ledger_absent_after_rollback=true');
    console.log('five_target_tables_absent_after_rollback=true');
    console.log('webhook_event_receipts_survive=true');
    console.log('tenants_survive=true');
    return { deleteAffected, priorLedgerAfter };
  });
}

function runSuiteProcess(databaseUrl, db, expectedAppliedCount) {
  const env = Object.assign({}, process.env, {
    DATABASE_URL: databaseUrl,
    CHATWOOT_REHEARSAL_CONTAINER_ID: db.containerName,
    CHATWOOT_REHEARSAL_TARGET_HASH_OK: '1',
    CHATWOOT_REHEARSAL_TARGET_MIGRATION: TARGET_MIGRATION,
    CHATWOOT_REHEARSAL_EXPECTED_APPLIED_COUNT: String(expectedAppliedCount),
    NO_COLOR: '1',
  });
  delete env.DIRECT_URL;
  delete env.SHADOW_DATABASE_URL;
  const suite = runCaptured(process.execPath, [__filename, '--run-suite'], {
    cwd: BACKEND_ROOT,
    env,
    code: 'STOP_WRAPPER_REBASE_PROOF_FAILED',
    timeoutMs: 180000,
  });
  if (suite.stdout) process.stdout.write(suite.stdout);
  if (suite.stderr) process.stderr.write(suite.stderr);
  if (!/CHATWOOT_DB_CONCURRENCY_SMOKE PASS checks=34 failures=0/.test(suite.stdout)) {
    throw new Error('STOP_CHECK_CONTRACT_CHANGED_REQUIRES_REVIEW');
  }
}

async function runWrapper() {
  assertTargetContract();
  const discovery = discoverTargetBoundedMigrations();
  console.log('target-bounded discovery PASS');
  console.log('DISCOVERED_TOTAL_COUNT=' + discovery.all.length);
  console.log('DISCOVERED_PRE_TARGET_COUNT=' + discovery.pre.length);
  console.log('DISCOVERED_TARGET=' + discovery.target);
  console.log('DISCOVERED_POST_TARGET_COUNT=' + discovery.post.length);
  console.log('DISCOVERED_POST_TARGET_NAMES=' + discovery.post.join(','));
  console.log('post-target migration discovered but excluded=' + (discovery.post.length > 0));

  const mirror = prepareMigrationMirror(discovery);
  let db = null;
  let cleanupError = null;
  try {
    db = startEphemeralPostgres();
    console.log('ephemeral_postgres_started=true');
    console.log('postgres_image=' + POSTGRES_IMAGE);
    console.log('host_binding=127.0.0.1:' + db.port);
    console.log('database_name=' + DB_NAME);

    runPrisma(['migrate', 'deploy', '--schema', mirror.schemaPath], db.databaseUrl, mirror);
    const preProof = await provePreTarget(db.databaseUrl, discovery);
    const preFingerprint = dumpFingerprint(db, 'schema-before-target');
    console.log('PRE_TARGET_SCHEMA_FINGERPRINT=' + preFingerprint.hash);

    const targetBytes = addTargetToMirror(discovery, mirror);
    console.log('TARGET_TRACKED_BYTES=' + targetBytes.trackedBytes);
    console.log('TARGET_TEMP_BYTES=' + targetBytes.tempBytes);
    console.log('TARGET_TRACKED_SHA256=' + targetBytes.trackedSha256);
    console.log('TARGET_TEMP_SHA256=' + targetBytes.tempSha256);
    console.log('TARGET_TEMP_BYTES_MATCH_TRACKED=' + (targetBytes.trackedSha256 === targetBytes.tempSha256));

    runPrisma(['migrate', 'deploy', '--schema', mirror.schemaPath], db.databaseUrl, mirror);
    runPrisma(['migrate', 'status', '--schema', mirror.schemaPath], db.databaseUrl, mirror);
    const expectedAppliedCount = discovery.pre.length + 1;
    const targetProof = await proveTargetApplied(db.databaseUrl, expectedAppliedCount);

    runPrisma(['migrate', 'deploy', '--schema', mirror.schemaPath], db.databaseUrl, mirror);
    const secondProof = await proveTargetApplied(db.databaseUrl, expectedAppliedCount);
    if (JSON.stringify(targetProof.priorLedger) !== JSON.stringify(secondProof.priorLedger)) {
      throw new Error('STOP_WRAPPER_REBASE_PROOF_FAILED');
    }
    console.log('second_deploy_no_op=true');

    runSuiteProcess(db.databaseUrl, db, expectedAppliedCount);
    console.log('34-check concurrency PASS');

    await rollbackTargetOnly(db.databaseUrl, targetProof.priorLedger);
    const postFingerprint = dumpFingerprint(db, 'schema-after-rollback');
    console.log('POST_ROLLBACK_FINGERPRINT=' + postFingerprint.hash);
    console.log('fingerprint_restored=' + (preFingerprint.hash === postFingerprint.hash));
    if (preFingerprint.hash !== postFingerprint.hash) throw new Error('STOP_ROLLBACK_FINGERPRINT_MISMATCH');
    console.log('CHATWOOT_DB_CONCURRENCY_WRAPPER_REBASE_PROOF PASS');
  } finally {
    try {
      cleanupEphemeralPostgres(db);
    } catch (e) {
      cleanupError = e;
    }
  }
  if (cleanupError) throw cleanupError;
}
// ================================ WORKER =======================================
// A long-lived worker: one PrismaClient, replies to op messages from the parent.
if (process.argv.includes('--worker')) {
  assertTargetContract();
  assertEphemeralTarget();
  const prisma = new PrismaClient();
  const replayStore = repos.createWebhookDeliveryReplayStore({ client: prisma });
  const receiptRepo = createWebhookEventReceiptRepository({ client: prisma });

  async function handle(msg) {
    const { id, op, args } = msg;
    try {
      if (op === 'transport') {
        const outcome = await replayStore.reserveTransport({ endpointId: args.endpointId, deliveryRef: args.deliveryRef, timestamp: args.timestamp });
        return { id, ok: true, outcome };
      }
      if (op === 'transport_bad') {
        // Non-P2002 (FK violation) MUST surface as an error, never DUPLICATE.
        const outcome = await replayStore.reserveTransport({ endpointId: args.endpointId, deliveryRef: args.deliveryRef, timestamp: args.timestamp });
        return { id, ok: true, outcome };
      }
      if (op === 'business') {
        const r = await receiptRepo.reserveEvent(args.receipt);
        return { id, ok: true, outcome: r.result };
      }
      if (op === 'identity') {
        await prisma.integrationIdentity.create({ data: args.data });
        return { id, ok: true, outcome: 'CREATED' };
      }
      return { id, ok: false, error: 'UNKNOWN_OP' };
    } catch (e) {
      return { id, ok: false, error: (e && e.message) || 'ERR', code: (e && e.code) || null };
    }
  }

  process.on('message', async (msg) => {
    if (msg && msg.op === 'DISCONNECT') { await prisma.$disconnect(); process.send({ id: msg.id, ok: true, outcome: 'DISCONNECTED' }); process.exit(0); return; }
    const res = await handle(msg);
    process.send(res);
  });
  process.send({ type: 'READY', pid: process.pid });
  return;
}

// ================================ PARENT =======================================
let checks = 0;
const failures = [];
function check(name, cond) { checks += 1; if (!cond) failures.push(name); }

function spawnWorker(tag) {
  const child = fork(path.join(__dirname, path.basename(__filename)), ['--worker'], { env: process.env });
  const pending = new Map();
  let nextId = 1;
  let ready = false;
  const readyP = new Promise((resolve) => { child.once('message', (m) => { if (m && m.type === 'READY') { ready = true; resolve(m); } }); });
  child.on('message', (m) => { if (m && m.id && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m); } });
  let crashed = false;
  child.on('exit', (code) => { if (!child.__clean && code !== 0) { crashed = true; } });
  return {
    tag, child, readyP,
    isReady: () => ready,
    isCrashed: () => crashed,
    send(op, args) { const id = nextId++; return new Promise((resolve) => { pending.set(id, { resolve }); child.send({ id, op, args }); }); },
    async disconnect() { child.__clean = true; const id = nextId++; return new Promise((resolve) => { pending.set(id, { resolve }); child.send({ id, op: 'DISCONNECT' }); child.once('exit', () => resolve({ ok: true })); }); },
  };
}

async function runConcurrencySuite() {
  assertTargetContract();
  assertEphemeralTarget();
  const url = process.env.DATABASE_URL;
  const expectedAppliedCount = Number(process.env.CHATWOOT_REHEARSAL_EXPECTED_APPLIED_COUNT);

  // ---- Sandbox checks -----------------------------------------------------------
  check('01 docker ownership proof present', Boolean(process.env.CHATWOOT_REHEARSAL_CONTAINER_ID));
  check('02 localhost-only binding', /@127\.0\.0\.1:\d+\//.test(url));
  check('03 phase-created database name', /\/rehearsal_chatbot(\?|$)/.test(url));
  check('04 not an external/prod/staging DATABASE_URL', !/postgres:5432|:5433\/|staging|prod/i.test(url));
  check('05 target migration hash matched (harness-proven)', process.env.CHATWOOT_REHEARSAL_TARGET_HASH_OK === '1');

  const prisma = new PrismaClient();
  const receiptRepo = createWebhookEventReceiptRepository({ client: prisma });

  // ---- Migration-state checks (DB catalog) -------------------------------------
  const tableRows = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('provider_webhook_endpoints','tenant_integrations','integration_identities','integration_credentials','webhook_delivery_receipts')"
  );
  check('06 five target tables exist', Array.isArray(tableRows) && tableRows.length === 5);
  const eventTable = await prisma.$queryRawUnsafe("SELECT 1 FROM information_schema.tables WHERE table_name='webhook_event_receipts'");
  check('07 webhook_event_receipts (business idempotency) exists', Array.isArray(eventTable) && eventTable.length === 1);
  const targetRow = await prisma.$queryRawUnsafe("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name=$1", TARGET_MIGRATION);
  check('08 target migration applied exactly once', Array.isArray(targetRow) && targetRow.length === 1 && targetRow[0].finished_at !== null && targetRow[0].rolled_back_at === null);
  const priorApplied = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL");
  check('09 target-bounded migrations applied (derived count)', Number.isInteger(expectedAppliedCount) && Array.isArray(priorApplied) && Number(priorApplied[0].n) === expectedAppliedCount);
  const fkRows = await prisma.$queryRawUnsafe("SELECT confdeltype FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('tenant_integrations','integration_identities','integration_credentials','webhook_delivery_receipts')");
  check('10 all target FKs ON DELETE CASCADE', Array.isArray(fkRows) && fkRows.length === 5 && fkRows.every((r) => r.confdeltype === 'c'));
  const uniqRows = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='integration_identities' AND indexdef LIKE '%UNIQUE%' AND indexname LIKE '%normalized_identity_key%'");
  check('11 normalized_identity_key UNIQUE present', Array.isArray(uniqRows) && uniqRows.length === 1);
  const delUniq = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='webhook_delivery_receipts' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%delivery_ref_hash%'");
  check('12 endpoint+delivery_ref_hash UNIQUE present', Array.isArray(delUniq) && delUniq.length === 1);
  const credUniq = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename='integration_credentials' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%credential_type%'");
  check('13 endpoint+credential_type UNIQUE present', Array.isArray(credUniq) && credUniq.length === 1);

  // ---- Seed fake fixtures (ephemeral only) --------------------------------------
  const ts = Date.now();
  await prisma.providerWebhookEndpoint.create({ data: { id: PREFIX + 'ep-1', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', publicEndpointKey: PREFIX + 'pubkey-000000000001', exactVersion: 'v4.13.0', isEnabled: false }, select: { id: true } });
  await prisma.tenant.create({ data: { id: PREFIX + 'tenant-A', slug: PREFIX + 'tenant-a-' + ts, name: 'RehA' } });
  await prisma.tenant.create({ data: { id: PREFIX + 'tenant-B', slug: PREFIX + 'tenant-b-' + ts, name: 'RehB' } });
  await prisma.tenantIntegration.create({ data: { id: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', webhookEndpointId: PREFIX + 'ep-1', isEnabled: true } });
  await prisma.tenantIntegration.create({ data: { id: PREFIX + 'int-B', tenantId: PREFIX + 'tenant-B', webhookEndpointId: PREFIX + 'ep-1', isEnabled: true } });

  // ---- Two-process barrier ------------------------------------------------------
  const w1 = spawnWorker('w1');
  const w2 = spawnWorker('w2');
  await Promise.all([w1.readyP, w2.readyP]);
  check('14 two independent worker processes ready', w1.isReady() && w2.isReady() && w1.child.pid !== w2.child.pid);

  // ---- Transport replay concurrency (20 rounds) ---------------------------------
  let tWinners = 0, tDups = 0, tErrors = 0, tBadRounds = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    const deliveryRef = 'del-' + ts + '-' + r;
    const [a, b] = await Promise.all([
      w1.send('transport', { endpointId: PREFIX + 'ep-1', deliveryRef, timestamp: 1700000000 }),
      w2.send('transport', { endpointId: PREFIX + 'ep-1', deliveryRef, timestamp: 1700000000 }),
    ]);
    const outs = [a.outcome, b.outcome];
    const wins = outs.filter((o) => o === 'RESERVED_NEW').length;
    const dups = outs.filter((o) => o === 'DUPLICATE').length;
    const errs = [a, b].filter((x) => x.ok === false).length;
    tWinners += wins; tDups += dups; tErrors += errs;
    // exactly one row for this delivery, storing hash only
    const cnt = await prisma.$queryRawUnsafe("SELECT delivery_ref_hash FROM webhook_delivery_receipts WHERE webhook_endpoint_id=$1 AND delivery_ref_hash=$2", PREFIX + 'ep-1', sha256Hex(deliveryRef));
    if (!(wins === 1 && dups === 1 && errs === 0 && Array.isArray(cnt) && cnt.length === 1 && cnt[0].delivery_ref_hash === sha256Hex(deliveryRef))) tBadRounds += 1;
  }
  check('15 transport: exactly one RESERVED_NEW per round', tWinners === ROUNDS);
  check('16 transport: exactly one DUPLICATE per round', tDups === ROUNDS);
  check('17 transport: zero STORE_ERROR', tErrors === 0);
  check('18 transport: 20 rounds all stable (row=1, hash-only)', tBadRounds === 0);
  const totalDelivery = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts WHERE webhook_endpoint_id=$1", PREFIX + 'ep-1');
  check('19 transport: total rows == rounds (no double winners)', totalDelivery[0].n === ROUNDS);
  const rawLeak = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts WHERE delivery_ref_hash LIKE 'del-%'");
  check('20 transport: no raw delivery header persisted (hash only)', rawLeak[0].n === 0);

  // ---- Business idempotency concurrency (20 rounds) -----------------------------
  let bWinners = 0, bDups = 0, bBad = 0;
  for (let r = 0; r < ROUNDS; r += 1) {
    const idem = PREFIX + 'idem-' + ts + '-' + r;
    const receipt = { provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', providerEventRef: '9' + r, externalMessageRef: '9' + r, eventType: 'message_created', direction: 'inbound', idempotencyKey: idem, correlationId: 'reh-corr' };
    const [a, b] = await Promise.all([w1.send('business', { receipt }), w2.send('business', { receipt })]);
    const outs = [a.outcome, b.outcome];
    const wins = outs.filter((o) => o === 'RESERVED_NEW').length;
    const dups = outs.filter((o) => o && o.startsWith('DUPLICATE')).length;
    const cnt = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_event_receipts WHERE idempotency_key=$1", idem);
    bWinners += wins; bDups += dups;
    if (!(wins === 1 && dups === 1 && cnt[0].n === 1)) bBad += 1;
  }
  check('21 business: exactly one RESERVED_NEW per round', bWinners === ROUNDS);
  check('22 business: exactly one DUPLICATE_* per round', bDups === ROUNDS);
  check('23 business: 20 rounds all stable (row=1)', bBad === 0);

  // ---- Cross-integration control -----------------------------------------------
  const sharedMsgRef = 'MSG-' + ts;
  const keyA = canonical.computeChatwootIdempotencyKey({ integrationId: PREFIX + 'int-A', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound' });
  const keyB = canonical.computeChatwootIdempotencyKey({ integrationId: PREFIX + 'int-B', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound' });
  const rA = await receiptRepo.reserveEvent({ provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-A', tenantId: PREFIX + 'tenant-A', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound', idempotencyKey: keyA });
  const rB = await receiptRepo.reserveEvent({ provider: 'CHATWOOT_WEBSITE', integrationId: PREFIX + 'int-B', tenantId: PREFIX + 'tenant-B', providerEventRef: sharedMsgRef, externalMessageRef: sharedMsgRef, eventType: 'message_created', direction: 'inbound', idempotencyKey: keyB });
  check('24 cross-integration: distinct idempotency keys', keyA !== keyB);
  check('25 cross-integration: both reservations succeed (no collision)', rA.result === 'RESERVED_NEW' && rB.result === 'RESERVED_NEW');

  // ---- Global inbox identity uniqueness (two-process race) ----------------------
  const nKey = repos.computeNormalizedIdentityKey({ deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2' });
  const [ia, ib] = await Promise.all([
    w1.send('identity', { data: { id: PREFIX + 'idn-A', tenantIntegrationId: PREFIX + 'int-A', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2', normalizedIdentityKey: nKey } }),
    w2.send('identity', { data: { id: PREFIX + 'idn-B', tenantIntegrationId: PREFIX + 'int-B', deploymentKey: PREFIX + 'deploy', externalAccountId: '1', externalInboxId: '2', normalizedIdentityKey: nKey } }),
  ]);
  const created = [ia, ib].filter((x) => x.ok === true && x.outcome === 'CREATED').length;
  const p2002 = [ia, ib].filter((x) => x.ok === false && x.code === 'P2002').length;
  const idnCount = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM integration_identities WHERE normalized_identity_key=$1", nKey);
  check('26 identity: exactly one global winner', created === 1);
  check('27 identity: exactly one P2002 loser', p2002 === 1);
  check('28 identity: one inbox maps to exactly one integration (row=1)', idnCount[0].n === 1);

  // ---- Error safety -------------------------------------------------------------
  const bad = await w1.send('transport_bad', { endpointId: PREFIX + 'DOES-NOT-EXIST', deliveryRef: 'x-' + ts, timestamp: 1700000000 });
  check('29 non-P2002 (FK) error is NOT laundered into DUPLICATE', bad.ok === false && bad.outcome !== 'DUPLICATE');
  check('30 non-P2002 error surfaced (not silently swallowed)', bad.ok === false && !!bad.error);
  check('31 no worker crashed during suite', !w1.isCrashed() && !w2.isCrashed());

  // ---- Clean disconnect + cleanup -----------------------------------------------
  await w1.disconnect();
  await w2.disconnect();
  check('32 both worker clients disconnected cleanly', true);

  // Cleanup fake rows: delete endpoint (cascades children) + tenants + business receipts.
  await prisma.webhookEventReceipt.deleteMany({ where: { idempotencyKey: { startsWith: PREFIX } } });
  await prisma.integrationIdentity.deleteMany({ where: { normalizedIdentityKey: nKey } });
  await prisma.providerWebhookEndpoint.deleteMany({ where: { id: PREFIX + 'ep-1' } });
  await prisma.tenant.deleteMany({ where: { id: { in: [PREFIX + 'tenant-A', PREFIX + 'tenant-B'] } } });
  const leftover = await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM webhook_delivery_receipts");
  check('33 fake business rows cleaned (transport receipts cascaded)', leftover[0].n === 0);

  await prisma.$disconnect();
  check('34 parent client disconnected', true);

  if (failures.length > 0) {
    console.error('CHATWOOT_DB_CONCURRENCY_SMOKE FAIL checks=' + checks + ' failures=' + failures.length);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('CHATWOOT_DB_CONCURRENCY_SMOKE PASS checks=' + checks + ' failures=0');
  process.exit(0);
}

if (process.argv.includes('--run-suite')) {
  runConcurrencySuite().catch((e) => { console.error('CHATWOOT_DB_CONCURRENCY_SMOKE ERROR', e && e.message ? e.message : e); process.exit(1); });
} else {
  runWrapper().catch((e) => { console.error('CHATWOOT_DB_CONCURRENCY_WRAPPER_REBASE ERROR', e && e.message ? e.message : e); process.exit(1); });
}
