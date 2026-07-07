/**
 * Migrate global data → BBOTECH tenant
 *
 * Gán toàn bộ dữ liệu global (tenantId=null) thuộc về BBO Tech
 * sang tenant BBOTECH chính thức.
 *
 * Chạy: node scripts/migrate-to-bbotech.js
 * Chạy dry-run: node scripts/migrate-to-bbotech.js --dry-run
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const BBOTECH_SLUG = 'bbotech';

async function run() {
  console.log(`\n🚀 Migrate global data → BBOTECH tenant`);
  if (DRY_RUN) console.log('⚠️  DRY RUN — không thay đổi database\n');

  // 1. Tìm BBOTECH tenant
  const tenant = await prisma.tenant.findUnique({ where: { slug: BBOTECH_SLUG } });
  if (!tenant) {
    console.error(`❌ Không tìm thấy tenant slug="${BBOTECH_SLUG}"`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`✅ Tenant: ${tenant.name} (id=${tenantId})\n`);

  // 2. KnowledgeBase
  const kbGlobal = await prisma.knowledgeBase.findMany({
    where: { tenantId: null },
    select: { id: true, title: true, category: true },
  });
  console.log(`📚 KnowledgeBase global: ${kbGlobal.length} mục`);
  kbGlobal.forEach(k => console.log(`   • [${k.category}] ${k.title}`));

  if (!DRY_RUN && kbGlobal.length > 0) {
    const r = await prisma.knowledgeBase.updateMany({
      where: { tenantId: null },
      data: { tenantId },
    });
    console.log(`   → Đã cập nhật ${r.count} mục KB\n`);
  } else {
    console.log(`   → (dry-run) Sẽ cập nhật ${kbGlobal.length} mục\n`);
  }

  // 3. PromptTemplates
  const promptsGlobal = await prisma.promptTemplate.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, layer: true, intentType: true },
  });
  console.log(`🤖 PromptTemplates global: ${promptsGlobal.length} mục`);
  promptsGlobal.forEach(p => console.log(`   • [${p.layer}] ${p.name} (intent=${p.intentType})`));

  if (!DRY_RUN && promptsGlobal.length > 0) {
    const r = await prisma.promptTemplate.updateMany({
      where: { tenantId: null },
      data: { tenantId },
    });
    console.log(`   → Đã cập nhật ${r.count} prompt\n`);
  } else {
    console.log(`   → (dry-run) Sẽ cập nhật ${promptsGlobal.length} prompt\n`);
  }

  // 4. QuickReplyMenus
  const qrGlobal = await prisma.quickReplyMenu.findMany({
    where: { tenantId: null },
    select: { id: true, intentType: true, pageId: true },
  });
  console.log(`💬 QuickReplyMenus global: ${qrGlobal.length} mục`);
  qrGlobal.forEach(q => console.log(`   • intent=${q.intentType}, pageId=${q.pageId ?? 'all'}`));

  if (!DRY_RUN && qrGlobal.length > 0) {
    // Cập nhật từng cái (updateMany không work tốt với unique constraint thay đổi)
    let qrUpdated = 0;
    for (const qr of qrGlobal) {
      // Kiểm tra xem BBOTECH đã có quick reply cho intentType này chưa
      // Dùng findFirst thay vì findUnique vì pageId có thể là null
      const conflict = await prisma.quickReplyMenu.findFirst({
        where: { tenantId, intentType: qr.intentType, pageId: qr.pageId ?? null },
      });
      if (conflict) {
        console.log(`   ⏭️  Bỏ qua (đã tồn tại): intent=${qr.intentType}`);
        continue;
      }
      await prisma.quickReplyMenu.update({
        where: { id: qr.id },
        data: { tenantId },
      });
      qrUpdated++;
    }
    console.log(`   → Đã cập nhật ${qrUpdated} quick reply\n`);
  } else {
    console.log(`   → (dry-run) Sẽ cập nhật ${qrGlobal.length} quick reply\n`);
  }

  // 5. ContentPackages (cascade items tự động theo packageId)
  const cpGlobal = await prisma.contentPackage.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, _count: { select: { items: true } } },
  });
  console.log(`📦 ContentPackages global: ${cpGlobal.length} gói`);
  cpGlobal.forEach(c => console.log(`   • ${c.name} (${c._count.items} items)`));

  if (!DRY_RUN && cpGlobal.length > 0) {
    const r = await prisma.contentPackage.updateMany({
      where: { tenantId: null },
      data: { tenantId },
    });
    console.log(`   → Đã cập nhật ${r.count} gói nội dung\n`);
  } else {
    console.log(`   → (dry-run) Sẽ cập nhật ${cpGlobal.length} gói\n`);
  }

  // Tổng kết
  const summary = {
    kb: await prisma.knowledgeBase.count({ where: { tenantId } }),
    prompts: await prisma.promptTemplate.count({ where: { tenantId } }),
    quickReplies: await prisma.quickReplyMenu.count({ where: { tenantId } }),
    contentPackages: await prisma.contentPackage.count({ where: { tenantId } }),
  };

  console.log(`\n✅ HOÀN THÀNH${DRY_RUN ? ' (DRY RUN)' : ''} — BBOTECH hiện có:`);
  console.log(`   📚 KnowledgeBase:    ${summary.kb} mục`);
  console.log(`   🤖 PromptTemplates:  ${summary.prompts} prompt`);
  console.log(`   💬 QuickReplyMenus:  ${summary.quickReplies} menu`);
  console.log(`   📦 ContentPackages:  ${summary.contentPackages} gói\n`);
}

run()
  .catch(e => { console.error('Lỗi:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
