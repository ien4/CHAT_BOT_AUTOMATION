const getPrisma = require('../db');
const prisma = getPrisma();
const { decryptIfPresent } = require('../chatwoot/crypto');

const CACHE_TTL = 5 * 60 * 1000; // 5 phút

// slug → { tenant, expiresAt }
const cache = new Map();

/**
 * Load tenant từ DB, decrypt credentials, cache kết quả.
 * Trả về null nếu không tìm thấy hoặc inactive.
 *
 * tenant trả về có thêm:
 *   _decryptedApiToken  : string | null
 *   _webhookSecret      : string | null
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

  // Decrypt sensitive fields một lần, lưu vào object
  const enriched = {
    ...tenant,
    _decryptedApiToken: decryptIfPresent(tenant.chatwootApiTokenEnc),
    _webhookSecret:     decryptIfPresent(tenant.webhookSecretEnc),
  };

  cache.set(slug, { tenant: enriched, expiresAt: Date.now() + CACHE_TTL });
  return enriched;
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
