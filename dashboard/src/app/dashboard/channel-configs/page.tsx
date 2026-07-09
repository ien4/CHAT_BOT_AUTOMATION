'use client';
import { useEffect, useState } from 'react';
import { channelConfigsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import { Plus, Trash2, Edit3, Layers, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChannelConfig {
  id: string;
  inboxId: string;
  channelType: string;
  name: string;
  knowledgeFilter: string[];
  botPersonaOverride: string | null;
  isActive: boolean;
  createdAt: string;
}

const CHANNEL_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  facebook:  { label: 'Facebook',  color: 'bg-blue-100 text-blue-700' },
  web:       { label: 'Website',   color: 'bg-green-100 text-green-700' },
  whatsapp:  { label: 'WhatsApp',  color: 'bg-emerald-100 text-emerald-700' },
  email:     { label: 'Email',     color: 'bg-purple-100 text-purple-700' },
};

const CHANNEL_TYPES = ['facebook', 'web', 'whatsapp', 'email'];

const emptyForm = {
  inboxId: '',
  channelType: 'facebook',
  name: '',
  knowledgeFilter: '',
  botPersonaOverride: '',
  isActive: true,
};

export default function ChannelConfigsPage() {
  const { selectedTenantId, isPlatformAdmin } = useAuth();
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChannelConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, [selectedTenantId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await channelConfigsApi.list();
      setConfigs(data);
    } catch { toast.error('Lỗi tải cấu hình kênh'); }
    finally { setLoading(false); }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (cfg: ChannelConfig) => {
    setEditing(cfg);
    setForm({
      inboxId: cfg.inboxId,
      channelType: cfg.channelType,
      name: cfg.name,
      knowledgeFilter: cfg.knowledgeFilter.join(', '),
      botPersonaOverride: cfg.botPersonaOverride || '',
      isActive: cfg.isActive,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        inboxId: form.inboxId,
        channelType: form.channelType,
        name: form.name,
        knowledgeFilter: form.knowledgeFilter
          ? form.knowledgeFilter.split(',').map(t => t.trim()).filter(Boolean)
          : [],
        botPersonaOverride: form.botPersonaOverride || null,
        isActive: form.isActive,
      };
      if (editing) {
        await channelConfigsApi.update(editing.id, payload);
        toast.success('Đã cập nhật kênh');
      } else {
        await channelConfigsApi.create(payload);
        toast.success('Đã thêm kênh');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi lưu');
    }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa kênh "${name}"?`)) return;
    try {
      await channelConfigsApi.delete(id);
      toast.success('Đã xóa');
      load();
    } catch { toast.error('Lỗi xóa'); }
  };

  const toggleActive = async (cfg: ChannelConfig) => {
    try {
      await channelConfigsApi.update(cfg.id, { isActive: !cfg.isActive });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kênh Chat</h1>
          <p className="text-gray-500 text-sm mt-1">Cấu hình bot theo từng nguồn tin nhắn (Facebook, Website, WhatsApp...)</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm kênh
        </button>
      </div>

      <TenantScopeBanner />

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm space-y-2">
        <p className="font-medium text-blue-800">💡 Cấu hình kênh là tùy chọn — không bắt buộc</p>
        <p className="text-blue-700">
          Bot <strong>tự động nhận và trả lời tin nhắn từ tất cả kênh</strong> mà không cần cấu hình tại đây.
          Nguồn tin nhắn sẽ được backend phân loại trước khi áp dụng cấu hình riêng.
        </p>
        <p className="text-blue-700">Chỉ cần thêm kênh vào đây nếu bạn muốn <strong>tùy chỉnh riêng cho từng kênh</strong>:</p>
        <ul className="list-disc list-inside text-blue-700 space-y-0.5 ml-1">
          <li><strong>Filter kiến thức</strong> — kênh Facebook chỉ dùng knowledge tag <code className="bg-blue-100 px-1 rounded">facebook</code>, kênh web dùng tag <code className="bg-blue-100 px-1 rounded">web</code>...</li>
          <li><strong>Bot persona riêng</strong> — mỗi kênh có phong cách trả lời khác nhau (chỉ áp dụng cho kênh global)</li>
        </ul>
        <p className="text-blue-600 text-xs">Nếu không cấu hình: bot dùng toàn bộ knowledge và persona mặc định của tenant.</p>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editing ? 'Sửa kênh' : 'Thêm kênh mới'}</h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Inbox ID</label>
                  <input
                    value={form.inboxId}
                    onChange={e => setForm(f => ({ ...f, inboxId: e.target.value }))}
                    className="input-field"
                    placeholder="VD: 12"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Loại kênh</label>
                  <select
                    value={form.channelType}
                    onChange={e => setForm(f => ({ ...f, channelType: e.target.value }))}
                    className="input-field"
                  >
                    {CHANNEL_TYPES.map(t => (
                      <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]?.label || t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500">Tên kênh</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  placeholder="VD: Fanpage chính, Website bán hàng..."
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500">
                  Filter kiến thức <span className="text-gray-400 font-normal">(tags, cách nhau bởi dấu phẩy)</span>
                </label>
                <input
                  value={form.knowledgeFilter}
                  onChange={e => setForm(f => ({ ...f, knowledgeFilter: e.target.value }))}
                  className="input-field"
                  placeholder="VD: web, pricing, product — để trống = dùng tất cả"
                />
              </div>

              {!selectedTenantId && (
                <div>
                  <label className="text-xs font-medium text-gray-500">
                    Bot persona riêng <span className="text-gray-400 font-normal">(để trống = dùng global)</span>
                  </label>
                  <textarea
                    value={form.botPersonaOverride}
                    onChange={e => setForm(f => ({ ...f, botPersonaOverride: e.target.value }))}
                    className="input-field"
                    rows={3}
                    placeholder="VD: Bạn là trợ lý tư vấn website, chuyên về sản phẩm online..."
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">Kích hoạt kênh này</label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Hủy</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm kênh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
        </div>
      ) : configs.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-medium">Chưa có kênh nào được cấu hình</p>
          <p className="text-sm mt-1">Thêm kênh để bot biết cách xử lý từng nguồn tin nhắn</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {configs.map(cfg => {
            const typeInfo = CHANNEL_TYPE_LABELS[cfg.channelType];
            return (
              <div key={cfg.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${typeInfo?.color || 'bg-gray-100 text-gray-600'}`}>
                      {typeInfo?.label || cfg.channelType}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{cfg.name}</h3>
                        <span className="text-xs text-gray-400">Inbox #{cfg.inboxId}</span>
                        {cfg.isActive ? (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3 h-3" /> Hoạt động
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <XCircle className="w-3 h-3" /> Tắt
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex gap-3">
                        {cfg.knowledgeFilter.length > 0 ? (
                          <span>Filter: {cfg.knowledgeFilter.map(t => (
                            <span key={t} className="inline-block bg-gray-100 rounded px-1 mr-1">{t}</span>
                          ))}</span>
                        ) : (
                          <span className="text-gray-400">Dùng tất cả kiến thức</span>
                        )}
                        {cfg.botPersonaOverride && <span className="text-blue-500">Persona riêng</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(cfg)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        cfg.isActive
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cfg.isActive ? 'Bật' : 'Tắt'}
                    </button>
                    <button onClick={() => openEdit(cfg)} className="p-2 text-gray-400 hover:text-blue-600">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(cfg.id, cfg.name)} className="p-2 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
