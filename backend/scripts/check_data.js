const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== KNOWLEDGE BASE ===');
  const knowledge = await prisma.knowledgeBase.findMany({
    select: { id: true, title: true, type: true, tags: true, category: true, tenantId: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(knowledge, null, 2));
  console.log(`Total: ${knowledge.length} items\n`);

  console.log('=== PROMPT TEMPLATES ===');
  const prompts = await prisma.promptTemplate.findMany({
    select: { id: true, layer: true, systemPrompt: true, tenantId: true, isActive: true }
  });
  console.log(JSON.stringify(prompts, null, 2));
  console.log(`Total: ${prompts.length} prompts\n`);

  console.log('=== RECENT MESSAGES (last 20) ===');
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, direction: true, content: true, createdAt: true, conversationId: true }
  });
  console.log(JSON.stringify(messages, null, 2));
  console.log(`Total recent: ${messages.length} messages\n`);

  console.log('=== RECENT CONVERSATIONS (last 5) ===');
  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, fbUserId: true, fbUserName: true, status: true, context: true, updatedAt: true }
  });
  console.log(JSON.stringify(conversations, null, 2));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
