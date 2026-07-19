'use strict';

// Smoke matrix for the durable local completion ledger + approval claim.
// Mock-only. No PrismaClient, no network, no environment read.

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const beforeExecutorLoad = require.cache[require.resolve('@prisma/client')];
void beforeExecutorLoad;

const {
  LEDGER_CODE,
  createFileCompletionLedger,
  computeRecordHash,
  verifyLedgerChain,
} = require('./tenant-backfill-completion-ledger');

const NOW = Date.parse('2026-07-18T00:10:00.000Z');

function ledgerPathIn(dir) {
  return path.join(dir, 'tenant-backfill-ledger.jsonl');
}

function makeLedger(dir, overrides = {}) {
  return createFileCompletionLedger({
    ledgerPath: ledgerPathIn(dir),
    clock: () => NOW,
    ...overrides,
  });
}

function completion(overrides = {}) {
  return {
    approvalId: 'approval-fixture-001',
    operationId: 'op_1',
    planHash: 'a'.repeat(64),
    execHash: 'b'.repeat(64),
    target: 'bbotech-local-sanitized',
    completedAt: '2026-07-18T00:10:00.000Z',
    ...overrides,
  };
}

// io wrapper that forces a sync() failure on the next opened handle matching a flag.
function failingSyncIo(flagToFail) {
  const realOpen = (p, flags) => fsp.open(p, flags);
  return {
    open: async (p, flags) => {
      const handle = await realOpen(p, flags);
      if (flags === flagToFail) {
        return {
          write: (...args) => handle.write(...args),
          sync: async () => { throw new Error('SIMULATED_FSYNC_FAILURE'); },
          close: (...args) => handle.close(...args),
          stat: (...args) => handle.stat(...args),
        };
      }
      return handle;
    },
  };
}

