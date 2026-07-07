const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== LLM Providers hiện tại ===');
  const providers = await prisma.llmProvider.findMany({
    orderBy: { priority: 'asc' }
  });
  console.log(JSON.stringify(providers, null, 2));

  // Tắt Gemini
  const gemini = providers.find(p => p.name.toLowerCase().includes('gemini'));
  if (gemini) {
    await prisma.llmProvider.update({
      where: { id: gemini.id },
      data: { isEnabled: false }
    });
    console.log(`\n✅ Đã tắt Gemini (${gemini.name})`);
  }

  // Set DeepSeek lên priority cao nhất
  const deepseek = providers.find(p => p.name.toLowerCase().includes('deepseek'));
  if (deepseek) {
    await prisma.llmProvider.update({
      where: { id: deepseek.id },
      data: { priority: 1, isEnabled: true }
    });
    console.log(`✅ Đã set DeepSeek (${deepseek.name}) lên priority 1`);
  }

  // Set các provider còn lại xuống priority thấp hơn
  for (const p of providers) {
    if (p.id !== deepseek?.id && p.id !== gemini?.id) {
      await prisma.llmProvider.update({
        where: { id: p.id },
        data: { priority: 10, isEnabled: false }
      });
      console.log(`✅ Đã tắt ${p.name}`);
    }
  }

  console.log('\n=== Kết quả sau khi cập nhật ===');
  const updated = await prisma.llmProvider.findMany({
    orderBy: { priority: 'asc' }
  });
  console.log(JSON.stringify(updated, null, 2));

  console.log('\n🎉 Đã chuyển hoàn toàn sang DeepSeek!');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Lỗi:', e);
  prisma.$disconnect();
});
