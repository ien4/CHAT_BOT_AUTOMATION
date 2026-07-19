'use strict';

// P0-TENANT-BACKFILL-LIVE-ENTRYPOINT-DESIGN-01
// Durable, append-only, local-only completion ledger + exclusive approval claim.
//
// Scope: LOCAL single-host safety only. This module makes NO claim of
// distributed / multi-host locking. It never imports PrismaClient, never reads
// DATABASE_URL, never reads process.env, and never performs a network call.
//
// Two independent guarantees:
//   1. claimApproval() uses exclusive create (open mode 'wx') so a second
//      concurrent claim on the same approval fails instead of racing.
//   2. recordCompletion() appends one verified JSON line, fsyncs it, and only
//      then reports success. The hash chain detects tamper/truncation.

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LEDGER_CODE = Object.freeze({
  LEDGER_OK: 'LEDGER_OK',
  LEDGER_EMPTY: 'LEDGER_EMPTY',
  COMPLETION_RECORDED: 'COMPLETION_RECORDED',
  DUPLICATE_APPROVAL: 'DUPLICATE_APPROVAL',
  APPROVAL_CLAIMED: 'APPROVAL_CLAIMED',
  APPROVAL_ALREADY_CLAIMED: 'APPROVAL_ALREADY_CLAIMED',
  CLAIM_RELEASED: 'CLAIM_RELEASED',
  CLAIM_NOT_FOUND: 'CLAIM_NOT_FOUND',
  CLAIM_MISMATCH: 'CLAIM_MISMATCH',
  CLAIM_WRITE_FAILED: 'CLAIM_WRITE_FAILED',
  CLAIM_FSYNC_FAILED: 'CLAIM_FSYNC_FAILED',
  LEDGER_WRITE_FAILED: 'LEDGER_WRITE_FAILED',
  LEDGER_APPEND_FSYNC_FAILED: 'LEDGER_APPEND_FSYNC_FAILED',
  APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION: 'APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION',
  LEDGER_CORRUPTED: 'LEDGER_CORRUPTED',
  LEDGER_TRUNCATED: 'LEDGER_TRUNCATED',
  LEDGER_TAMPERED: 'LEDGER_TAMPERED',
  LEDGER_CONCURRENT_MODIFICATION: 'LEDGER_CONCURRENT_MODIFICATION',
  UNSAFE_LEDGER_PAYLOAD: 'UNSAFE_LEDGER_PAYLOAD',
});

const RECORD_VERSION = 1;
const CLAIM_VERSION = 1;
const HASH_RE = /^[0-9a-f]{64}$/;
const DEFAULT_MAX_CLAIM_AGE_MS = 60 * 60 * 1000;

// Same denylist vocabulary as operational-safety: no secret / raw / PII / DB
// connection material may ever be persisted into a ledger or claim record.
// (approvalId is deliberately NOT in this list — it is accepted as input and
// only ever persisted as approvalIdHash, never verbatim.)
const UNSAFE_KEY_RE = /(secret|token|databaseurl|connectionstring|raw|payload|message|content|phone|email|fbuserid|fbusername|customername|customerid)/i;

class CompletionLedgerError extends Error {
  constructor(code, safeMessage, details = {}) {
    super(safeMessage || code);
    this.name = 'CompletionLedgerError';
    this.code = code;
    this.safeMessage = safeMessage || code;
    this.details = details;
  }
}

function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashPrefix(value) {
  return String(value || '').slice(0, 12);
}

function nowMs(clock) {
  if (typeof clock === 'function') {
    const value = clock();
    return typeof value === 'number' ? value : new Date(value).getTime();
  }
  return Date.now();
}

// approvalIdHash is the only representation of an approval id persisted or
// used in a filesystem path. The raw id never touches disk.
function approvalHash(approvalId) {
  if (!approvalId || typeof approvalId !== 'string') {
    throw new CompletionLedgerError(LEDGER_CODE.UNSAFE_LEDGER_PAYLOAD, 'approvalId is required');
  }
  return sha256Hex(approvalId);
}

function assertSafeKeys(value, pathPrefix = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeKeys(item, `${pathPrefix}[${index}]`));
    return;
  }
  for (const key of Object.keys(value)) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (UNSAFE_KEY_RE.test(key)) {
      throw new CompletionLedgerError(LEDGER_CODE.UNSAFE_LEDGER_PAYLOAD, 'Unsafe ledger payload key', { key: currentPath });
    }
    assertSafeKeys(value[key], currentPath);
  }
}

