'use strict';

const assert = require('assert');

const executorBefore = require('./tenant-backfill-executor');
const {
  MODEL_DELEGATES,
  ADAPTER_CODE,
  BackfillAdapterError,
  createPrismaBackfillRepository,
  resolveDelegateName,
  mapPrismaError,
  evaluateNoActionPolicy,
  validateApproval,
  assertTargetConfirmation,
} = require('./tenant-backfill-prisma-adapter');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function keyFor(model, id) {
  return `${model}:${id}`;
}

function createDelegate({ model, rows, calls, behavior = {} }) {
  return {
    async findUnique(args) {
      calls.push({ delegate: model, method: 'findUnique', args: clone(args) });
      if (behavior.findUniqueError) throw behavior.findUniqueError;
      const row = rows.get(keyFor(model, args.where.id));
      if (!row) return null;
      const selected = {};
      for (const field of Object.keys(args.select || {})) selected[field] = row[field];
      return selected;
    },
    async updateMany(args) {
      calls.push({ delegate: model, method: 'updateMany', args: clone(args) });
      if (behavior.updateManyError) throw behavior.updateManyError;
      if (behavior.updateManyCount !== undefined) return { count: behavior.updateManyCount };
      const rowKey = keyFor(model, args.where.id);
      const row = rows.get(rowKey);
      if (!row || row.tenantId !== (args.where.tenantId ?? null)) return { count: 0 };
      rows.set(rowKey, { ...row, tenantId: args.data.tenantId ?? null });
      return { count: 1 };
    },
  };
}

function createTenantDelegate({ tenants, calls, behavior = {} }) {
  return {
    async findUnique(args) {
      calls.push({ delegate: 'tenant', method: 'findUnique', args: clone(args) });
      if (behavior.findUniqueError) throw behavior.findUniqueError;
      const row = tenants.get(args.where.id);
      if (!row) return null;
      const selected = {};
      for (const field of Object.keys(args.select || {})) selected[field] = row[field];
      return selected;
    },
  };
}

function createPrismaMock(config = {}) {
  const calls = [];
  const rows = new Map(Object.entries(config.rows || {}).map(([key, value]) => [key, { ...value }]));
  const tenants = new Map(Object.entries(config.tenants || {}).map(([id, value]) => [id, { id, ...value }]));
  let disconnectCalls = 0;
  let transactionCalls = 0;

  const prisma = {
    facebookPage: createDelegate({ model: 'FacebookPage', rows, calls, behavior: config.facebookPage || {} }),
    conversation: createDelegate({ model: 'Conversation', rows, calls, behavior: config.conversation || {} }),
    appointment: createDelegate({ model: 'Appointment', rows, calls, behavior: config.appointment || {} }),
    tenant: createTenantDelegate({ tenants, calls, behavior: config.tenant || {} }),
    async $transaction(fn) {
      transactionCalls += 1;
      calls.push({ delegate: '$transaction', method: 'run', args: {} });
      if (config.transactionError) throw config.transactionError;
      return fn(prisma);
    },
    async $disconnect() {
      disconnectCalls += 1;
      calls.push({ delegate: '$disconnect', method: 'run', args: {} });
    },
    _calls: calls,
    _rows: rows,
    _stats() {
      return { disconnectCalls, transactionCalls };
    },
  };
  return prisma;
}

function createRepo(prisma) {
  return createPrismaBackfillRepository({ prisma, disconnectAfterOperation: false });
}

function findCall(prisma, delegate, method) {
  return prisma._calls.find((call) => call.delegate === delegate && call.method === method);
}

const goodHash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
const approval = {
  version: 1,
  target: 'bbotech-local',
  planHash: goodHash,
  execHash: otherHash,
  approvedBy: 'operator-id',
  approvedAt: '2026-07-18T00:00:00.000Z',
  expiresAt: '2026-07-19T00:00:00.000Z',
  allowedModels: ['FacebookPage', 'Conversation'],
  maxActions: 10,
  allowClassB: false,
};

