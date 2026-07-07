const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Tenant BBOTECH ===');
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'bbotech' },
    select: {
      id: true, slug: true,
      chatwootModel: true, chatwootAccountId: true, chatwootBaseUrl: true,
      chatwootApiTokenEnc: true, webhookSecretEnc: true,
      chatwootTeamId: true
    }
  });
  console.log(JSON.stringify(tenant, null, 2));

  console.log('\n=== Env Chatwoot ===');
  console.log('CHATWOOT_BASE_URL:', process.env.CHATWOOT_BASE_URL || '(not set)');
  console.log('CHATWOOT_ACCOUNT_ID:', process.env.CHATWOOT_ACCOUNT_ID || '(not set)');
  console.log('CHATWOOT_API_TOKEN:', process.env.CHATWOOT_API_TOKEN ? '(set)' : '(not set)');
  console.log('CHATWOOT_TEAM_ID:', process.env.CHATWOOT_TEAM_ID || '(not set)');

  console.log('\n=== Knowledge items for tenant ===');
  const count = await prisma.knowledgeBase.count({
    where: { tenantId: tenant.id }
  });
  console.log(`Knowledge items: ${count}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); });