function createDefaultIo() {
  return {
    open: (filePath, flags) => fsp.open(filePath, flags),
    readFile: (filePath, enc) => fsp.readFile(filePath, enc),
    stat: (filePath) => fsp.stat(filePath),
    mkdir: (dirPath, options) => fsp.mkdir(dirPath, options),
    unlink: (filePath) => fsp.unlink(filePath),
    access: (filePath) => fsp.access(filePath, fs.constants.F_OK),
  };
}

function normalizeIo(io) {
  return { ...createDefaultIo(), ...(io || {}) };
}

async function fsyncDirectoryIfSupported(io, dirPath) {
  let handle;
  try {
    handle = await io.open(dirPath, 'r');
    await handle.sync();
    await handle.close();
    return true;
  } catch (_) {
    if (handle) {
      try { await handle.close(); } catch (_) {}
    }
    return false;
  }
}

function parseLedgerContent(content) {
  if (!content) return [];
  if (!content.endsWith('\n')) {
    throw new CompletionLedgerError(LEDGER_CODE.LEDGER_TRUNCATED, 'Ledger final line is truncated');
  }
  const lines = content.split('\n').filter(Boolean);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (_) {
      throw new CompletionLedgerError(LEDGER_CODE.LEDGER_CORRUPTED, 'Ledger line is not valid JSON');
    }
  });
}

function recordWithoutHash(record) {
  const { recordHash, ...rest } = record;
  return rest;
}

function computeRecordHash(record) {
  return sha256Hex(stableStringify(recordWithoutHash(record)));
}

function verifyLedgerChain(records) {
  let previousHash = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.version !== RECORD_VERSION) {
      return { ok: false, reason: 'VERSION_INVALID', index };
    }
    if ((record.previousRecordHash || null) !== previousHash) {
      return { ok: false, reason: 'PREVIOUS_HASH_INVALID', index };
    }
    if (!HASH_RE.test(String(record.recordHash || '')) || computeRecordHash(record) !== record.recordHash) {
      return { ok: false, reason: 'RECORD_HASH_INVALID', index };
    }
    previousHash = record.recordHash;
  }
  return { ok: true, lastHash: previousHash, count: records.length };
}

