'use client';
import { useEffect, useState } from 'react';
import { knowledgeApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import { format } from 'date-fns';
import { Plus, Upload, Globe, Trash2, Edit3, BookOpen, Filter, ChevronDown, ChevronRight, Tag, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'document', label: '📄 Document' },
  { value: 'faq', label: '❓ FAQ' },
  { value: 'image_prompt', label: '🖼 Image Prompt' },
  { value: 'skill', label: '🔧 Skill' },
  { value: 'resource_link', label: '🔗 Resource Link' },
  { value: 'pricing', label: '💰 Pricing' },
  { value: 'contact', label: '📞 Contact' },
];

const KNOWLEDGE_TYPES = [
  { value: 'document', label: '📄 Document' },
  { value: 'faq', label: '❓ FAQ' },
  { value: 'image_prompt', label: '🖼 Image Prompt' },
  { value: 'skill', label: '🔧 Skill' },
  { value: 'resource_link', label: '🔗 Resource Link' },
  { value: 'pricing', label: '💰 Pricing' },
  { value: 'contact', label: '📞 Contact' },
];

const categoryBadge = (cat: string) => {
  const map: Record<string, string> = {
    company_info: 'badge-blue', service: 'badge-green', campaign: 'badge-purple', general: 'badge-gray', faq: 'badge-yellow',
  };
  return <span className={`badge ${map[cat] || 'badge-gray'}`}>{cat}</span>;
};

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    document: 'badge-blue',
    faq: 'badge-yellow',
    image_prompt: 'badge-purple',
    skill: 'badge-green',
    resource_link: 'badge-red',
    pricing: 'badge-blue',
    contact: 'badge-green',
  };
  const labels: Record<string, string> = {
    document: '📄 Document',
    faq: '❓ FAQ',
    image_prompt: '🖼 Image Prompt',
    skill: '🔧 Skill',
    resource_link: '🔗 Link',
    pricing: '💰 Pricing',
    contact: '📞 Contact',
  };
  if (!type) return null;
  return <span className={`badge ${colors[type] || 'badge-gray'}`}>{labels[type] || type}</span>;
};

