import createApiClient from './api/client';

const api = createApiClient();

// Auth interceptor
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Tenant scope interceptor — platform admin passes selectedTenantId as tenantScope param
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && !config.url?.startsWith('/auth/')) {
    const tenantScope = localStorage.getItem('selectedTenantId');
    if (tenantScope) {
      config.params = { ...config.params, tenantScope };
    }
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isLoginRequest = requestUrl.startsWith('/auth/login');

    if (error.response?.status === 401 && !isLoginRequest) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('selectedTenantId');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
};

// Stats API
export const statsApi = {
  get: () => api.get('/stats'),
};

// Conversations API
export const conversationsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/conversations', { params }),
  get: (id: string) => api.get(`/conversations/${id}`),
  messages: (id: string) => api.get(`/conversations/${id}/messages`),
};

// Knowledge API
export const knowledgeApi = {
  list: (params?: { page?: number; limit?: number; category?: string; type?: string; tags?: string }) =>
    api.get('/knowledge', { params }),
  get: (id: string) => api.get(`/knowledge/${id}`),
  create: (data: { title: string; content: string; category: string; type?: string; tags?: string[] }) =>
    api.post('/knowledge', data),
  update: (id: string, data: any) => api.put(`/knowledge/${id}`, data),
  delete: (id: string) => api.delete(`/knowledge/${id}`),
  reindex: (all?: boolean) => api.post('/knowledge/reindex', { all: all ?? false }),
  upload: (file: File, category: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    return api.post('/knowledge/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  scrape: (url: string, category: string) =>
    api.post('/knowledge/scrape', { url, category }),
};

// Prompts API
export const promptsApi = {
  list: () => api.get('/prompts'),
  get: (id: string) => api.get(`/prompts/${id}`),
  create: (data: any) => api.post('/prompts', data),
  update: (id: string, data: any) => api.put(`/prompts/${id}`, data),
  delete: (id: string) => api.delete(`/prompts/${id}`),
};

// Providers API
export const providersApi = {
  list: () => api.get('/providers'),
  create: (data: any) => api.post('/providers', data),
  update: (id: string, data: any) => api.put(`/providers/${id}`, data),
  delete: (id: string) => api.delete(`/providers/${id}`),
  test: (id: string) => api.post(`/providers/${id}/test`),
};

// Campaigns API (legacy)
export const campaignsApi = {
  list: () => api.get('/campaigns'),
  get: (id: string) => api.get(`/campaigns/${id}`),
  create: (data: any) => api.post('/campaigns', data),
  update: (id: string, data: any) => api.put(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/campaigns/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Content Packages API (new)
export const contentPackagesApi = {
  list: (params?: { page?: number; limit?: number; isActive?: boolean }) =>
    api.get('/content-packages', { params }),
  get: (id: string) => api.get(`/content-packages/${id}`),
  create: (data: { name: string; description?: string; coverUrl?: string; isActive?: boolean; isPublic?: boolean; isGlobal?: boolean }) =>
    api.post('/content-packages', data),
  update: (id: string, data: any) => api.put(`/content-packages/${id}`, data),
  delete: (id: string) => api.delete(`/content-packages/${id}`),

  // Items
  listItems: (packageId: string) => api.get(`/content-packages/${packageId}/items`),
  createItem: (packageId: string, data: { type: string; title: string; content?: string; url?: string; description?: string; tags?: string[]; order?: number }) =>
    api.post(`/content-packages/${packageId}/items`, data),
  updateItem: (packageId: string, itemId: string, data: any) =>
    api.put(`/content-packages/${packageId}/items/${itemId}`, data),
  deleteItem: (packageId: string, itemId: string) =>
    api.delete(`/content-packages/${packageId}/items/${itemId}`),

  // Migration
  migrateFromCampaigns: () => api.post('/content-packages/migrate-from-campaigns'),
};

// Quick Reply Menus API
export const quickReplyMenusApi = {
  list: (params?: { intentType?: string; pageId?: string }) =>
    api.get('/quick-reply-menus', { params }),
  get: (id: string) => api.get(`/quick-reply-menus/${id}`),
  create: (data: { intentType: string; pageId?: string; items: { title: string; payload: string }[]; isActive?: boolean }) =>
    api.post('/quick-reply-menus', data),
  update: (id: string, data: any) => api.put(`/quick-reply-menus/${id}`, data),
  delete: (id: string) => api.delete(`/quick-reply-menus/${id}`),
};

// Appointments API
export const appointmentsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/appointments', { params }),
  update: (id: string, data: { status?: string; notes?: string }) =>
    api.put(`/appointments/${id}`, data),
};

// Staff API
export const staffApi = {
  list: () => api.get('/staff'),
  create: (data: { name: string; telegramChatId: string }) =>
    api.post('/staff', data),
  update: (id: string, data: { name?: string; telegramChatId?: string; isActive?: boolean; isOnDuty?: boolean }) =>
    api.put(`/staff/${id}`, data),
  delete: (id: string) => api.delete(`/staff/${id}`),
};

// Handoff Settings API
export const handoffSettingsApi = {
  get: () => api.get('/settings/handoff'),
  update: (data: { pendingTimeoutSeconds?: number; sessionTimeoutSeconds?: number; offHoursPendingTimeout?: number; workHoursStart?: number; workHoursEnd?: number }) =>
    api.put('/settings/handoff', data),
};

// Settings API
export const settingsApi = {
  getWebhookConfig: () => api.get('/settings/webhook'),
};

// Telegram Destinations API
export const telegramDestinationsApi = {
  list: () => api.get('/settings/telegram-destinations'),
  create: (data: { name: string; type: 'group' | 'channel'; chatId: string; purpose?: 'status'; isActive?: boolean }) =>
    api.post('/settings/telegram-destinations', data),
  update: (id: string, data: { name?: string; type?: 'group' | 'channel'; chatId?: string; purpose?: 'status'; isActive?: boolean }) =>
    api.put(`/settings/telegram-destinations/${id}`, data),
  delete: (id: string) => api.delete(`/settings/telegram-destinations/${id}`),
  test: (id: string) => api.post(`/settings/telegram-destinations/${id}/test`),
};

// Handoff Active API
export const handoffApi = {
  getActive: () => api.get('/handoff/active'),
  forceEnd: (conversationId: string) => api.post(`/handoff/${conversationId}/force-end`),
  getStaffStatus: () => api.get('/handoff/staff-status'),
  getBotQueue: () => api.get('/handoff/bot-queue'),
  assign: (conversationId: string, staffId: string) =>
    api.post(`/handoff/${conversationId}/assign`, { staffId }),
};

// Facebook Pages API
export const facebookPagesApi = {
  list: () => api.get('/facebook-pages'),
  get: (id: string) => api.get(`/facebook-pages/${id}`),
  create: (data: { pageId: string; pageName: string; accessToken: string; isActive?: boolean; botPersona?: string; knowledgeFilter?: string[] }) =>
    api.post('/facebook-pages', data),
  update: (id: string, data: any) => api.put(`/facebook-pages/${id}`, data),
  delete: (id: string) => api.delete(`/facebook-pages/${id}`),
};

// Facebook Menu API
export const facebookMenuApi = {
  get: () => api.get('/settings/facebook-menu'),
  setup: (data: { greeting?: string }) => api.post('/settings/facebook-menu', data),
};

// Channel Configs API
export const channelConfigsApi = {
  list: () => api.get('/channel-configs'),
  get: (id: string) => api.get(`/channel-configs/${id}`),
  create: (data: { inboxId: string; channelType: string; name: string; knowledgeFilter?: string[]; botPersonaOverride?: string; isActive?: boolean }) =>
    api.post('/channel-configs', data),
  update: (id: string, data: any) => api.put(`/channel-configs/${id}`, data),
  delete: (id: string) => api.delete(`/channel-configs/${id}`),
};

// Tenants API (Multi-tenant)
export const tenantsApi = {
  list: () => api.get('/tenants'),
  get: (id: string) => api.get(`/tenants/${id}`),
  create: (data: any) => api.post('/tenants', data),
  update: (id: string, data: any) => api.put(`/tenants/${id}`, data),
  delete: (id: string) => api.delete(`/tenants/${id}`),
  webhookInfo: (id: string) => api.get(`/tenants/${id}/webhook-info`),
  // Staff
  listStaff: (tenantId: string) => api.get(`/tenants/${tenantId}/staff`),
  createStaff: (tenantId: string, data: any) => api.post(`/tenants/${tenantId}/staff`, data),
  updateStaff: (tenantId: string, staffId: string, data: any) => api.put(`/tenants/${tenantId}/staff/${staffId}`, data),
  deleteStaff: (tenantId: string, staffId: string) => api.delete(`/tenants/${tenantId}/staff/${staffId}`),
    // Channel Configs
  listChannels: (tenantId: string) => api.get(`/tenants/${tenantId}/channel-configs`),
  createChannel: (tenantId: string, data: any) => api.post(`/tenants/${tenantId}/channel-configs`, data),
  deleteChannel: (tenantId: string, configId: string) => api.delete(`/tenants/${tenantId}/channel-configs/${configId}`),
  // Handoff Monitor
  handoffActive: (tenantId: string) => api.get(`/tenants/${tenantId}/handoff/active`),
  handoffStaffStatus: (tenantId: string) => api.get(`/tenants/${tenantId}/handoff/staff-status`),
  handoffBotQueue: (tenantId: string) => api.get(`/tenants/${tenantId}/handoff/bot-queue`),
  handoffForceEnd: (tenantId: string, conversationId: string) =>
    api.post(`/tenants/${tenantId}/handoff/${conversationId}/force-end`),
    handoffAssign: (tenantId: string, conversationId: string, staffId: string) =>
    api.post(`/tenants/${tenantId}/handoff/${conversationId}/assign`, { staffId }),
  handoffAnalytics: (tenantId: string, period: string = '7d') =>
    api.get(`/tenants/${tenantId}/handoff/analytics?period=${period}`),
};

// Admin Users API
export const adminUsersApi = {
  list: () => api.get('/admin-users'),
  create: (data: { username: string; password: string; role?: string; tenantId?: string | null }) =>
    api.post('/admin-users', data),
  delete: (id: string) => api.delete(`/admin-users/${id}`),
};

// Analytics API
export const analyticsApi = {
  get: (params?: { days?: number }) =>
    api.get('/analytics', { params }),
};

export default api;
