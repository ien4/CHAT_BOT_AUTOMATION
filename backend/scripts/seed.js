/**
 * Seed script - Import dữ liệu mẫu vào knowledge_base
 * Chạy: node scripts/seed.js
 * 
 * Yêu cầu: Backend đang chạy (port 3001) hoặc import trực tiếp qua Prisma
 */
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Bắt đầu import dữ liệu mẫu...\n');

  // Đọc file seed.json
  const seedPath = path.join(__dirname, '..', 'data', 'seed.json');
  
  if (!fs.existsSync(seedPath)) {
    console.error('❌ Không tìm thấy file data/seed.json');
    process.exit(1);
  }

  const raw = fs.readFileSync(seedPath, 'utf-8');
  const data = JSON.parse(raw);
  const items = data.items || [];

  console.log(`📦 Tìm thấy ${items.length} mục kiến thức\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // Kiểm tra trùng lặp (theo title)
      const existing = await prisma.knowledgeBase.findFirst({
        where: { title: item.title, isActive: true },
      });

      if (existing) {
        console.log(`⏭️  Bỏ qua (đã tồn tại): ${item.title}`);
        skipped++;
        continue;
      }

      // Thêm vào knowledge_base (không có embedding - sẽ thêm sau khi có API key)
      const safeTitle = item.title.replace(/'/g, "''");
      const safeContent = item.content.replace(/'/g, "''");
      const safeCategory = (item.category || 'general').replace(/'/g, "''");
      const sourceType = item.sourceType || 'file';
      const sourceUrl = item.sourceUrl || null;

      let sql;
      if (sourceUrl) {
        sql = `
          INSERT INTO knowledge_base (id, title, content, category, source_type, source_url, is_active, created_at, updated_at)
          VALUES (gen_random_uuid(), '${safeTitle}', '${safeContent}', '${safeCategory}', '${sourceType}', '${sourceUrl}', true, NOW(), NOW())
          RETURNING id, title
        `;
      } else {
        sql = `
          INSERT INTO knowledge_base (id, title, content, category, source_type, is_active, created_at, updated_at)
          VALUES (gen_random_uuid(), '${safeTitle}', '${safeContent}', '${safeCategory}', '${sourceType}', true, NOW(), NOW())
          RETURNING id, title
        `;
      }

      const result = await prisma.$queryRawUnsafe(sql);
      console.log(`✅ Đã thêm: ${item.title} [${item.category}]`);
      success++;
    } catch (error) {
      console.error(`❌ Lỗi khi thêm "${item.title}":`, error.message);
      failed++;
    }
  }

  // Tổng kết
  console.log('\n📊 KẾT QUẢ IMPORT:');
  console.log(`   ✅ Thành công: ${success}`);
  console.log(`   ⏭️  Bỏ qua:    ${skipped}`);
  console.log(`   ❌ Thất bại:   ${failed}`);
  console.log(`   📚 Tổng cộng:  ${success + skipped + failed}`);

  // ==================== SEED CONTENT PACKAGES ====================
  const packages = data.contentPackages || [];
  
  if (packages.length > 0) {
    console.log(`\n📦 Seed ${packages.length} Content Packages...\n`);
    let pkgSuccess = 0;
    let pkgSkipped = 0;
    let pkgFailed = 0;
    let itemCount = 0;

    for (const pkg of packages) {
      try {
        // Check if package already exists
        const existing = await prisma.contentPackage.findFirst({
          where: { name: pkg.name },
        });

        let createdPkg;

        if (existing) {
          console.log(`⏭️  Bỏ qua gói (đã tồn tại): ${pkg.name}`);
          createdPkg = existing;
          pkgSkipped++;
        } else {
          createdPkg = await prisma.contentPackage.create({
            data: {
              name: pkg.name,
              description: pkg.description || '',
              isActive: pkg.isActive !== false,
              isPublic: pkg.isPublic !== false,
            },
          });
          console.log(`✅ Đã tạo gói: ${createdPkg.name}`);
          pkgSuccess++;
        }

        // Seed items for this package
        if (pkg.items && Array.isArray(pkg.items)) {
          for (let i = 0; i < pkg.items.length; i++) {
            const item = pkg.items[i];
            try {
              // Check if item exists
              const existingItem = await prisma.contentPackageItem.findFirst({
                where: { packageId: createdPkg.id, title: item.title },
              });

              if (!existingItem) {
                await prisma.contentPackageItem.create({
                  data: {
                    packageId: createdPkg.id,
                    type: item.type || 'document',
                    title: item.title,
                    content: item.content || null,
                    url: item.url || null,
                    description: item.description || null,
                    tags: item.tags || [],
                    order: item.order !== undefined ? item.order : i,
                  },
                });
                itemCount++;
              }
            } catch (itemErr) {
              console.error(`  ❌ Lỗi tạo item "${item.title}":`, itemErr.message);
            }
          }
        }
      } catch (err) {
        console.error(`❌ Lỗi seed gói "${pkg.name}":`, err.message);
        pkgFailed++;
      }
    }

    console.log(`\n📊 KẾT QUẢ SEED CONTENT PACKAGES:`);
    console.log(`   ✅ Gói mới: ${pkgSuccess}`);
    console.log(`   ⏭️  Đã có:  ${pkgSkipped}`);
    console.log(`   ❌ Lỗi:     ${pkgFailed}`);
    console.log(`   📦 Items:    ${itemCount}`);
  }

  // Hiển thị số lượng hiện tại
  const total = await prisma.knowledgeBase.count({ where: { isActive: true } });
  const totalPackages = await prisma.contentPackage.count();
  console.log(`\n📚 Tổng kiến thức trong DB: ${total} mục`);
  console.log(`📦 Tổng gói nội dung: ${totalPackages}\n`);

  if (success > 0) {
    console.log('⚠️  LƯU Ý: Dữ liệu được thêm CHƯA CÓ embedding vector.');
    console.log('   Để kích hoạt RAG (tìm kiếm ngữ nghĩa), cần cấu hình Gemini API Key trong .env');
    console.log('   Sau đó chạy lại script hoặc upload lại file qua Dashboard.\n');
  }
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });