'use client';
import { useState, useEffect } from 'react';
import { quickReplyMenusApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import { Plus, Edit2, Trash2, Save, X, Menu as MenuIcon } from 'lucide-react';

const INTENT_TYPES = [
  { value: 'general', label: '💬 General' },
  { value: 'company_info', label: '🏢 Company Info' },
  { value: 'service_inquiry', label: '🛠 Service Inquiry' },
  { value: 'content_package', label: '📦 Content Package' },
  { value: 'fallback', label: '❓ Fallback' },
];

interface QuickReplyMenu {
  id: string;
  intentType: string;
  pageId?: string | null;
  items: { title: string; payload: string }[];
  isActive: boolean;
}

export default function QuickRepliesPage() {
  const { selectedTenantId } = useAuth();
  const [menus, setMenus] = useState<QuickReplyMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editMenu, setEditMenu] = useState<QuickReplyMenu | null>(null);
  const [form, setForm] = useState({
    intentType: 'general',
    pageId: '',
    items: [{ title: '', payload: '' }],
    isActive: true,
  });

  useEffect(() => { fetchMenus(); }, [selectedTenantId]);

  const fetchMenus = async () => {
    try {
      const res = await quickReplyMenusApi.list();
      setMenus(res.data || []);
    } catch (e) { setError('Lỗi tải danh sách menu'); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setEditMenu(null);
    setForm({ intentType: 'general', pageId: '', items: [{ title: '', payload: '' }], isActive: true });
    setShowForm(true);
  };

  const openEdit = (m: QuickReplyMenu) => {
    setEditMenu(m);
    setForm({
      intentType: m.intentType,
      pageId: m.pageId || '',
      items: m.items?.length ? [...m.items] : [{ title: '', payload: '' }],
      isActive: m.isActive,
    });
    setShowForm(true);
  };

  const addItemRow = () => setForm({ ...form, items: [...form.items, { title: '', payload: '' }] });
  const removeItemRow = (idx: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };
  const updateItem = (idx: number, field: string, val: string) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm({ ...form, items });
  };

  const save = async () => {
    const validItems = form.items.filter(i => i.title && i.payload);
    if (!validItems.length) return setError('Cần ít nhất 1 item có title + payload');
    try {
      const data = { ...form, items: validItems, pageId: form.pageId || undefined };
      if (editMenu?.id) await quickReplyMenusApi.update(editMenu.id, data);
      else await quickReplyMenusApi.create(data);
      setShowForm(false); fetchMenus();
    } catch (e: any) { setError(e.response?.data?.error || 'Lỗi lưu menu'); }
  };

  const del = async (id: string) => {
    if (!confirm('Xóa menu này?')) return;
    try { await quickReplyMenusApi.delete(id); fetchMenus(); }
    catch (e) { setError('Lỗi xóa menu'); }
  };

  if (loading) return <div className="flex justify-center h-64 items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div>
      <TenantScopeBanner />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">⚡ Quick Reply Menus</h1>
          <p className="text-gray-500 mt-1">Cấu hình nút Quick Reply cố định cho từng intent. Khi có menu fixed, bot sẽ dùng menu này thay vì AI-generate.</p>
        </div>
        <button onClick={openNew} className="btn btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Tạo menu mới</button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}

      <div className="grid gap-4">
        {menus.length === 0 && <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400"><MenuIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />Chưa có menu nào. Bấm "Tạo menu mới" để định nghĩa Quick Reply cho từng intent.</div>}
        {menus.map(m => {
          const label = INTENT_TYPES.find(t => t.value === m.intentType)?.label || m.intentType;
          return (
            <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-lg">{label}</span>
                    {m.pageId && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">Page: {m.pageId}</span>}
                    {!m.isActive && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Inactive</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(m.items || []).map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                        {item.title}
                        <span className="text-blue-400 text-xs">→ {item.payload}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => openEdit(m)} className="p-1 hover:bg-gray-200 rounded"><Edit2 className="w-4 h-4 text-gray-400" /></button>
                  <button onClick={() => del(m.id)} className="p-1 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[600px] max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-semibold mb-4">{editMenu?.id ? 'Sửa menu' : 'Tạo menu mới'}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Intent Type *</label>
                  <select value={form.intentType} onChange={e => setForm({ ...form, intentType: e.target.value })} className="input" disabled={!!editMenu?.id}>
                    {INTENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Page ID (bỏ trống = global)</label>
                  <input type="text" value={form.pageId} onChange={e => setForm({ ...form, pageId: e.target.value })} className="input" placeholder="All pages" />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                <span className="text-sm">Active</span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-2">Items (title + payload)</label>
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" placeholder="Title" value={item.title} onChange={e => updateItem(idx, 'title', e.target.value)} className="input flex-1" />
                    <input type="text" placeholder="Payload" value={item.payload} onChange={e => updateItem(idx, 'payload', e.target.value)} className="input flex-1" />
                    <button onClick={() => removeItemRow(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={addItemRow} className="text-sm text-blue-600 hover:underline mt-1">+ Thêm item</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary">Hủy</button>
              <button onClick={save} className="btn btn-primary"><Save className="w-4 h-4 mr-1" /> Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}