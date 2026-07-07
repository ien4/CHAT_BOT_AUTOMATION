const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Kiểm tra conversation của khách Đức Châu Đỗ
  const conv = await prisma.conversation.findUnique({
    where: { id: '929b8c59-2403-4cbb-9e1a-0d154d9585a7' },
    select: { id: true, fbUserId: true, tenantId: true, context: true, status: true }
  });
  console.log('=== CONVERSATION ===');
  console.log(JSON.stringify(conv, null, 2));

  // Kiểm tra xem routeMessage/send có gắn tenantId vào options không
  // Xem webhook handler gọi processMessage với tenantId
  console.log('\n=== CHECK KNOWLEDGE TENANT ===');
  const knowledgeTenants = await prisma.knowledgeBase.findMany({
    select: { id: true, title: true, tenantId: true, category: true },
  });
  for (const k of knowledgeTenants) {
    console.log(`- ${k.title}: tenantId=${k.tenantId}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