async function caseDir(root, label) {
  const dir = path.join(root, label.replace(/[^a-z0-9_-]/gi, '_'));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tenant-backfill-ledger-smoke-'));
  const results = [];
  const record = async (name, fn) => {
    await fn(await caseDir(root, name));
    results.push(`PASS - ${name}`);
  };

  await record('1 Import has no side effect', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('2 New ledger inspect PASS', async (dir) => {
    const ledger = makeLedger(dir);
    const summary = await ledger.inspect();
    assert.strictEqual(summary.ok, true);
    assert.strictEqual(summary.recordCount, 0);
    assert.strictEqual(summary.chainValid, true);
    assert.strictEqual(summary.code, LEDGER_CODE.LEDGER_EMPTY);
  });

  await record('3 Completion append PASS', async (dir) => {
    const ledger = makeLedger(dir);
    const out = await ledger.recordCompletion(completion());
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.code, LEDGER_CODE.COMPLETION_RECORDED);
    assert.strictEqual(fs.existsSync(ledgerPathIn(dir)), true);
    const content = fs.readFileSync(ledgerPathIn(dir), 'utf8');
    assert.ok(content.endsWith('\n'));
  });

  await record('4 Completion hash chain PASS', async (dir) => {
    const ledger = makeLedger(dir);
    await ledger.recordCompletion(completion({ approvalId: 'a-1', operationId: 'op_a' }));
    await ledger.recordCompletion(completion({ approvalId: 'a-2', operationId: 'op_b' }));
    const records = fs.readFileSync(ledgerPathIn(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const verification = verifyLedgerChain(records);
    assert.strictEqual(verification.ok, true);
    assert.strictEqual(records[1].previousRecordHash, records[0].recordHash);
  });

  await record('5 Tampered record reject', async (dir) => {
    const ledger = makeLedger(dir);
    await ledger.recordCompletion(completion());
    const raw = fs.readFileSync(ledgerPathIn(dir), 'utf8');
    const parsed = JSON.parse(raw.trim());
    parsed.target = 'tampered-target';
    fs.writeFileSync(ledgerPathIn(dir), `${JSON.stringify(parsed)}\n`, 'utf8');
    await assert.rejects(() => ledger.hasApproval('approval-fixture-001'), (err) => err.code === LEDGER_CODE.LEDGER_TAMPERED);
  });

  await record('6 Truncated JSONL reject', async (dir) => {
    const ledger = makeLedger(dir);
    await ledger.recordCompletion(completion());
    const raw = fs.readFileSync(ledgerPathIn(dir), 'utf8');
    fs.writeFileSync(ledgerPathIn(dir), raw.replace(/\n$/, ''), 'utf8');
    await assert.rejects(() => ledger.hasApproval('approval-fixture-001'), (err) => err.code === LEDGER_CODE.LEDGER_TRUNCATED);
  });

  await record('7 Duplicate approval detected', async (dir) => {
    const ledger = makeLedger(dir);
    const first = await ledger.recordCompletion(completion());
    assert.strictEqual(first.ok, true);
    const dup = await ledger.recordCompletion(completion({ operationId: 'op_dup' }));
    assert.strictEqual(dup.ok, false);
    assert.strictEqual(dup.code, LEDGER_CODE.DUPLICATE_APPROVAL);
    assert.strictEqual(await ledger.hasApproval('approval-fixture-001'), true);
  });

  await record('8 Exclusive approval claim PASS', async (dir) => {
    const ledger = makeLedger(dir);
    const claim = await ledger.claimApproval('approval-claim-1', 'op_claim_1', { target: 'bbotech-local-sanitized' });
    assert.strictEqual(claim.ok, true);
    assert.strictEqual(claim.code, LEDGER_CODE.APPROVAL_CLAIMED);
    const claimsDir = path.join(dir, 'claims');
    const files = fs.readdirSync(claimsDir);
    assert.strictEqual(files.length, 1);
    const stored = JSON.parse(fs.readFileSync(path.join(claimsDir, files[0]), 'utf8'));
    // Raw approval id must NOT be present on disk.
    assert.strictEqual(JSON.stringify(stored).includes('approval-claim-1'), false);
    assert.ok(stored.approvalIdHash);
  });

  await record('9 Concurrent second claim reject', async (dir) => {
    const ledger = makeLedger(dir);
    const first = await ledger.claimApproval('approval-claim-2', 'op_first');
    assert.strictEqual(first.ok, true);
    const second = await ledger.claimApproval('approval-claim-2', 'op_second');
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.code, LEDGER_CODE.APPROVAL_ALREADY_CLAIMED);
  });

  await record('10 Claim fsync failure reject', async (dir) => {
    const ledger = makeLedger(dir, { io: failingSyncIo('wx') });
    const claim = await ledger.claimApproval('approval-claim-fsync', 'op_fsync');
    assert.strictEqual(claim.ok, false);
    assert.strictEqual(claim.code, LEDGER_CODE.CLAIM_FSYNC_FAILED);
    // No phantom claim survives a non-durable write.
    const claimsDir = path.join(dir, 'claims');
    const files = fs.existsSync(claimsDir) ? fs.readdirSync(claimsDir) : [];
    assert.strictEqual(files.length, 0);
  });

  await record('11 Ledger append fsync failure reject', async (dir) => {
    const ledger = makeLedger(dir, { io: failingSyncIo('a') });
    const out = await ledger.recordCompletion(completion());
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.code, LEDGER_CODE.LEDGER_APPEND_FSYNC_FAILED);
  });

  await record('12 Stale claim requires operator', async (dir) => {
    const ledger = makeLedger(dir, { maxClaimAgeMs: 1000 });
    const first = await ledger.claimApproval('approval-stale', 'op_old', { clock: () => NOW });
    assert.strictEqual(first.ok, true);
    const later = await ledger.claimApproval('approval-stale', 'op_new', { clock: () => NOW + 5000 });
    assert.strictEqual(later.ok, false);
    assert.strictEqual(later.code, LEDGER_CODE.APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION);
  });

  await record('13 Claim not auto-stolen', async (dir) => {
    const ledger = makeLedger(dir, { maxClaimAgeMs: 1000 });
    await ledger.claimApproval('approval-nosteal', 'op_owner', { clock: () => NOW });
    const claimsDir = path.join(dir, 'claims');
    const files = fs.readdirSync(claimsDir);
    const before = fs.readFileSync(path.join(claimsDir, files[0]), 'utf8');
    // Stale re-claim surfaces operator decision but must not overwrite.
    const attempt = await ledger.claimApproval('approval-nosteal', 'op_thief', { clock: () => NOW + 999999 });
    assert.strictEqual(attempt.ok, false);
    const after = fs.readFileSync(path.join(claimsDir, files[0]), 'utf8');
    assert.strictEqual(before, after);
    // releaseClaim by a non-owner must not delete either.
    const release = await ledger.releaseClaim('approval-nosteal', 'op_thief');
    assert.strictEqual(release.ok, false);
    assert.strictEqual(release.code, LEDGER_CODE.APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION);
    assert.strictEqual(fs.existsSync(path.join(claimsDir, files[0])), true);
  });

  await record('14 Unsafe payload key reject', async (dir) => {
    const ledger = makeLedger(dir);
    await assert.rejects(
      () => ledger.recordCompletion(completion({ databaseUrl: 'postgresql://x' })),
      (err) => err.code === LEDGER_CODE.UNSAFE_LEDGER_PAYLOAD,
    );
    assert.strictEqual(fs.existsSync(ledgerPathIn(dir)), false);
  });

  await record('15 Logger receives no raw approval', async (dir) => {
    // The ledger never stores or emits the raw approval id; verify persisted bytes.
    const ledger = makeLedger(dir);
    await ledger.recordCompletion(completion({ approvalId: 'super-secret-approval-id' }));
    await ledger.claimApproval('another-secret-approval', 'op_x');
    const ledgerContent = fs.readFileSync(ledgerPathIn(dir), 'utf8');
    assert.strictEqual(ledgerContent.includes('super-secret-approval-id'), false);
    const claimsDir = path.join(dir, 'claims');
    for (const file of fs.readdirSync(claimsDir)) {
      const body = fs.readFileSync(path.join(claimsDir, file), 'utf8');
      assert.strictEqual(body.includes('another-secret-approval'), false);
    }
  });

  await record('16 No PrismaClient', async () => {
    assert.strictEqual(require.cache[require.resolve('@prisma/client')], undefined);
  });

  await record('17 No network', async (dir) => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
    try {
      const ledger = makeLedger(dir);
      const out = await ledger.recordCompletion(completion());
      assert.strictEqual(out.ok, true);
      assert.strictEqual(calls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await record('18 No environment read', async (dir) => {
    const proxyHits = [];
    const realEnv = process.env;
    const trap = new Proxy(realEnv, {
      get(target, prop) {
        if (typeof prop === 'string' && prop !== 'then') proxyHits.push(prop);
        return target[prop];
      },
    });
    Object.defineProperty(process, 'env', { value: trap, configurable: true });
    try {
      const ledger = makeLedger(dir);
      await ledger.recordCompletion(completion());
      await ledger.claimApproval('approval-env', 'op_env');
      await ledger.inspect();
      assert.strictEqual(proxyHits.length, 0);
    } finally {
      Object.defineProperty(process, 'env', { value: realEnv, configurable: true });
    }
  });

  // Additional integrity check: recomputed hash matches stored.
  await record('19 Record hash recompute matches', async (dir) => {
    const ledger = makeLedger(dir);
    await ledger.recordCompletion(completion());
    const stored = JSON.parse(fs.readFileSync(ledgerPathIn(dir), 'utf8').trim());
    assert.strictEqual(computeRecordHash(stored), stored.recordHash);
  });

  await fsp.rm(root, { recursive: true, force: true });
  return results;
}

run()
  .then((results) => {
    for (const line of results) console.log(line);
    console.log(`tenant-backfill-completion-ledger-smoke: MOCK_PASS (${results.length} checks)`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('tenant-backfill-completion-ledger-smoke: FAIL - ASSERTION_FAILED');
    console.error(String(error && error.message ? error.message : error).split('\n')[0]);
    process.exit(1);
  });
