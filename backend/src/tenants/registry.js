const getPrisma = require('../db');
const prisma = getPrisma();

const CACHE_TTL = 5 * 60 * 1000; // 5 phút

// slug → { tenant, expiresAt }
const cache = new Map();

/**
 * Load tenant từ DB và cache kết quả.
 * Trả về null nếu không tìm thấy hoặc inactive.
 */
async function getBySlug(slug) {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    include: {
      channelConfigs: { where: { isActive: true } },
      staff: { where: { isActive: true } },
    },
  });

  if (!tenant || !tenant.isActive) {
    cache.set(slug, { tenant: null, expiresAt: Date.now() + CACHE_TTL });
    return null;
  }

  cache.set(slug, { tenant, expiresAt: Date.now() + CACHE_TTL });
  return tenant;
}

/**
 * Xóa cache của 1 tenant (gọi sau khi update từ dashboard).
 */
function invalidate(slug) {
  cache.delete(slug);
}

/**
 * Xóa toàn bộ cache.
 */
function invalidateAll() {
  cache.clear();
}

/**
 * Lấy TenantChannelConfig phù hợp với inboxId.
 */
function resolveChannelConfig(tenant, inboxId) {
  if (!tenant?.channelConfigs || !inboxId) return null;
  return tenant.channelConfigs.find(c => c.inboxId === String(inboxId)) || null;
}

module.exports = { getBySlug, invalidate, invalidateAll, resolveChannelConfig };
