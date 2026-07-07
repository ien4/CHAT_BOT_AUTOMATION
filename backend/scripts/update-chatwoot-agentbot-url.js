// Update a Chatwoot Agent Bot outgoing URL.
// Usage: node update-chatwoot-agentbot-url.js <OUTGOING_URL> [BOT_NAME]
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');

const outgoingUrl = process.argv[2];
const botName = process.argv[3] || process.env.CHATWOOT_AGENT_BOT_NAME || 'BBOTECH';

async function main() {
  if (!outgoingUrl) process.exit(1);

  const baseUrl = process.env.CHATWOOT_BASE_URL;
  const accountId = process.env.CHATWOOT_ACCOUNT_ID;
  const apiToken = process.env.CHATWOOT_API_TOKEN;

  if (!baseUrl || !accountId || !apiToken) {
    console.log('  [CANH BAO] Thieu CHATWOOT_BASE_URL/ACCOUNT_ID/API_TOKEN, bo qua cap nhat Agent Bot.');
    return;
  }

  const http = axios.create({
    baseURL: `${baseUrl}/api/v1/accounts/${accountId}`,
    headers: { api_access_token: apiToken, 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  const list = await http.get('/agent_bots');
  const bots = list.data?.payload || list.data || [];
  const bot = bots.find((b) => b.name === botName) || bots.find((b) => b.id === Number(botName));

  if (!bot) {
    console.log(`  [CANH BAO] Khong tim thay Chatwoot Agent Bot "${botName}".`);
    return;
  }

  const payload = {
    name: bot.name,
    description: bot.description || '',
    outgoing_url: outgoingUrl,
  };

  try {
    await http.patch(`/agent_bots/${bot.id}`, payload);
  } catch (patchError) {
    await http.put(`/agent_bots/${bot.id}`, payload);
  }

  console.log(`  - Da cap nhat Agent Bot "${bot.name}" outgoing_url=${outgoingUrl}`);
}

main().catch((error) => {
  const detail = error.response?.data || error.message;
  console.log('  [CANH BAO] Khong cap nhat duoc Agent Bot:', typeof detail === 'string' ? detail : JSON.stringify(detail));
});
