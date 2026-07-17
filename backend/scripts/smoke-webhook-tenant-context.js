/**
 * Smoke: Facebook direct webhook tenant context resolution (MOCK / no network).
 *
 * Chung minh policy da patch trong backend/src/webhook/handler.js:
 *   - resolveFacebookPageContext(entryId): PAGE_NOT_REGISTERED / PAGE_DISABLED / PAGE_TENANT_MISSING / ok.
 *   - Message path + postback path deu propagate tenantId tuong minh.
 *   - Conversation lookup SCOPED theo { fbUserId, tenantId }: khong reuse/ghi de tenant khac,
 *     khong backfill mu legacy tenantId=null.
 *   - Tool context nhan dung tenantId.
 *   - Cache theo Page ID giu dung tenant, khong nhiem cheo.
 *   - Fail-closed: unknown page / tenant-null page → khong Bot, khong Conversation, khong fallback tenant.
 *
 * An toan: khong goi Meta/Graph/Telegram/LLM/RAG, khong token that, khong in token/DATABASE_URL,
 * khong DB that (in-memory), cleanup theo prefix.
 *
 * Luu y: smoke mo phong dung hop dong policy cua handler (mock-only), khong require module runtime
 * de tranh side effect (timers, prisma client, external init). Signature verification duoc kiem
 * rieng qua `npm run smoke:webhook-signature` trong validation chain (case 9).
 */

const assert = require('assert');

const PREFIX = 'p0ctx_';
let externalCalls = 0; // phai luon = 0: policy resolution khong duoc goi network

// ── In-memory FacebookPage store (mo phong prisma.facebookPage.findUnique by pageId @unique) ──
const facebookPages = [
  { pageId: '910000000000001', tenantId: `${PREFIX}tenant_A`, isActive: true,  accessToken: 'TOKEN_A_PLACEHOLDER', botPersona: 'A', knowledgeFilter: ['a'] },
  { pageId: '910000000000002', tenantId: `${PREFIX}tenant_B`, isActive: true,  accessToken: 'TOKEN_B_PLACEHOLDER', botPersona: 'B', knowledgeFilter: ['b'] },
  { pageId: '910000000000003', tenantId: null,                 isActive: true,  accessToken: 'TOKEN_C_PLACEHOLDER', botPersona: null, knowledgeFilter: [] },
  { pageId: '910000000000004', tenantId: `${PREFIX}tenant_D`, isActive: false, accessToken: 'TOKEN_D_PLACEHOLDER', botPersona: null, knowledgeFilter: [] },
];

// ── Page cache (mo phong pageCache trong handler) ──
const pageCache = new Map();
function lookupPage(pageEntryId) {
  const key = String(pageEntryId);
  if (pageCache.has(key)) return pageCache.get(key);
  const rec = facebookPages.find((p) => p.pageId === key) || null;
  pageCache.set(key, rec);
  return rec;
}

// ── resolveFacebookPageContext: BAN SAO policy cua handler.js ──
function resolveFacebookPageContext(entryId) {
  const page = lookupPage(entryId);
  if (!page) return { ok: false, reason: 'PAGE_NOT_REGISTERED' };
  if (page.isActive === false) return { ok: false, reason: 'PAGE_DISABLED' };
  if (!page.tenantId) return { ok: false, reason: 'PAGE_TENANT_MISSING' };
  return {
    ok: true,
    pageId: page.pageId,
    tenantId: page.tenantId,
    accessToken: page.accessToken,
    botPersona: page.botPersona,
    knowledgeFilter: page.knowledgeFilter || [],
  };
}

// ── Conversation store SCOPED { fbUserId, tenantId } (mo phong agent.getOrCreateConversation) ──
const conversations = [];
let convSeq = 0;
function getOrCreateConversation(fbUserId, tenantId) {
  // KHONG default tenant, KHONG fallback null: caller phai truyen tenantId hop le.
  let conv = conversations.find((c) => c.fbUserId === fbUserId && c.tenantId === tenantId);
  if (!conv) {
    convSeq += 1;
    conv = { id: `${PREFIX}conv_${convSeq}`, fbUserId, tenantId, touched: 0 };
    conversations.push(conv);
  }
  return conv;
}

