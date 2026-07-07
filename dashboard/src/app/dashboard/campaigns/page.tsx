'use client';
import { useEffect, useState } from 'react';
import { campaignsApi } from '@/lib/api';
import { API_BASE_URL } from '@/lib/config/env';
import { Plus, Edit3, Trash2, Megaphone, Package, Upload, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Asset {
  name?: string;
  type?: string;
  prompt?: string;
  url?: string;
  description?: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetName, setAssetName] = useState('');
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [assetDesc, setAssetDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const { data } = await campaignsApi.list(); setCampaigns(data); }
    catch { toast.error('Lỗi tải chiến dịch'); }
    finally { setLoading(false); }
  };

  const addAsset = () => {
    if (!assetName && !assetPrompt && !assetUrl) return toast.error('Nhập ít nhất 1 trường');
    setAssets([...assets, { name: assetName, prompt: assetPrompt, url: assetUrl, description: assetDesc }]);
    setAssetName(''); setAssetPrompt(''); setAssetUrl(''); setAssetDesc('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data } = await campaignsApi.upload(file);
      setAssets([...assets, {
        name: data.name,
        url: data.url,
        description: data.description || '',
      }]);
      toast.success('Tài liệu đã được tải lên');
    } catch {
      toast.error('Lỗi upload tài liệu');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const removeAsset = (idx: number) => setAssets(assets.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { name, description, assets };
      if (editing) {
        await campaignsApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await campaignsApi.create(payload);
        toast.success('Đã tạo chiến dịch');
      }
      resetForm(); load();
    } catch { toast.error('Lỗi lưu'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa?')) return;
    try { await campaignsApi.delete(id); toast.success('Đã xóa'); load(); }
    catch { toast.error('Lỗi xóa'); }
  };

  const handleEdit = (c: any) => {
    setEditing(c); setName(c.name); setDescription(c.description || '');
    setAssets(c.assets || []); setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null); setName(''); setDescription(''); setAssets([]);
    setAssetName(''); setAssetPrompt(''); setAssetUrl(''); setAssetDesc(''); setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chiến dịch</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Thêm</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editing ? 'Sửa chiến dịch' : 'Thêm chiến dịch'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Tên chiến dịch" required />
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="Mô tả chiến dịch" rows={3} />
              
                <div className="border rounded-lg p-3 space-y-2">
                  <h3 className="font-medium text-sm">Tài liệu / Assets</h3>
                  {assets.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded text-sm">
                      {a.url ? <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      <span className="flex-1 truncate">{a.name || a.prompt?.substring(0, 40) || 'Asset ' + (i+1)}</span>
                      {a.url && <a href={`${API_BASE_URL}${a.url}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline flex-shrink-0">Xem</a>}
                      <button type="button" onClick={() => removeAsset(i)} className="text-red-500 hover:text-red-700 flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  
                  {/* Upload file button */}
                  <div className="flex items-center gap-2">
                    <label className={`btn-secondary text-sm flex items-center gap-1 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? 'Đang upload...' : 'Upload file'}
                      <input type="file" accept=".pdf,.docx,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                    </label>
                    <span className="text-xs text-gray-400">PDF, DOCX, TXT, ảnh...</span>
                  </div>

                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs text-gray-400 mb-2">Hoặc thêm thủ công:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={assetName} onChange={e => setAssetName(e.target.value)} className="input-field text-sm" placeholder="Tên asset" />
                      <input value={assetUrl} onChange={e => setAssetUrl(e.target.value)} className="input-field text-sm" placeholder="URL" />
                    </div>
                    <textarea value={assetPrompt} onChange={e => setAssetPrompt(e.target.value)} className="input-field text-sm mt-2" placeholder="Prompt" rows={2} />
                    <input value={assetDesc} onChange={e => setAssetDesc(e.target.value)} className="input-field text-sm mt-2" placeholder="Mô tả" />
                    <button type="button" onClick={addAsset} className="btn-secondary text-sm mt-2">+ Thêm asset</button>
                  </div>
                </div>

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
      ) : campaigns.length === 0 ? (
        <div className="card text-center py-10 text-gray-400"><Megaphone className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Chưa có chiến dịch nào</p></div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">{c.name}</h3>
                    {c.isActive ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}
                  </div>
                  {c.description && <p className="text-sm text-gray-600 mb-3">{c.description}</p>}
                  {c.assets && c.assets.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {c.assets.map((a: Asset, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
                          <Package className="w-3 h-3" /> {a.name || a.prompt?.substring(0, 30) || 'Asset ' + (i+1)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => handleEdit(c)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
