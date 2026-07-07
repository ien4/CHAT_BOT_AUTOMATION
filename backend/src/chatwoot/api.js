const axios = require('axios');

/**
 * Tạo Chatwoot API client cho 1 tenant hoặc owner.
 *
 * credentials = {
 *   baseUrl   : string  — Chatwoot server URL
 *   accountId : string  — Account ID
 *   apiToken  : string  — API access token
 *   teamId?   : string  — Team ID cho handoff assignment (optional)
 * }
 *
 * Nếu credentials thiếu → fallback về env vars của platform (CHATWOOT_BASE_URL, ...)
 */
function createChatwootClient(credentials = {}) {
  const baseUrl   = credentials.baseUrl   || process.env.CHATWOOT_BASE_URL;
  const accountId = credentials.accountId || process.env.CHATWOOT_ACCOUNT_ID;
  const apiToken  = credentials.apiToken  || process.env.CHATWOOT_API_TOKEN;
  const teamId    = credentials.teamId    || process.env.CHATWOOT_TEAM_ID;

  if (!baseUrl || !accountId || !apiToken) {
    throw new Error('Thiếu Chatwoot credentials (baseUrl, accountId, apiToken)');
  }

  const http = axios.create({
    baseURL: `${baseUrl.replace(/\/+$/, '')}/api/v1/accounts/${accountId}`,
    headers: { 'api_access_token': apiToken, 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  return {
    sendMessage: async (convId, content) => {
      const res = await http.post(`/conversations/${convId}/messages`, {
        content, message_type: 'outgoing', private: false,
      });
      return res.data;
    },

    // Gửi private note — hiển thị trong Chatwoot UI nhưng KHÔNG gửi tới khách
    sendPrivateNote: async (convId, content) => {
      const res = await http.post(`/conversations/${convId}/messages`, {
        content, message_type: 'outgoing', private: true,
      });
      return res.data;
    },

    sendAgentMessage: async (convId, content) => {
      const res = await http.post(`/conversations/${convId}/messages`, {
        content, message_type: 'outgoing', private: false,
      });
      return res.data;
    },

    // Sync trạng thái: chuyển sang 'open' + assign team (nếu có teamId)
    handoffToHuman: async (convId, overrideTeamId) => {
      await http.patch(`/conversations/${convId}`, { status: 'open' });
      const effectiveTeamId = overrideTeamId || teamId;
      if (effectiveTeamId) {
        await http.post(`/conversations/${convId}/assignments`, {
          team_id: parseInt(effectiveTeamId),
        });
      }
    },

    // Sync trạng thái: giữ 'open' để Chatwoot tiếp tục gửi Agent Bot webhook
    botTakeOver: async (convId) => {
      await http.patch(`/conversations/${convId}`, { status: 'open' });
    },

    // Lấy Facebook PSID (source_id) của contact từ contact_inboxes
    getContactSourceId: async (contactId, inboxId) => {
      const res = await http.get(`/contacts/${contactId}`);
      const inboxes = res.data?.payload?.contact_inboxes || [];
      if (inboxId) {
        const match = inboxes.find(i => i.inbox?.id === inboxId);
        if (match) return match.source_id || null;
      }
      return inboxes[0]?.source_id || null;
    },
  };
}

/**
 * Tạo client từ Tenant DB record (đã decrypt credentials).
 * Dùng khi xử lý request của tenant.
 */
function createClientFromTenant(tenant) {
  // shared model: dùng platform's base URL, ưu tiên token của tenant nếu có
  if (tenant.chatwootModel === 'shared') {
    return createChatwootClient({
      accountId: tenant.chatwootAccountId,
      apiToken:  tenant._decryptedApiToken || undefined, // fallback về CHATWOOT_API_TOKEN
      teamId:    tenant.chatwootTeamId,
    });
  }
  // dedicated model: tenant cung cấp toàn bộ credentials
  return createChatwootClient({
    baseUrl:   tenant.chatwootBaseUrl,
    accountId: tenant.chatwootAccountId,
    apiToken:  tenant._decryptedApiToken,
    teamId:    tenant.chatwootTeamId,
  });
}

// Default client cho owner (backward compat) — lazy init
let _defaultClient = null;
function _getDefault() {
  if (!_defaultClient) _defaultClient = createChatwootClient();
  return _defaultClient;
}

// Re-export các method của default client để code cũ không cần thay đổi
module.exports = {
  createChatwootClient,
  createClientFromTenant,
  sendMessage:        (...a) => _getDefault().sendMessage(...a),
  sendPrivateNote:    (...a) => _getDefault().sendPrivateNote(...a),
  sendAgentMessage:   (...a) => _getDefault().sendAgentMessage(...a),
  handoffToHuman:     (...a) => _getDefault().handoffToHuman(...a),
  botTakeOver:        (...a) => _getDefault().botTakeOver(...a),
  getContactSourceId: (...a) => _getDefault().getContactSourceId(...a),
};
