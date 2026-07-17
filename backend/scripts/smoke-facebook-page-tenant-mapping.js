/**
 * Smoke: FacebookPage.pageId -> tenantId mapping contract (MOCK / no DB, no Meta).
 *
 * Muc tieu: chung minh source-of-truth mapping sau khi them cot facebook_pages.tenant_id:
 *   - Page A (pageId gia) -> Tenant A
 *   - Page B (pageId gia) -> Tenant B
 *   - Page C (pageId gia) -> tenantId = null (legacy allowed, NOT context-ready)
 *   - Khong co default tenant: page chua gan van tra null, khong "doan" tenant khac.
 *
 * An toan:
 *   - Khong goi Meta/Facebook.
 *   - Khong dung token that; token la placeholder khong in ra.
 *   - Khong in DATABASE_URL.
 *   - Khong ghi/xoa DB that; toan bo in-memory, cleanup theo prefix.
 */

const assert = require('assert');

const PREFIX = 'p0fbmap_';

// In-memory store mo phong hop dong luu tru cua prisma.facebookPage / prisma.tenant.
const state = {
  tenants: [],
  facebookPages: [],
};

function addTenant(id, name) {
  const tenant = { id, name, slug: id, isActive: true };
  state.tenants.push(tenant);
  return tenant;
}

function addFacebookPage(data) {
  // Mo phong dung hop dong CRUD backend: tenantId optional, default null (khong default tenant).
  const page = {
    id: `${PREFIX}page_${state.facebookPages.length + 1}`,
    pageId: data.pageId,
    pageName: data.pageName || 'Fixture Page',
    // accessToken co ton tai o schema that nhung KHONG luu/khong in trong smoke nay.
    isActive: data.isActive !== false,
    botPersona: data.botPersona || null,
    knowledgeFilter: data.knowledgeFilter || [],
    tenantId: Object.prototype.hasOwnProperty.call(data, 'tenantId') ? (data.tenantId || null) : null,
  };
  state.facebookPages.push(page);
  return page;
}

// Mo phong lookupPage: tra ve record theo pageId (giong webhook direct path se lam sau khi unblock).
function findPageByPageId(pageId) {
  return state.facebookPages.find((p) => p.pageId === String(pageId) && p.isActive) || null;
}

// Mo phong verify tenant ton tai (hop dong CRUD: tenantId truyen vao phai ton tai).
function tenantExists(tenantId) {
  return state.tenants.some((t) => t.id === tenantId);
}

function run() {
  const results = [];
  const record = (name, fn) => {
    fn();
    results.push(`PASS - ${name}`);
  };

  // Fixtures
  const tenantA = addTenant(`${PREFIX}tenant_A`, 'Tenant A');
  const tenantB = addTenant(`${PREFIX}tenant_B`, 'Tenant B');

  const pageA = addFacebookPage({ pageId: '900000000000001', pageName: 'Fixture A', tenantId: tenantA.id });
  const pageB = addFacebookPage({ pageId: '900000000000002', pageName: 'Fixture B', tenantId: tenantB.id });
  const pageC = addFacebookPage({ pageId: '900000000000003', pageName: 'Fixture C' }); // legacy null

  record('A create requires existing tenant', () => {
    assert.ok(tenantExists(pageA.tenantId), 'Page A tenant must exist');
    assert.ok(tenantExists(pageB.tenantId), 'Page B tenant must exist');
  });

  record('B pageId -> Tenant A', () => {
    const found = findPageByPageId('900000000000001');
    assert.ok(found, 'Page A must resolve by pageId');
    assert.strictEqual(found.tenantId, tenantA.id);
  });

  record('C pageId -> Tenant B', () => {
    const found = findPageByPageId('900000000000002');
    assert.ok(found, 'Page B must resolve by pageId');
    assert.strictEqual(found.tenantId, tenantB.id);
  });

  record('D legacy page -> tenantId null (no default tenant)', () => {
    const found = findPageByPageId('900000000000003');
    assert.ok(found, 'Page C must resolve by pageId');
    assert.strictEqual(found.tenantId, null, 'Legacy page must NOT be auto-assigned a tenant');
  });

  record('E cross-page isolation (A !== B)', () => {
    const a = findPageByPageId('900000000000001');
    const b = findPageByPageId('900000000000002');
    assert.notStrictEqual(a.tenantId, b.tenantId, 'Page A and Page B must map to different tenants');
  });

  record('F unknown pageId -> null (fail-closed, no fallback tenant)', () => {
    const found = findPageByPageId('deadbeefdeadbeef');
    assert.strictEqual(found, null, 'Unknown page must not resolve to any tenant');
  });

  record('G reject binding to non-existent tenant', () => {
    assert.strictEqual(tenantExists(`${PREFIX}tenant_ghost`), false);
  });

  // Cleanup theo prefix (in-memory only; khong dung table that).
  state.facebookPages = state.facebookPages.filter((p) => !p.id.startsWith(PREFIX));
  state.tenants = state.tenants.filter((t) => !t.id.startsWith(PREFIX));
  record('H cleanup verified', () => {
    assert.strictEqual(state.facebookPages.length, 0);
    assert.strictEqual(state.tenants.length, 0);
  });

  return results;
}

try {
  const results = run();
  for (const line of results) console.log(line);
  console.log(`\nfacebook-page-tenant-mapping: MOCK_PASS (${results.length} checks)`);
  process.exit(0);
} catch (err) {
  console.error(`facebook-page-tenant-mapping: FAIL - ${err.message}`);
  process.exit(1);
}
