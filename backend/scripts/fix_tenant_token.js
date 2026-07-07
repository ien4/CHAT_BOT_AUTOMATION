require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { encrypt } = require('../src/chatwoot/crypto');

const prisma = new PrismaClient();

async function main() {
  // Mã hóa token đúng từ .env
  const correctToken = process.env.CHATWOOT_API_TOKEN;
  console.log('Token từ .env:', correctToken);

  const encrypted = encrypt(correctToken);
  console.log('Encrypted:', encrypted);

  // Cập nhật cho tenant bbotech
  const updated = await prisma.tenant.update({
    where: { slug: 'bbotech' },
    data: { chatwootApiTokenEnc: encrypted }
  });

  console.log('✅ Đã cập nhật token cho tenant:', updated.slug);

  // Xóa cache registry để tenant reload
  const registry = require('../src/tenants/registry');
  registry.invalidateAll();
  console.log('✅ Đã clear registry cache');

  await prisma.$disconnect();
  console.log('\n🎉 Hoàn tất! Restart backend để áp dụng.');
}

main().catch(e => {
  console.error('Lỗi:', e);
  prisma.$disconnect();
});