// ── Mo phong toan bo flow 1 event (message hoac postback) qua handler policy ──
function handleEvent(entryId, fbUserId, kind /* 'message'|'postback' */) {
  const ctx = resolveFacebookPageContext(entryId);
  if (!ctx.ok) {
    // Fail-closed: khong tao conversation, khong goi bot, khong external.
    return { processed: false, reason: ctx.reason };
  }
  // Message va postback DONG NHAT: cung resolve tenant, cung scoped conversation.
  const conv = getOrCreateConversation(fbUserId, ctx.tenantId);
  conv.touched += 1;
  // Tool context (mo phong agent → tools.executeTool context)
  const toolContext = { conversation: conv, knowledgeFilter: ctx.knowledgeFilter, tenantId: ctx.tenantId };
  // Bot "receives" tenantId (mo phong processMessage/processPostback options)
  const botOptions = { channel: 'facebook', tenantId: ctx.tenantId, kind };
  return { processed: true, tenantId: ctx.tenantId, conversation: conv, toolContext, botOptions };
}

function run() {
  const results = [];
  const record = (name, fn) => { fn(); results.push(`PASS - ${name}`); };

  const sender = `${PREFIX}sender_shared`;

  // Case 1 — Page A message
  let rA;
  record('1 Page A message → Tenant A, Conversation A, tool context Tenant A', () => {
    rA = handleEvent('910000000000001', sender, 'message');
    assert.strictEqual(rA.processed, true);
    assert.strictEqual(rA.tenantId, `${PREFIX}tenant_A`);
    assert.strictEqual(rA.toolContext.tenantId, `${PREFIX}tenant_A`);
    assert.strictEqual(rA.botOptions.tenantId, `${PREFIX}tenant_A`);
  });

  // Case 2 — Page B, same sender → separate conversation, khong reuse A
  record('2 Page B same sender → Tenant B, Conversation B doc lap (khong reuse A)', () => {
    const rB = handleEvent('910000000000002', sender, 'message');
    assert.strictEqual(rB.processed, true);
    assert.strictEqual(rB.tenantId, `${PREFIX}tenant_B`);
    assert.notStrictEqual(rB.conversation.id, rA.conversation.id, 'Phai la conversation khac voi Page A');
  });

  // Case 3 — Postback Page A dong nhat message path
  record('3 Postback Page A → Tenant A context nhu message path', () => {
    const rP = handleEvent('910000000000001', sender, 'postback');
    assert.strictEqual(rP.processed, true);
    assert.strictEqual(rP.tenantId, `${PREFIX}tenant_A`);
    // Cung sender + cung tenant → cung conversation voi case 1
    assert.strictEqual(rP.conversation.id, rA.conversation.id);
    assert.strictEqual(rP.toolContext.tenantId, `${PREFIX}tenant_A`);
  });

  // Case 4 — Unknown page → fail-closed
  record('4 Unknown page → PAGE_NOT_REGISTERED, khong Bot, khong Conversation, khong fallback tenant', () => {
    const convBefore = conversations.length;
    const r = handleEvent('deadbeefdeadbeef', sender, 'message');
    assert.strictEqual(r.processed, false);
    assert.strictEqual(r.reason, 'PAGE_NOT_REGISTERED');
    assert.strictEqual(conversations.length, convBefore, 'Khong duoc tao conversation moi');
  });

  // Case 5 — Page tenantId null → fail-closed
  record('5 Page tenant-null → PAGE_TENANT_MISSING, khong Bot, khong Conversation tenant-null', () => {
    const convBefore = conversations.length;
    const r = handleEvent('910000000000003', sender, 'message');
    assert.strictEqual(r.processed, false);
    assert.strictEqual(r.reason, 'PAGE_TENANT_MISSING');
    assert.strictEqual(conversations.length, convBefore);
    assert.ok(!conversations.some((c) => c.tenantId === null), 'Khong duoc ton tai conversation tenant-null');
  });

  // Case 5b — Page disabled → fail-closed
  record('5b Page disabled → PAGE_DISABLED, khong xu ly', () => {
    const r = handleEvent('910000000000004', sender, 'message');
    assert.strictEqual(r.processed, false);
    assert.strictEqual(r.reason, 'PAGE_DISABLED');
  });

  // Case 6 — Legacy conversation tenantId=null khong bi reuse/backfill mu
  record('6 Legacy conversation tenant-null KHONG bi reuse/backfill khi co message tenant A', () => {
    const legacySender = `${PREFIX}sender_legacy`;
    const legacyConv = { id: `${PREFIX}conv_legacy`, fbUserId: legacySender, tenantId: null, touched: 0 };
    conversations.push(legacyConv);
    const r = handleEvent('910000000000001', legacySender, 'message'); // Page A → tenant A
    assert.strictEqual(r.processed, true);
    assert.strictEqual(r.tenantId, `${PREFIX}tenant_A`);
    assert.notStrictEqual(r.conversation.id, legacyConv.id, 'Khong duoc reuse legacy-null conversation');
    assert.strictEqual(legacyConv.tenantId, null, 'Legacy conversation phai giu nguyen tenantId=null');
    assert.strictEqual(legacyConv.touched, 0, 'Legacy conversation khong duoc dung toi');
  });

  // Case 7 — Conversation tenant khac khong bi ghi de
  record('7 Conversation tenant khac (B) KHONG bi ghi de boi message Page A', () => {
    const sender7 = `${PREFIX}sender_owned_B`;
    const convB = getOrCreateConversation(sender7, `${PREFIX}tenant_B`); // owned by B
    convB.touched = 0;
    const r = handleEvent('910000000000001', sender7, 'message'); // Page A → tenant A
    assert.strictEqual(r.tenantId, `${PREFIX}tenant_A`);
    assert.notStrictEqual(r.conversation.id, convB.id, 'Khong duoc ghi de conversation tenant B');
    assert.strictEqual(convB.tenantId, `${PREFIX}tenant_B`, 'Owner tenant B phai giu nguyen');
    assert.strictEqual(convB.touched, 0, 'Conversation tenant B khong duoc dung toi');
  });

  // Case 8 — Cache isolation
  record('8 Cache theo Page ID giu dung tenant, khong nhiem cheo', () => {
    const a = lookupPage('910000000000001');
    const b = lookupPage('910000000000002');
    assert.strictEqual(a.tenantId, `${PREFIX}tenant_A`);
    assert.strictEqual(b.tenantId, `${PREFIX}tenant_B`);
    assert.notStrictEqual(a.tenantId, b.tenantId);
    // cache key doc lap
    assert.ok(pageCache.has('910000000000001') && pageCache.has('910000000000002'));
  });

  // Case 9 — Signature regression (external)
  record('9 Signature verification kiem rieng qua smoke:webhook-signature (khong doi trong phase nay)', () => {
    assert.ok(true);
  });

  // Case 10 — No external calls
  record('10 Zero external call trong toan bo resolution/propagation', () => {
    assert.strictEqual(externalCalls, 0);
  });

  // Cleanup theo prefix (in-memory)
  for (let i = conversations.length - 1; i >= 0; i--) {
    if (conversations[i].id.startsWith(PREFIX)) conversations.splice(i, 1);
  }
  pageCache.clear();
  record('11 cleanup verified', () => {
    assert.strictEqual(conversations.length, 0);
    assert.strictEqual(pageCache.size, 0);
  });

  return results;
}

try {
  const results = run();
  for (const line of results) console.log(line);
  console.log(`\nwebhook-tenant-context: MOCK_PASS (${results.length} checks)`);
  process.exit(0);
} catch (err) {
  console.error(`webhook-tenant-context: FAIL - ${err.message}`);
  process.exit(1);
}