export default function KnowledgePage() {
  const { selectedTenantId } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showScrape, setShowScrape] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Filter state
  const [filterType, setFilterType] = useState('');
  const [filterTags, setFilterTags] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [type, setType] = useState('document');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => { setPage(1); }, [selectedTenantId]);
  useEffect(() => { loadItems(); }, [page, filterType, filterTags, selectedTenantId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (filterType) params.type = filterType;
      if (filterTags) params.tags = filterTags;
      const { data } = await knowledgeApi.list(params);
      setItems(data.data);
      setTotalPages(data.pagination.pages);
    } catch (e) { toast.error('Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = { title, content, category, type };
      if (tags) payload.tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);

      if (editing) {
        await knowledgeApi.update(editing.id, payload);
        toast.success('Đã cập nhật');
      } else {
        await knowledgeApi.create(payload);
        toast.success('Đã thêm kiến thức mới');
      }
      resetForm();
      loadItems();
    } catch (e) { toast.error('Lỗi lưu dữ liệu'); }
    finally { setSubmitting(false); }
  };

  const handleUpload = async () => {
    if (!file) return toast.error('Chọn file');
    setSubmitting(true);
    try {
      const { data } = await knowledgeApi.upload(file, category);
      toast.success(`Đã thêm ${data.added} mục`);
      setShowUpload(false);
      setFile(null);
      loadItems();
    } catch (e) { toast.error('Upload thất bại'); }
    finally { setSubmitting(false); }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return toast.error('Nhập URL');
    setSubmitting(true);
    try {
      const { data } = await knowledgeApi.scrape(scrapeUrl, category);
      toast.success(`Scrape ${data.scraped} mục, thêm ${data.added}`);
      setShowScrape(false);
      setScrapeUrl('');
      loadItems();
    } catch (e) { toast.error('Scrape thất bại'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa mục này?')) return;
    try {
      await knowledgeApi.delete(id);
      toast.success('Đã xóa');
      loadItems();
    } catch (e) { toast.error('Xóa thất bại'); }
  };

  const handleEdit = (item: any) => {
    setEditing(item);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category);
    setType(item.type || 'document');
    setTags(item.tags?.join(', ') || '');
    setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setCategory('general');
    setType('document');
    setTags('');
    setShowForm(false);
  };

  const handleReindex = async () => {
    if (!confirm('Re-generate embeddings cho các mục chưa có vector (cần Jina AI key)?')) return;
    setReindexing(true);
    try {
      const { data } = await knowledgeApi.reindex(false);
      toast.success(`Reindex xong: ${data.embedded}/${data.total} thành công${data.failed ? `, ${data.failed} lỗi` : ''}`);
    } catch (e) { toast.error('Reindex thất bại'); }
    finally { setReindexing(false); }
  };

  return (
    <div className="space-y-4">
      <TenantScopeBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kiến thức</h1>
        <div className="flex gap-2">
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Thêm</button>
          <button onClick={() => setShowUpload(true)} className="btn-secondary flex items-center gap-1"><Upload className="w-4 h-4" /> Upload</button>
          <button onClick={() => setShowScrape(true)} className="btn-secondary flex items-center gap-1"><Globe className="w-4 h-4" /> Scrape</button>
          <button onClick={handleReindex} disabled={reindexing} className="btn-secondary flex items-center gap-1" title="Tạo lại embeddings cho RAG search">
            <RefreshCw className={`w-4 h-4 ${reindexing ? 'animate-spin' : ''}`} /> Reindex
          </button>
        </div>
      </div>

            {/* Filters */}
      <div className="card">
        <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          <Filter className="w-4 h-4" />
          Bộ lọc
          {showFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Loại</label>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} className="input-field text-sm">
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags (phân cách bằng dấu phẩy)</label>
              <input value={filterTags} onChange={e => { setFilterTags(e.target.value); setPage(1); }} className="input-field text-sm" placeholder="Ví dụ: bbot, chatbot" />
            </div>
            <div className="flex items-end">
              <button onClick={() => { setFilterType(''); setFilterTags(''); setPage(1); }} className="btn-secondary text-sm">Xóa bộ lọc</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editing ? 'Sửa kiến thức' : 'Thêm kiến thức'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="Tiêu đề" required />
              <textarea value={content} onChange={e => setContent(e.target.value)} className="input-field min-h-[150px]" placeholder="Nội dung" required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Danh mục</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="input-field">
                    <option value="general">Chung</option>
                    <option value="company_info">Thông tin công ty</option>
                    <option value="service">Dịch vụ</option>
                    <option value="campaign">Chiến dịch</option>
                    <option value="faq">FAQ</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Loại</label>
                  <select value={type} onChange={e => setType(e.target.value)} className="input-field">
                    {KNOWLEDGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Tags (phân cách dấu phẩy)</label>
                <input value={tags} onChange={e => setTags(e.target.value)} className="input-field" placeholder="Ví dụ: chatbot, marketing, bbot" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="btn-secondary">Hủy</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Upload file</h2>
            <input type="file" accept=".json,.txt,.md,.pdf,.docx" onChange={e => setFile(e.target.files?.[0] || null)} className="input-field" />
            <select value={category} onChange={e => setCategory(e.target.value)} className="input-field">
              <option value="general">Chung</option><option value="company_info">Thông tin công ty</option><option value="service">Dịch vụ</option><option value="campaign">Chiến dịch</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUpload(false)} className="btn-secondary">Hủy</button>
              <button onClick={handleUpload} disabled={submitting} className="btn-primary">{submitting ? 'Đang xử lý...' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Modal */}
      {showScrape && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Scrape website</h2>
            <input value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} className="input-field" placeholder="https://example.com" />
            <select value={category} onChange={e => setCategory(e.target.value)} className="input-field">
              <option value="general">Chung</option><option value="company_info">Thông tin công ty</option><option value="service">Dịch vụ</option>
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowScrape(false)} className="btn-secondary">Hủy</button>
              <button onClick={handleScrape} disabled={submitting} className="btn-primary">{submitting ? 'Đang scrape...' : 'Scrape'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Knowledge list */}
      <div className="grid gap-4">
        {loading ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
        ) : items.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Chưa có kiến thức nào. Thêm ngay!</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold">{item.title}</h3>
                    {categoryBadge(item.category)}
                    {typeBadge(item.type)}
                    <span className="text-xs text-gray-400">{item.sourceType}</span>
                    {item.parentId && <span className="text-xs text-purple-500">🔗 Cấp con</span>}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{item.content}</p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map((tag: string) => (
                        <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          <Tag className="w-3 h-3" />{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                      🔗 {item.sourceUrl}
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-2">{format(new Date(item.updatedAt), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => handleEdit(item)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary">Trước</button>
          <span className="text-sm py-1">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="btn-secondary">Sau</button>
        </div>
      )}
    </div>
  );
}