async function run() {
  const results = [];
  const record = async (name, fn) => {
    await fn();
    results.push(`PASS - ${name}`);
  };

  await record('1 Adapter import does not connect', async () => {
    let factoryCalls = 0;
    const repo = createPrismaBackfillRepository({ clientFactory: () => { factoryCalls += 1; return createPrismaMock(); } });
    assert.strictEqual(repo._isInitialized(), false);
    assert.strictEqual(factoryCalls, 0);
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('2 Supported model map is explicit', async () => {
    assert.deepStrictEqual(MODEL_DELEGATES, {
      FacebookPage: 'facebookPage',
      Conversation: 'conversation',
      Appointment: 'appointment',
    });
    assert.strictEqual(resolveDelegateName('FacebookPage'), 'facebookPage');
  });

  await record('3 Unknown model rejects', async () => {
    assert.throws(() => resolveDelegateName('Message'), (error) => error.code === ADAPTER_CODE.UNSUPPORTED_MODEL);
  });

  await record('4 getCurrentOwner uses minimal select', async () => {
    const prisma = createPrismaMock({ rows: { 'FacebookPage:page_1': { id: 'page_1', tenantId: 'tenant_A', pageName: 'must-not-select' } } });
    const owner = await createRepo(prisma).getCurrentOwner('FacebookPage', 'page_1');
    assert.strictEqual(owner, 'tenant_A');
    assert.deepStrictEqual(findCall(prisma, 'FacebookPage', 'findUnique').args, {
      where: { id: 'page_1' },
      select: { id: true, tenantId: true },
    });
  });

  await record('5 targetTenantExists uses minimal select', async () => {
    const prisma = createPrismaMock({ tenants: { tenant_A: {} } });
    const exists = await createRepo(prisma).targetTenantExists('tenant_A');
    assert.strictEqual(exists, true);
    assert.deepStrictEqual(findCall(prisma, 'tenant', 'findUnique').args, {
      where: { id: 'tenant_A' },
      select: { id: true },
    });
  });

  await record('6 Apply is scoped by exact record and old owner', async () => {
    const prisma = createPrismaMock({ rows: { 'FacebookPage:page_1': { id: 'page_1', tenantId: null } } });
    const ok = await createRepo(prisma).applyOwnerTransition({ model: 'FacebookPage', recordId: 'page_1', oldTenantId: null, newTenantId: 'tenant_A' });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(findCall(prisma, 'FacebookPage', 'updateMany').args, {
      where: { id: 'page_1', tenantId: null },
      data: { tenantId: 'tenant_A' },
    });
    assert.strictEqual(prisma._stats().transactionCalls, 1);
  });

  await record('7 Apply conflict count zero returns false', async () => {
    const prisma = createPrismaMock({ rows: { 'FacebookPage:page_1': { id: 'page_1', tenantId: 'tenant_B' } } });
    const ok = await createRepo(prisma).applyOwnerTransition({ model: 'FacebookPage', recordId: 'page_1', oldTenantId: null, newTenantId: 'tenant_A' });
    assert.strictEqual(ok, false);
    assert.strictEqual(prisma._rows.get('FacebookPage:page_1').tenantId, 'tenant_B');
  });

  await record('8 Apply invariant count greater than one throws', async () => {
    const prisma = createPrismaMock({ facebookPage: { updateManyCount: 2 } });
    await assert.rejects(
      () => createRepo(prisma).applyOwnerTransition({ model: 'FacebookPage', recordId: 'page_1', oldTenantId: null, newTenantId: 'tenant_A' }),
      (error) => error.code === ADAPTER_CODE.INVARIANT_BROKEN
    );
  });

  await record('9 Rollback is scoped by exact record and new owner', async () => {
    const prisma = createPrismaMock({ rows: { 'Conversation:conv_1': { id: 'conv_1', tenantId: 'tenant_A' } } });
    const ok = await createRepo(prisma).rollbackOwnerTransition({ model: 'Conversation', recordId: 'conv_1', oldTenantId: null, newTenantId: 'tenant_A' });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(findCall(prisma, 'Conversation', 'updateMany').args, {
      where: { id: 'conv_1', tenantId: 'tenant_A' },
      data: { tenantId: null },
    });
  });

  await record('10 Rollback conflict returns false', async () => {
    const prisma = createPrismaMock({ rows: { 'Conversation:conv_1': { id: 'conv_1', tenantId: 'tenant_B' } } });
    const ok = await createRepo(prisma).rollbackOwnerTransition({ model: 'Conversation', recordId: 'conv_1', oldTenantId: null, newTenantId: 'tenant_A' });
    assert.strictEqual(ok, false);
    assert.strictEqual(prisma._rows.get('Conversation:conv_1').tenantId, 'tenant_B');
  });

  await record('11 FK error maps safely', async () => {
    const prisma = createPrismaMock({ facebookPage: { updateManyError: { code: 'P2003', message: 'fk text' } } });
    await assert.rejects(
      () => createRepo(prisma).applyOwnerTransition({ model: 'FacebookPage', recordId: 'page_1', oldTenantId: null, newTenantId: 'missing' }),
      (error) => error.code === ADAPTER_CODE.FAILED_TARGET_TENANT_MISSING && !String(error.safeMessage).includes('fk text')
    );
    assert.strictEqual(mapPrismaError({ code: 'P2003' }), ADAPTER_CODE.FAILED_TARGET_TENANT_MISSING);
  });

  await record('12 Connection error maps safely', async () => {
    const prisma = createPrismaMock({ tenant: { findUniqueError: { code: 'P1001', message: 'cannot reach host' } } });
    await assert.rejects(
      () => createRepo(prisma).targetTenantExists('tenant_A'),
      (error) => error.code === ADAPTER_CODE.DATABASE_UNAVAILABLE
    );
  });

  await record('13 Disconnect is called', async () => {
    const prisma = createPrismaMock();
    await createRepo(prisma).disconnect();
    assert.strictEqual(prisma._stats().disconnectCalls, 0, 'injected mock is not owned and should not auto-disconnect');
    let disconnects = 0;
    const repo = createPrismaBackfillRepository({ clientFactory: () => ({ ...createPrismaMock(), $disconnect: async () => { disconnects += 1; } }) });
    await repo.disconnect();
    assert.strictEqual(disconnects, 0);
    await assert.rejects(() => repo.getCurrentOwner('Message', 'bad'), (error) => error.code === ADAPTER_CODE.UNSUPPORTED_MODEL);
    await repo.disconnect();
    assert.strictEqual(disconnects, 1);
  });

  await record('14 Adapter does not log raw errors', async () => {
    const originalError = console.error;
    const originalLog = console.log;
    let writes = 0;
    console.error = () => { writes += 1; };
    console.log = () => { writes += 1; };
    try {
      const prisma = createPrismaMock({ tenant: { findUniqueError: { code: 'P1001', message: 'sensitive raw text' } } });
      await assert.rejects(() => createRepo(prisma).targetTenantExists('tenant_A'));
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
    assert.strictEqual(writes, 0);
  });

  await record('15 No-action policy does not create write', async () => {
    const prisma = createPrismaMock({ rows: { 'FacebookPage:page_1': { id: 'page_1', tenantId: null } } });
    const policy = evaluateNoActionPolicy({ actions: [{ model: 'FacebookPage', recordId: 'page_1', status: 'SKIP_NO_MAPPING' }] });
    assert.strictEqual(policy.code, ADAPTER_CODE.NO_ACTION_REQUIRED);
    assert.strictEqual(policy.shouldWrite, false);
    assert.strictEqual(prisma._calls.some((call) => call.method === 'updateMany'), false);
  });

  await record('16 Approval schema valid', async () => {
    const result = validateApproval(approval, {
      now: '2026-07-18T01:00:00.000Z',
      target: 'bbotech-local',
      planHash: goodHash,
      execHash: otherHash,
      readyCount: 2,
      requiredModels: ['FacebookPage'],
    });
    assert.strictEqual(result.ok, true);
  });

  await record('17 Approval expired rejects', async () => {
    const expired = { ...approval, expiresAt: '2026-07-17T00:00:00.000Z' };
    const result = validateApproval(expired, { now: '2026-07-18T00:00:00.000Z' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, ADAPTER_CODE.APPROVAL_EXPIRED);
  });

  await record('18 Target mismatch rejects', async () => {
    const result = assertTargetConfirmation({
      confirmTarget: 'other-target',
      approval,
      dbIdentity: { target: 'bbotech-local', databaseName: 'bbotech_local_db', environmentClass: 'LOCAL', hostClass: 'LOCAL' },
      expectedDatabaseName: 'bbotech_local_db',
      expectedEnvironmentClass: 'LOCAL',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, ADAPTER_CODE.TARGET_CONFIRMATION_FAILED);
  });

  await record('19 Approval binds execHash and planHash', async () => {
    assert.strictEqual(validateApproval(approval, { planHash: goodHash, execHash: otherHash, now: '2026-07-18T00:00:00.000Z' }).ok, true);
    assert.strictEqual(validateApproval(approval, { planHash: 'c'.repeat(64), execHash: otherHash, now: '2026-07-18T00:00:00.000Z' }).ok, false);
    assert.strictEqual(validateApproval(approval, { planHash: goodHash, execHash: 'd'.repeat(64), now: '2026-07-18T00:00:00.000Z' }).ok, false);
  });

  await record('20 Live CLI remains disconnected and locked', async () => {
    assert.strictEqual(executorBefore.LIVE_WRITE_ENABLED, false);
    const gate = executorBefore.assertLiveApplyGate({ plan: 'p', expectedPlanHash: 'h', approvalFile: 'a', manifestOutput: 'm', confirmTarget: 't' });
    assert.strictEqual(gate.blocked, true);
    assert.strictEqual(gate.enabled, false);
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  return results;
}

run()
  .then((results) => {
    for (const line of results) console.log(line);
    console.log(`tenant-backfill-prisma-adapter-smoke: MOCK_PASS (${results.length} checks)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('tenant-backfill-prisma-adapter-smoke: FAIL - ASSERTION_FAILED');
    process.exit(1);
  });
