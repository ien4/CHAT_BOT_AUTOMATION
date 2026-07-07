'use client';
import { useEffect, useState, useMemo } from 'react';
import { promptsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import { Plus, Edit3, Trash2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'identity', label: '🧠 Bot Identity' },
  { key: 'guardrails', label: '🛡️ Guardrails' },
  { key: 'chatbot', label: '🤖 Chatbot' },
  { key: 'email_b2b', label: '📧 Email B2B' },
  { key: 'zalo_b2b', label: '💬 Zalo B2B' },
];

const CHATBOT_INTENTS = ['company_info', 'service_inquiry', 'content_package', 'campaign', 'general', 'fallback'];

export default function PromptsPage() {
  const { selectedTenantId } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [intentType, setIntentType] = useState('general');
  const [layer, setLayer] = useState('intent');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPromptTemplate, setUserPromptTemplate] = useState('');
  const [modelPreference, setModelPreference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, [selectedTenantId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await promptsApi.list();
      setTemplates(data);
    } catch (e) { toast.error('Lỗi tải prompt'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (activeTab === 'all') return templates;
    if (activeTab === 'identity') return templates.filter(t => t.layer === 'identity');
    if (activeTab === 'guardrails') return templates.filter(t => t.layer === 'guardrails');
    if (activeTab === 'chatbot') return templates.filter(t => CHATBOT_INTENTS.includes(t.intentType) && t.layer === 'intent');
    return templates.filter(t => t.intentType === activeTab && t.layer === 'intent');
  }, [templates, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name,
        intentType: (layer === 'identity' || layer === 'guardrails') ? layer : intentType,
        layer,
        systemPrompt,
        userPromptTemplate,
        modelPreference: modelPreference || null,
      };
      if (editing) {
        await promptsApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await promptsApi.create(payload);
        toast.success('Đã thêm prompt');
      }
      resetForm();
      load();
    } catch (e) { toast.error('Lỗi lưu'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa?')) return;
    try { await promptsApi.delete(id); toast.success('Đã xóa'); load(); }
    catch { toast.error('Lỗi xóa'); }
  };

  const handleEdit = (t: any) => {
    setEditing(t);
    setName(t.name);
    setIntentType(t.intentType);
    setLayer(t.layer || 'intent');
    setSystemPrompt(t.systemPrompt);
    setUserPromptTemplate(t.userPromptTemplate || '');
    setModelPreference(t.modelPreference || '');
    setShowForm(true);
  };

  const getDefaultLayer = (tab: string) => {
    if (tab === 'identity') return 'identity';
    if (tab === 'guardrails') return 'guardrails';
    return 'intent';
  };

  const getDefaultIntentType = (tab: string) => {
    if (tab === 'email_b2b') return 'email_b2b';
    if (tab === 'zalo_b2b') return 'zalo_b2b';
    return 'general';
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setLayer(getDefaultLayer(activeTab));
    setIntentType(getDefaultIntentType(activeTab));
    setSystemPrompt('');
    setUserPromptTemplate('');
    setModelPreference('');
    setShowForm(false);
  };

  const intentLabel = (t: string) => {
    const map: Record<string, string> = {
      identity: '🧠 Bot Identity',
      guardrails: '🛡️ Guardrails',
      company_info: 'Thông tin công ty',
      service_inquiry: 'Dịch vụ',
      content_package: 'Gói nội dung',
      campaign: 'Chiến dịch',
      general: 'Chung',
      fallback: 'Fallback',
      email_b2b: 'Email B2B',
      zalo_b2b: 'Zalo B2B',
    };
    return map[t] || t;
  };

  const getTabCount = (key: string) => {
    if (key === 'all') return templates.length;
    if (key === 'identity') return templates.filter(t => t.layer === 'identity').length;
    if (key === 'guardrails') return templates.filter(t => t.layer === 'guardrails').length;
    if (key === 'chatbot') return templates.filter(t => CHATBOT_INTENTS.includes(t.intentType) && t.layer === 'intent').length;
    return templates.filter(t => t.intentType === key && t.layer === 'intent').length;
  };

  const isLayerFixed = layer === 'identity' || layer === 'guardrails';

  return (
    <div className="space-y-4">
      <TenantScopeBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Prompt Templates</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-0 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); resetForm(); setShowForm(false); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white border border-gray-200 border-b-white -mb-[1px] text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400">({getTabCount(tab.key)})</span>
          </button>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editing ? 'Sửa prompt' : 'Thêm prompt'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Tên</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Tên template" required />
                </div>
                <div>
                  <label className="text-sm font-medium">Tầng (Layer)</label>
                  <select value={layer} onChange={e => setLayer(e.target.value)} className="input-field">
                    <option value="identity">🧠 Identity (cá tính bot)</option>
                    <option value="guardrails">🛡️ Guardrails (quy tắc/giới hạn)</option>
                    <option value="intent">🎯 Intent (hành vi theo intent)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {layer === 'identity' && 'Load cho MỌI cuộc hội thoại, định nghĩa cá tính bot'}
                    {layer === 'guardrails' && 'Append vào cuối system prompt, áp dụng cho MỌI cuộc hội thoại'}
                    {layer === 'intent' && 'Per-intent behavioral hint, chỉ load khi detect đúng intent'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Loại intent</label>
                  <select
                    value={intentType}
                    onChange={e => setIntentType(e.target.value)}
                    className="input-field"
                    disabled={isLayerFixed}
                  >
                    <optgroup label="Chatbot">
                      <option value="company_info">Thông tin công ty</option>
                      <option value="service_inquiry">Dịch vụ</option>
                      <option value="content_package">Gói nội dung</option>
                      <option value="campaign">Chiến dịch</option>
                      <option value="general">Chung</option>
                      <option value="fallback">Fallback</option>
                    </optgroup>
                    <optgroup label="B2B Outreach">
                      <option value="email_b2b">Email B2B</option>
                      <option value="zalo_b2b">Zalo B2B</option>
                    </optgroup>
                  </select>
                  {isLayerFixed && (
                    <p className="text-xs text-gray-400 mt-0.5">Không áp dụng cho layer này</p>
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Model (tùy chọn)</label>
                <input value={modelPreference} onChange={e => setModelPreference(e.target.value)} className="input-field" placeholder="gemini-2.0-flash" />
              </div>
              <div>
                <label className="text-sm font-medium">System Prompt</label>
                {layer === 'guardrails' && (
                  <p className="text-xs text-amber-600 mb-1">
                    Nội dung này sẽ được append vào cuối system prompt. Viết các quy tắc/giới hạn cho bot (ví dụ: không nói về chủ đề X, luôn giới thiệu sản phẩm Y khi có cơ hội...).
                  </p>
                )}
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  className="input-field min-h-[120px] font-mono text-sm"
                  placeholder={
                    layer === 'guardrails'
                      ? 'Ví dụ:\n- Không đề cập đến đối thủ cạnh tranh\n- Luôn mời khách đặt lịch tư vấn miễn phí\n- Không báo giá cụ thể, chuyển sang gặp tư vấn viên'
                      : 'System prompt với placeholders {{KNOWLEDGE_CONTEXT}}, {{WEBSITE_ANALYSIS}}, {{CAMPAIGN_CONTEXT}}'
                  }
                  required
                />
              </div>
              {layer === 'intent' && (
                <div>
                  <label className="text-sm font-medium">User Prompt Template</label>
                  <textarea value={userPromptTemplate} onChange={e => setUserPromptTemplate(e.target.value)} className="input-field min-h-[80px] font-mono text-sm" placeholder="User prompt với {{USER_MESSAGE}}, {{CONVERSATION_HISTORY}}" />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="btn-secondary">Hủy</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Chưa có prompt nào</p>
          {activeTab === 'guardrails' && (
            <p className="text-xs mt-2 max-w-sm mx-auto">
              Guardrails là các quy tắc/giới hạn được append vào cuối system prompt. Tenant không có guardrails riêng sẽ dùng guardrails global.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(t => (
            <div key={t.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold">{t.name}</h3>
                    {t.layer === 'identity' && <span className="badge badge-purple">🧠 Identity</span>}
                    {t.layer === 'guardrails' && <span className="badge badge-yellow">🛡️ Guardrails</span>}
                    {t.layer === 'intent' && <span className="badge badge-blue">{intentLabel(t.intentType)}</span>}
                    {t.modelPreference && <span className="badge badge-gray">{t.modelPreference}</span>}
                    {!t.isActive && <span className="badge badge-red">Inactive</span>}
                  </div>
                  {t.layer === 'identity' && (
                    <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded mb-2">
                      🧠 <strong>Bot Identity</strong> — Định nghĩa cá tính bot, load cho MỌI cuộc hội thoại. Tenant không có identity riêng sẽ dùng cái này.
                    </div>
                  )}
                  {t.layer === 'guardrails' && (
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-2">
                      🛡️ <strong>Guardrails</strong> — Quy tắc/giới hạn được append vào cuối system prompt, áp dụng cho MỌI cuộc hội thoại. Tenant không có guardrails riêng sẽ dùng cái này.
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">System Prompt:</p>
                    <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap max-h-[120px] overflow-y-auto">{t.systemPrompt}</pre>
                  </div>
                  {t.userPromptTemplate && t.layer === 'intent' && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">User Prompt:</p>
                      <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap max-h-[80px] overflow-y-auto">{t.userPromptTemplate}</pre>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => handleEdit(t)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(t.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