// Serializes recordCompletion within this process instance. This is the
// process-level serialization referenced by the concurrency policy; it does
// NOT provide cross-host safety.
function createMutex() {
  let tail = Promise.resolve();
  return function runExclusive(task) {
    const result = tail.then(() => task());
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

function createFileCompletionLedger(options = {}) {
  const ledgerPath = options.ledgerPath
    ? path.resolve(options.ledgerPath)
    : path.resolve(__dirname, '..', '..', 'tmp-runtime', 'tenant-backfill-ledger.jsonl');
  const ledgerDir = path.dirname(ledgerPath);
  const claimsDir = options.claimsDir
    ? path.resolve(options.claimsDir)
    : path.join(ledgerDir, 'claims');
  const io = normalizeIo(options.io);
  const clock = options.clock || null;
  const maxClaimAgeMs = Number.isFinite(options.maxClaimAgeMs) ? options.maxClaimAgeMs : DEFAULT_MAX_CLAIM_AGE_MS;
  // Opaque per-process identity. Never a real hostname/pid in cleartext on disk.
  const processIdentityHash = sha256Hex(options.processIdentity || `${os.hostname()}:${process.pid}`);
  const runExclusive = createMutex();

  function claimPathFor(approvalIdHash) {
    return path.join(claimsDir, `${approvalIdHash}.claim.json`);
  }

  async function statSize(filePath) {
    try {
      const stat = await io.stat(filePath);
      return Number(stat.size);
    } catch (error) {
      if (error && error.code === 'ENOENT') return -1;
      throw error;
    }
  }

  async function readLedgerRecords() {
    let content;
    try {
      content = await io.readFile(ledgerPath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return { records: [], verification: { ok: true, lastHash: null, count: 0 } };
      throw new CompletionLedgerError(LEDGER_CODE.LEDGER_CORRUPTED, 'Ledger cannot be read safely');
    }
    const records = parseLedgerContent(content);
    const verification = verifyLedgerChain(records);
    if (!verification.ok) {
      throw new CompletionLedgerError(LEDGER_CODE.LEDGER_TAMPERED, 'Ledger hash chain is invalid', { reason: verification.reason });
    }
    return { records, verification };
  }

  async function hasApproval(approvalId) {
    if (!approvalId) return false;
    const targetHash = approvalHash(approvalId);
    const { records } = await readLedgerRecords();
    return records.some((record) => record.approvalIdHash === targetHash);
  }

  async function claimApproval(approvalId, operationId, claimOptions = {}) {
    const approvalIdHash = approvalHash(approvalId);
    if (!operationId || typeof operationId !== 'string') {
      return { ok: false, code: LEDGER_CODE.CLAIM_WRITE_FAILED, reason: 'OPERATION_ID_REQUIRED' };
    }
    const target = claimOptions.target || null;
    const createdAtMs = nowMs(claimOptions.clock || clock);
    const claimPath = claimPathFor(approvalIdHash);

    const claimRecord = {
      version: CLAIM_VERSION,
      approvalIdHash,
      operationId,
      createdAt: new Date(createdAtMs).toISOString(),
      processIdentityHash,
      target,
    };
    assertSafeKeys(claimRecord);

    await io.mkdir(claimsDir, { recursive: true });

    let handle;
    try {
      handle = await io.open(claimPath, 'wx');
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        return classifyExistingClaim(approvalIdHash, operationId, createdAtMs);
      }
      return { ok: false, code: LEDGER_CODE.CLAIM_WRITE_FAILED, reason: 'CLAIM_OPEN_FAILED' };
    }

    try {
      await handle.write(`${stableStringify(claimRecord)}\n`);
      await handle.sync();
      await handle.close();
      handle = null;
    } catch (error) {
      if (handle) {
        try { await handle.close(); } catch (_) {}
      }
      // Non-durable claim: remove the phantom so no unverified claim survives.
      try { await io.unlink(claimPath); } catch (_) {}
      return { ok: false, code: LEDGER_CODE.CLAIM_FSYNC_FAILED, reason: 'CLAIM_NOT_DURABLE' };
    }

    await fsyncDirectoryIfSupported(io, claimsDir);
    return {
      ok: true,
      code: LEDGER_CODE.APPROVAL_CLAIMED,
      approvalIdHash,
      operationId,
      claimBasename: path.basename(claimPath),
    };
  }

  async function classifyExistingClaim(approvalIdHash, operationId, createdAtMs) {
    const claimPath = claimPathFor(approvalIdHash);
    let existing = null;
    try {
      existing = JSON.parse(await io.readFile(claimPath, 'utf8'));
    } catch (_) {
      existing = null;
    }
    const existingCreatedMs = existing && existing.createdAt ? new Date(existing.createdAt).getTime() : NaN;
    const age = Number.isFinite(existingCreatedMs) ? createdAtMs - existingCreatedMs : NaN;
    // Never auto-steal. A stale claim is surfaced for operator decision only.
    if (Number.isFinite(age) && age > maxClaimAgeMs) {
      return {
        ok: false,
        code: LEDGER_CODE.APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION,
        approvalIdHash,
        requiresOperator: true,
        stale: true,
      };
    }
    return {
      ok: false,
      code: LEDGER_CODE.APPROVAL_ALREADY_CLAIMED,
      approvalIdHash,
      requiresOperator: true,
      sameOperation: Boolean(existing && existing.operationId === operationId),
    };
  }

  async function releaseClaim(approvalId, operationId) {
    const approvalIdHash = approvalHash(approvalId);
    const claimPath = claimPathFor(approvalIdHash);
    let existing;
    try {
      existing = JSON.parse(await io.readFile(claimPath, 'utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return { ok: false, code: LEDGER_CODE.CLAIM_NOT_FOUND, approvalIdHash };
      }
      return { ok: false, code: LEDGER_CODE.CLAIM_MISMATCH, approvalIdHash };
    }
    // Only the owning operation may release its own claim. No auto-steal.
    if (!operationId || existing.operationId !== operationId) {
      return {
        ok: false,
        code: LEDGER_CODE.APPROVAL_CLAIM_REQUIRES_OPERATOR_DECISION,
        approvalIdHash,
        requiresOperator: true,
      };
    }
    await io.unlink(claimPath);
    await fsyncDirectoryIfSupported(io, claimsDir);
    return { ok: true, code: LEDGER_CODE.CLAIM_RELEASED, approvalIdHash };
  }

  async function recordCompletion(input = {}) {
    return runExclusive(async () => {
      // Reject any caller-supplied unsafe key (secret / raw / DB / PII) before
      // we build the whitelisted record.
      assertSafeKeys(input);
      const approvalIdHash = approvalHash(input.approvalId || input.approvalIdHash);
      const completedRecord = {
        version: RECORD_VERSION,
        approvalIdHash,
        operationId: input.operationId || null,
        planHash: input.planHash || null,
        execHash: input.execHash || null,
        target: input.target || null,
        completedAt: input.completedAt || new Date(nowMs(clock)).toISOString(),
        previousRecordHash: null,
        recordHash: null,
      };
      // Whitelist enforced by construction above; this rejects any accidental
      // unsafe field that a caller might expect us to persist verbatim.
      assertSafeKeys(recordWithoutHash(completedRecord));

      await io.mkdir(ledgerDir, { recursive: true });

      // Read + verify current chain, then remember its size fingerprint.
      const { records, verification } = await readLedgerRecords();
      if (records.some((record) => record.approvalIdHash === approvalIdHash)) {
        return { ok: false, code: LEDGER_CODE.DUPLICATE_APPROVAL, approvalIdHash };
      }
      const sizeBeforeBuild = await statSize(ledgerPath);

      completedRecord.previousRecordHash = verification.lastHash || null;
      completedRecord.recordHash = computeRecordHash(completedRecord);

      // Concurrency guard: if the ledger changed on disk since verification,
      // an external writer touched it. Stop; do not retry automatically.
      const sizeBeforeAppend = await statSize(ledgerPath);
      if (sizeBeforeAppend !== sizeBeforeBuild) {
        return { ok: false, code: LEDGER_CODE.LEDGER_CONCURRENT_MODIFICATION };
      }

      let handle;
      try {
        handle = await io.open(ledgerPath, 'a');
        await handle.write(`${stableStringify(completedRecord)}\n`);
        await handle.sync();
        await handle.close();
        handle = null;
      } catch (error) {
        if (handle) {
          try { await handle.close(); } catch (_) {}
        }
        return { ok: false, code: LEDGER_CODE.LEDGER_APPEND_FSYNC_FAILED };
      }
      await fsyncDirectoryIfSupported(io, ledgerDir);

      return {
        ok: true,
        code: LEDGER_CODE.COMPLETION_RECORDED,
        approvalIdHash,
        recordHashPrefix: hashPrefix(completedRecord.recordHash),
        operationId: completedRecord.operationId,
      };
    });
  }

  async function inspect() {
    let records = [];
    let chainValid = true;
    let corruptionCode = null;
    try {
      const read = await readLedgerRecords();
      records = read.records;
    } catch (error) {
      if (error instanceof CompletionLedgerError) {
        chainValid = false;
        corruptionCode = error.code;
      } else {
        throw error;
      }
    }

    let claimCount = 0;
    try {
      const entries = await fsp.readdir(claimsDir);
      claimCount = entries.filter((name) => name.endsWith('.claim.json')).length;
    } catch (_) {
      claimCount = 0;
    }

    let ledgerExists = true;
    try {
      await io.access(ledgerPath);
    } catch (_) {
      ledgerExists = false;
    }

    return {
      ok: chainValid,
      code: corruptionCode || (records.length === 0 ? LEDGER_CODE.LEDGER_EMPTY : LEDGER_CODE.LEDGER_OK),
      ledgerBasename: path.basename(ledgerPath),
      ledgerExists,
      recordCount: records.length,
      chainValid,
      claimCount,
      lastRecordHashPrefix: records.length ? hashPrefix(records[records.length - 1].recordHash) : null,
    };
  }

  return {
    hasApproval,
    claimApproval,
    releaseClaim,
    recordCompletion,
    inspect,
  };
}

module.exports = {
  LEDGER_CODE,
  RECORD_VERSION,
  CompletionLedgerError,
  createFileCompletionLedger,
  computeRecordHash,
  verifyLedgerChain,
  stableStringify,
};
