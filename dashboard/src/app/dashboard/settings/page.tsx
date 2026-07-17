'use client';
export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { facebookMenuApi, facebookPagesApi, providersApi, settingsApi, telegramDestinationsApi, tenantsApi } from '@/lib/api';
import { Link, Zap, CheckCircle, XCircle, RefreshCw, TestTube, Menu, RotateCcw, Facebook, Bell, Plus, Send, Trash2, Save, X, BrainCircuit } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [webhookInfo, setWebhookInfo] = useState<any>(null);
    const [menuLoading, setMenuLoading] = useState(false);
  const [fbMenuInfo, setFbMenuInfo] = useState<any>(null);
  const [greetingText, setGreetingText] = useState('');
  const [fbPages, setFbPages] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [showFbPageForm, setShowFbPageForm] = useState(false);
  const [fbForm, setFbForm] = useState({ pageId: '', pageName: '', accessToken: '', isActive: true, tenantId: '' });
  const [telegramDestinations, setTelegramDestinations] = useState<any[]>([]);
  const [telegramFallback, setTelegramFallback] = useState<any>(null);
  const [showTelegramForm, setShowTelegramForm] = useState(false);
  const [telegramEditing, setTelegramEditing] = useState<string | null>(null);
  const [telegramTesting, setTelegramTesting] = useState<string | null>(null);
  const [telegramForm, setTelegramForm] = useState({ name: '', type: 'group' as 'group' | 'channel', chatId: '', isActive: true });
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: '', modelName: '', apiKey: '', baseUrl: '', maxTokens: 2048, temperature: 0.7, priority: 10 });
  const [providerSaving, setProviderSaving] = useState(false);
  const [showEmbeddingForm, setShowEmbeddingForm] = useState(false);
  const [embeddingForm, setEmbeddingForm] = useState({ name: '', modelName: 'jina-embeddings-v2-base-multilingual', apiKey: '', baseUrl: '', priority: 10 });
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [embeddingTesting, setEmbeddingTesting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    // Load providers independently — don't let failure block rest of settings
    try {
      const { data } = await providersApi.list();
      setProviders(data);
    } catch { toast.error('Lỗi tải danh sách provider'); }
    // Get webhook info
    try {
      const { data } = await settingsApi.getWebhookConfig();
      setWebhookInfo(data);
    } catch {}
    // Get Facebook Menu info
    try {
      const { data } = await facebookMenuApi.get();
      setFbMenuInfo(data);
    } catch {}
    // Load Facebook Pages
    try {
      const { data } = await facebookPagesApi.list();
      setFbPages(data);
    } catch {}
    // Load tenants for Facebook Page ownership binding (platform admin)
    try {
      const { data } = await tenantsApi.list();
      setTenants(Array.isArray(data) ? data : []);
    } catch {}
    // Load Telegram destinations
    try {
      const telegramRes = await telegramDestinationsApi.list();
      setTelegramDestinations(telegramRes.data.destinations || []);
      setTelegramFallback(telegramRes.data.envFallback || null);
    } catch {}
    setLoading(false);
  };

  const handleEdit = (p: any) => {
    setEditing(p.id);
    setFormData({ ...p, apiKey: '' });
  };

  const handleSave = async (id: string) => {
    try {
      await providersApi.update(id, formData);
      toast.success('Đã cập nhật');
      setEditing(null);
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const { data } = await providersApi.test(id);
      if (data.success) toast.success(`✅ ${data.response}`);
      else toast.error(`❌ ${data.error}`);
    } catch { toast.error('Test thất bại'); }
    finally { setTesting(null); }
  };

  const toggleEnabled = async (p: any) => {
    try {
      await providersApi.update(p.id, { ...p, isEnabled: !p.isEnabled });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const handleCreateProvider = async () => {
    if (!providerForm.name || !providerForm.modelName || !providerForm.apiKey) {
      toast.error('Vui lòng điền tên, model và API key');
      return;
    }
    setProviderSaving(true);
    try {
      await providersApi.create(providerForm);
      toast.success('Đã thêm provider');
      setShowProviderForm(false);
      setProviderForm({ name: '', modelName: '', apiKey: '', baseUrl: '', maxTokens: 2048, temperature: 0.7, priority: 10 });
      load();
    } catch { toast.error('Lỗi thêm provider'); }
    finally { setProviderSaving(false); }
  };

  const handleDeleteProvider = async (p: any) => {
    if (!confirm(`Xóa provider "${p.name}"?`)) return;
    try {
      await providersApi.delete(p.id);
      toast.success('Đã xóa');
      load();
    } catch { toast.error('Lỗi xóa provider'); }
  };

  const isEmbeddingProvider = (p: any) =>
    p.name.toLowerCase().includes('jina') || p.modelName.toLowerCase().includes('embedding');

  const handleCreateEmbedding = async () => {
    if (!embeddingForm.name || !embeddingForm.modelName || !embeddingForm.apiKey) {
      toast.error('Vui lòng điền tên, model và API key');
      return;
    }
    setEmbeddingSaving(true);
    try {
      await providersApi.create({ ...embeddingForm, maxTokens: 0, temperature: 0 });
      toast.success('Đã thêm embedding provider');
      setShowEmbeddingForm(false);
      setEmbeddingForm({ name: '', modelName: 'jina-embeddings-v2-base-multilingual', apiKey: '', baseUrl: '', priority: 10 });
      load();
    } catch { toast.error('Lỗi thêm embedding provider'); }
    finally { setEmbeddingSaving(false); }
  };

  const handleTestEmbedding = async (id: string) => {
    setEmbeddingTesting(id);
    try {
      const { data } = await providersApi.test(id);
      if (data.success) toast.success(`✅ ${data.response}`);
      else toast.error(`❌ ${data.error}`);
    } catch { toast.error('Test thất bại'); }
    finally { setEmbeddingTesting(null); }
  };

  const resetTelegramForm = () => {
    setTelegramForm({ name: '', type: 'group', chatId: '', isActive: true });
    setTelegramEditing(null);
    setShowTelegramForm(false);
  };

  const editTelegramDestination = (destination: any) => {
    setTelegramForm({
      name: destination.name,
      type: destination.type,
      chatId: destination.chatId,
      isActive: destination.isActive,
    });
    setTelegramEditing(destination.id);
    setShowTelegramForm(true);
  };

  const saveTelegramDestination = async () => {
    try {
      if (!telegramForm.name.trim() || !telegramForm.chatId.trim()) {
        toast.error('Vui long nhap ten va Chat ID');
        return;
      }
      const payload = { ...telegramForm, purpose: 'status' as const };
      if (telegramEditing) {
        await telegramDestinationsApi.update(telegramEditing, payload);
        toast.success('Da cap nhat kenh Telegram');
      } else {
        await telegramDestinationsApi.create(payload);
        toast.success('Da them kenh Telegram');
      }
      resetTelegramForm();
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Loi luu cau hinh Telegram');
    }
  };

  const toggleTelegramDestination = async (destination: any) => {
    try {
      await telegramDestinationsApi.update(destination.id, { isActive: !destination.isActive });
      load();
    } catch { toast.error('Loi cap nhat trang thai'); }
  };

  const deleteTelegramDestination = async (destination: any) => {
    if (!confirm(`Xoa ${destination.name}?`)) return;
    try {
      await telegramDestinationsApi.delete(destination.id);
      toast.success('Da xoa kenh Telegram');
      load();
    } catch { toast.error('Loi xoa kenh Telegram'); }
  };

  const testTelegramDestination = async (destination: any) => {
    setTelegramTesting(destination.id);
    try {
      await telegramDestinationsApi.test(destination.id);
      toast.success('Da gui tin test');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Test Telegram that bai');
    } finally {
      setTelegramTesting(null);
    }
  };

  // Facebook Menu management
  const setupFbMenu = async () => {
    setMenuLoading(true);
    try {
      const { data } = await facebookMenuApi.setup({ greeting: greetingText || undefined });
      if (data.success || data.result) {
        toast.success('✅ Menu & Greeting đã được cài đặt!');
        load();
      } else {
        toast.error('❌ ' + (data.error || 'Lỗi cài đặt'));
      }
    } catch { toast.error('Lỗi kết nối backend'); }
    finally { setMenuLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Cài đặt</h1>

      {/* Webhook Status */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Link className="w-5 h-5 text-blue-600" /> Facebook Webhook</h2>
        {webhookInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Verify Token</p>
              <p className="font-mono text-sm">{webhookInfo.verifyToken || 'Chưa cấu hình'}</p>
            </div>
            <div>
              <p className="text-gray-500">Page Access Token</p>
              <p className="font-mono text-sm">{webhookInfo.pageAccessToken || 'Chưa cấu hình'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-gray-500">Webhook URL</p>
              <p className="font-mono text-sm text-blue-600">{webhookInfo.webhookUrl || 'N/A'}</p>
              <p className="text-xs text-gray-400 mt-1">Cấu hình URL này trong Facebook App → Messenger → Webhook</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Chưa có thông tin (back-end chưa chạy?)</p>
        )}
      </div>

      {/* Telegram Status Destinations */}
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bell className="w-5 h-5 text-blue-600" /> Telegram Status</h2>
          <button onClick={() => { resetTelegramForm(); setShowTelegramForm(true); }} className="btn-primary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Them group/channel
          </button>
        </div>

        {telegramFallback?.statusGroupIdConfigured && telegramDestinations.length === 0 && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Dang dung fallback tu bien moi truong TELEGRAM_STATUS_GROUP_ID. Khi them group/channel o day, he thong se gui theo cau hinh tren Dashboard.
          </div>
        )}

        {showTelegramForm && (
          <div className="border rounded-lg p-4 bg-gray-50 mb-4 space-y-3">
            <h3 className="font-medium text-sm">{telegramEditing ? 'Sua cau hinh Telegram' : 'Them group/channel Telegram'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Ten hien thi</label>
                <input value={telegramForm.name} onChange={e => setTelegramForm({ ...telegramForm, name: e.target.value })} className="input-field text-sm" placeholder="VD: Group van hanh" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Loai</label>
                <select value={telegramForm.type} onChange={e => setTelegramForm({ ...telegramForm, type: e.target.value as 'group' | 'channel' })} className="input-field text-sm">
                  <option value="group">Group</option>
                  <option value="channel">Channel</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Chat ID / @username</label>
                <input value={telegramForm.chatId} onChange={e => setTelegramForm({ ...telegramForm, chatId: e.target.value })} className="input-field text-sm font-mono" placeholder="-1001234567890 hoac @channel" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={telegramForm.isActive} onChange={e => setTelegramForm({ ...telegramForm, isActive: e.target.checked })} />
              Dang bat nhan thong bao trang thai
            </label>
            <div className="flex gap-2">
              <button onClick={resetTelegramForm} className="btn-secondary text-sm flex items-center gap-1"><X className="w-4 h-4" /> Huy</button>
              <button onClick={saveTelegramDestination} className="btn-primary text-sm flex items-center gap-1"><Save className="w-4 h-4" /> Luu</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {telegramDestinations.length === 0 ? (
            <p className="text-sm text-gray-400">Chua co group/channel nao duoc cau hinh tren Dashboard.</p>
          ) : (
            telegramDestinations.map(destination => (
              <div key={destination.id} className="flex items-center justify-between border rounded-lg p-3 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{destination.name}</span>
                    <span className="badge badge-gray">{destination.type === 'channel' ? 'Channel' : 'Group'}</span>
                    <span className={destination.isActive ? 'badge badge-green' : 'badge badge-red'}>{destination.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-1 break-all">{destination.chatId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <button onClick={() => testTelegramDestination(destination)} disabled={telegramTesting === destination.id} className="btn-secondary text-sm flex items-center gap-1">
                    {telegramTesting === destination.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Test
                  </button>
                  <button onClick={() => toggleTelegramDestination(destination)} className="btn-secondary text-sm">
                    {destination.isActive ? 'Tat' : 'Bat'}
                  </button>
                  <button onClick={() => editTelegramDestination(destination)} className="btn-secondary text-sm">Sua</button>
                  <button onClick={() => deleteTelegramDestination(destination)} className="btn-secondary text-sm text-red-600 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Xoa</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
          <p>Group dung Chat ID am, thuong co dang -100... Channel public co the dung @username; channel private can lay ID -100... va them bot lam admin de bot gui duoc tin.</p>
        </div>
      </div>

      {/* Facebook Menu Management */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Menu className="w-5 h-5 text-blue-600" /> Facebook Menu & Greeting</h2>
        
        {fbMenuInfo && fbMenuInfo.data ? (
          <div className="mb-4 text-sm space-y-2">
            <div>
              <span className="text-gray-500">Greeting hiện tại: </span>
              <span className="text-gray-700">{fbMenuInfo.data?.data?.[0]?.greeting?.[0]?.text || 'Chưa thiết lập'}</span>
            </div>
            <div>
              <span className="text-gray-500">Get Started: </span>
              <span className={fbMenuInfo.data?.data?.[0]?.get_started ? 'badge badge-green' : 'badge badge-gray'}>
                {fbMenuInfo.data?.data?.[0]?.get_started ? 'Đã thiết lập' : 'Chưa thiết lập'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Persistent Menu: </span>
              <span className={fbMenuInfo.data?.data?.[0]?.persistent_menu ? 'badge badge-green' : 'badge badge-gray'}>
                {fbMenuInfo.data?.data?.[0]?.persistent_menu ? 'Đã thiết lập' : 'Chưa thiết lập'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">Chưa lấy được thông tin menu (back-end chưa chạy?)</p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Lời chào (Greeting Text)</label>
            <input
              value={greetingText}
              onChange={e => setGreetingText(e.target.value)}
              className="input-field text-sm mt-1"
              placeholder="Xin chào! 👋 Mình là trợ lý ảo của BBO Tech..."
            />
            <p className="text-xs text-gray-400 mt-1">Để trống để dùng mặc định của hệ thống</p>
          </div>
          <div className="flex gap-2">
            <button onClick={setupFbMenu} disabled={menuLoading} className="btn-primary text-sm flex items-center gap-1">
              {menuLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Cài đặt Menu & Greeting
            </button>
          </div>
          <div className="text-xs text-gray-400 bg-blue-50 p-3 rounded-lg">
            <p className="font-medium">📌 Menu sẽ được cài đặt:</p>
            <ul className="mt-1 space-y-0.5">
              <li>🏠 Trang chủ → Giới thiệu công ty</li>
              <li>📋 Dịch vụ → Danh sách dịch vụ</li>
              <li>📅 Đặt lịch tư vấn → Flow đặt lịch</li>
              <li>📊 Chiến dịch → Danh sách chiến dịch</li>
              <li>🌐 Website → https://bbotech.vn</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Embedding Providers */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-purple-600" /> Embedding Providers</h2>
          <button onClick={() => setShowEmbeddingForm(v => !v)} className="btn-primary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Thêm Provider
          </button>
        </div>

        {showEmbeddingForm && (
          <div className="border border-purple-200 bg-purple-50 rounded-lg p-4 mb-4 space-y-3">
            <h3 className="text-sm font-semibold">Thêm embedding provider mới</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Tên <span className="text-red-500">*</span></label>
                <input value={embeddingForm.name} onChange={e => setEmbeddingForm({...embeddingForm, name: e.target.value})} className="input-field text-sm" placeholder="Jina AI" />
              </div>
              <div>
                <label className="text-xs font-medium">Model <span className="text-red-500">*</span></label>
                <input value={embeddingForm.modelName} onChange={e => setEmbeddingForm({...embeddingForm, modelName: e.target.value})} className="input-field text-sm" placeholder="jina-embeddings-v2-base-multilingual" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">API Key <span className="text-red-500">*</span></label>
              <input type="password" value={embeddingForm.apiKey} onChange={e => setEmbeddingForm({...embeddingForm, apiKey: e.target.value})} className="input-field text-sm" placeholder="jina_..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Priority</label>
                <input type="number" value={embeddingForm.priority} onChange={e => setEmbeddingForm({...embeddingForm, priority: parseInt(e.target.value)})} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Base URL (tuỳ chọn)</label>
                <input value={embeddingForm.baseUrl} onChange={e => setEmbeddingForm({...embeddingForm, baseUrl: e.target.value})} className="input-field text-sm" placeholder="https://..." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowEmbeddingForm(false)} className="btn-secondary text-sm">Hủy</button>
              <button onClick={handleCreateEmbedding} disabled={embeddingSaving} className="btn-primary text-sm">
                {embeddingSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div></div>
        ) : (
          <div className="space-y-3">
            {providers.filter(isEmbeddingProvider).length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có embedding provider nào.</p>
            ) : (
              providers.filter(isEmbeddingProvider).map(p => (
                <div key={p.id} className="flex items-center justify-between border rounded-lg p-4 flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      {p.isEnabled
                        ? <span className="badge badge-green"><CheckCircle className="w-3 h-3 mr-1" />Enabled</span>
                        : <span className="badge badge-red"><XCircle className="w-3 h-3 mr-1" />Disabled</span>}
                    </div>
                    <p className="text-sm text-gray-500">{p.modelName} | Priority: {p.priority}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleTestEmbedding(p.id)} disabled={embeddingTesting === p.id} className="btn-secondary text-sm flex items-center gap-1">
                      {embeddingTesting === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                      Test
                    </button>
                    <button onClick={() => toggleEnabled(p)} className="btn-secondary text-sm">
                      {p.isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => handleDeleteProvider(p)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500 bg-purple-50 p-3 rounded-lg">
          <p className="font-medium">💡 Lưu ý:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Jina AI</strong> (jina-embeddings-v2-base-multilingual): 768 dims, miễn phí 1M token/tháng</li>
            <li>Embedding dùng để tìm kiếm ngữ nghĩa trong Knowledge Base (RAG)</li>
            <li>Nếu có Gemini, hệ thống ưu tiên Gemini embedding trước, Jina là fallback</li>
          </ul>
        </div>
      </div>

      {/* LLM Providers */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Zap className="w-5 h-5 text-blue-600" /> LLM Providers</h2>
          <button onClick={() => setShowProviderForm(v => !v)} className="btn-primary text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Thêm Provider
          </button>
        </div>

        {showProviderForm && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-4 space-y-3">
            <h3 className="text-sm font-semibold">Thêm provider mới</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Tên <span className="text-red-500">*</span></label>
                <input value={providerForm.name} onChange={e => setProviderForm({...providerForm, name: e.target.value})} className="input-field text-sm" placeholder="Jina AI" />
              </div>
              <div>
                <label className="text-xs font-medium">Model <span className="text-red-500">*</span></label>
                <input value={providerForm.modelName} onChange={e => setProviderForm({...providerForm, modelName: e.target.value})} className="input-field text-sm" placeholder="jina-embeddings-v2-base-multilingual" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">API Key <span className="text-red-500">*</span></label>
              <input type="password" value={providerForm.apiKey} onChange={e => setProviderForm({...providerForm, apiKey: e.target.value})} className="input-field text-sm" placeholder="jina_..." />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium">Max Tokens</label>
                <input type="number" value={providerForm.maxTokens} onChange={e => setProviderForm({...providerForm, maxTokens: parseInt(e.target.value)})} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Temperature</label>
                <input type="number" step="0.1" value={providerForm.temperature} onChange={e => setProviderForm({...providerForm, temperature: parseFloat(e.target.value)})} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Priority</label>
                <input type="number" value={providerForm.priority} onChange={e => setProviderForm({...providerForm, priority: parseInt(e.target.value)})} className="input-field text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Base URL (tuỳ chọn)</label>
                <input value={providerForm.baseUrl} onChange={e => setProviderForm({...providerForm, baseUrl: e.target.value})} className="input-field text-sm" placeholder="https://..." />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowProviderForm(false)} className="btn-secondary text-sm">Hủy</button>
              <button onClick={handleCreateProvider} disabled={providerSaving} className="btn-primary text-sm">
                {providerSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
        ) : (
          <div className="space-y-4">
            {providers.filter(p => !isEmbeddingProvider(p)).map(p => (
              <div key={p.id} className="border rounded-lg p-4">
                {editing === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium">Tên</label>
                        <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Model</label>
                        <input value={formData.modelName} onChange={e => setFormData({...formData, modelName: e.target.value})} className="input-field text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">API Key</label>
                      <input type="password" value={formData.apiKey} onChange={e => setFormData({...formData, apiKey: e.target.value})} className="input-field text-sm" placeholder="Để trống nếu giữ nguyên" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium">Max Tokens</label>
                        <input type="number" value={formData.maxTokens} onChange={e => setFormData({...formData, maxTokens: parseInt(e.target.value)})} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Temperature</label>
                        <input type="number" step="0.1" value={formData.temperature} onChange={e => setFormData({...formData, temperature: parseFloat(e.target.value)})} className="input-field text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Priority</label>
                        <input type="number" value={formData.priority} onChange={e => setFormData({...formData, priority: parseInt(e.target.value)})} className="input-field text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Base URL (tuỳ chọn)</label>
                      <input value={formData.baseUrl || ''} onChange={e => setFormData({...formData, baseUrl: e.target.value || null})} className="input-field text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Hủy</button>
                      <button onClick={() => handleSave(p.id)} className="btn-primary text-sm">Lưu</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{p.name}</h3>
                          {p.isEnabled ? (
                            <span className="badge badge-green"><CheckCircle className="w-3 h-3 mr-1" />Enabled</span>
                          ) : (
                            <span className="badge badge-red"><XCircle className="w-3 h-3 mr-1" />Disabled</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {p.modelName} | Max: {p.maxTokens} | Temp: {p.temperature} | Priority: {p.priority}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTest(p.id)} disabled={testing === p.id} className="btn-secondary text-sm flex items-center gap-1">
                        {testing === p.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                        Test
                      </button>
                      <button onClick={() => toggleEnabled(p)} className="btn-secondary text-sm">
                        {p.isEnabled ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => handleEdit(p)} className="btn-secondary text-sm">Sửa</button>
                      <button onClick={() => handleDeleteProvider(p)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500 bg-blue-50 p-3 rounded-lg">
          <p className="font-medium">💡 Lưu ý:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Jina AI</strong> (jina-embeddings-v2-base-multilingual): Embedding miễn phí 1M token/tháng</li>
            <li><strong>Google Gemini</strong> (gemini-2.0-flash): Text generation, free tier</li>
            <li><strong>DeepSeek</strong> (deepseek-chat): Tool calling, ~$0.14/1M tokens</li>
            <li>Sau khi thêm/sửa API Key, nhấn <strong>Test</strong> để kiểm tra kết nối</li>
          </ul>
        </div>
      </div>

      {/* Facebook Pages */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Facebook className="w-5 h-5 text-blue-600" /> Facebook Pages</h2>
        
        <div className="space-y-3 mb-4">
          {fbPages.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có page nào được cấu hình</p>
          ) : (
            fbPages.map(page => (
              <div key={page.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{page.pageName}</span>
                    {page.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}
                    <span className="text-xs text-gray-400">ID: {page.pageId}</span>
                    {page.tenantId
                      ? <span className="badge badge-green">{tenants.find((t: any) => t.id === page.tenantId)?.name || 'Tenant'}</span>
                      : <span className="badge badge-red">Chưa gán tenant</span>}
                  </div>
                  {page.botPersona && <p className="text-xs text-gray-500 mt-1">🧠 Persona: {page.botPersona.substring(0, 80)}...</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{page.hasToken ? '🔑 Token set' : '❌ No token'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add FB Page Form */}
        {showFbPageForm && (
          <div className="border rounded-lg p-4 bg-gray-50 mb-4 space-y-3">
            <h3 className="font-medium text-sm">Thêm Facebook Page</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Page ID</label>
                <input value={fbForm.pageId} onChange={e => setFbForm({...fbForm, pageId: e.target.value})} className="input-field text-sm" placeholder="Facebook Page ID" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Page Name</label>
                <input value={fbForm.pageName} onChange={e => setFbForm({...fbForm, pageName: e.target.value})} className="input-field text-sm" placeholder="Tên page" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Access Token</label>
              <input type="password" value={fbForm.accessToken} onChange={e => setFbForm({...fbForm, accessToken: e.target.value})} className="input-field text-sm" placeholder="Page Access Token" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Tenant (chủ sở hữu)</label>
              <select value={fbForm.tenantId} onChange={e => setFbForm({...fbForm, tenantId: e.target.value})} className="input-field text-sm">
                <option value="">— Chưa gán (legacy, chưa context-ready cho webhook) —</option>
                {tenants.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name || t.slug}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFbPageForm(false)} className="btn-secondary text-sm">Hủy</button>
              <button onClick={async () => {
                try {
                  await facebookPagesApi.create({ ...fbForm, tenantId: fbForm.tenantId || null });
                  toast.success('Đã thêm page');
                  setShowFbPageForm(false);
                  setFbForm({ pageId: '', pageName: '', accessToken: '', isActive: true, tenantId: '' });
                  // Reload
                  const { data } = await facebookPagesApi.list();
                  setFbPages(data);
                } catch { toast.error('Lỗi thêm page'); }
              }} className="btn-primary text-sm">Thêm Page</button>
            </div>
          </div>
        )}
        
        <button onClick={() => setShowFbPageForm(true)} className="btn-secondary text-sm">+ Thêm Facebook Page</button>
        
        <div className="mt-4 text-xs text-gray-400 bg-blue-50 p-3 rounded-lg">
          <p>Multi-page support: Mỗi Facebook Page có thể có token, bot persona, và knowledge filter riêng. Webhook tự động lookup page từ entry.id.</p>
        </div>
      </div>
    </div>
  );
}
