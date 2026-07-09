'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { tenantsApi } from '@/lib/api';
import {
  Plus, Trash2, Edit3, Building2, Users, Link2, Check,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, HelpCircle, X,
  Phone, MessageSquare, Clock, UserCheck, Ban, Bot, AlertTriangle, RefreshCw,
  BarChart3, TrendingUp, TrendingDown, Zap, Activity
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ===================== TYPES =====================

interface Tenant {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  telegramGroupChatId: string | null;
  pendingTimeoutSeconds: number;
  sessionTimeoutSeconds: number;
  defaultPersona: string | null;
  createdAt: string;
}

interface TenantStaff {
  id: string;
  name: string;
  telegramId: string;
  telegramChatId: string;
  isOnDuty: boolean;
  isActive: boolean;
}

// ===================== MAIN PAGE =====================

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState<'staff' | 'webhook'>('webhook');
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  useEffect(() => { loadTenants(); }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const { data } = await tenantsApi.list();
      setTenants(data);
    } catch { toast.error('Lỗi tải danh sách tenant'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`Xóa tenant "${tenant.name}"? Tất cả staff và cấu hình sẽ bị xóa.`)) return;
    try {
      await tenantsApi.delete(tenant.id);
      toast.success('Đã xóa tenant');
      if (selectedTenant?.id === tenant.id) setSelectedTenant(null);
      loadTenants();
    } catch { toast.error('Lỗi xóa tenant'); }
  };

  const openManage = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setActiveTab('webhook');
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setShowForm(true);
  };

  const handleSaved = async (savedSlug?: string) => {
    setShowForm(false);
    const { data: freshList } = await tenantsApi.list().catch(() => ({ data: [] }));
    setTenants(freshList);
    // Tự mở manage panel cho tenant vừa tạo/sửa
    if (savedSlug) {
      const saved = freshList.find((t: Tenant) => t.slug === savedSlug);
      if (saved) openManage(saved);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-gray-500 text-sm mt-1">Quản lý các đối tác sử dụng chatbot platform</p>
        </div>
        <button onClick={() => { setEditingTenant(null); setShowForm(true); }} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm tenant
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
        <h3 className="font-medium text-blue-800 flex items-center gap-1"><HelpCircle className="w-4 h-4" /> Multi-tenant là gì?</h3>
        <p className="mt-1 text-blue-700">
          Mỗi tenant là một đối tác có cấu hình chatbot riêng. Bot xử lý tin nhắn, knowledge base và handoff staff riêng theo phạm vi tenant.
        </p>
      </div>

      {/* Tenant list */}
      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
      ) : tenants.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Chưa có tenant nào. Thêm đối tác đầu tiên!</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {tenants.map(t => (
            <TenantCard
              key={t.id}
              tenant={t}
              isSelected={selectedTenant?.id === t.id}
              onManage={() => openManage(t)}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedTenant && (
        <TenantDetail
          tenant={selectedTenant}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={() => setSelectedTenant(null)}
          onRefresh={() => { loadTenants(); }}
        />
      )}

      {/* Create/Edit modal */}
      {showForm && (
        <TenantForm
          tenant={editingTenant}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ===================== TENANT CARD =====================

function TenantCard({ tenant, isSelected, onManage, onEdit, onDelete }: {
  tenant: Tenant;
  isSelected: boolean;
  onManage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`card transition-all ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${tenant.isActive ? 'bg-blue-600' : 'bg-gray-400'}`}>
            {tenant.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{tenant.name}</h3>
              <span className="text-xs text-gray-400 font-mono">/{tenant.slug}</span>
              {!tenant.isActive && <span className="badge badge-red">Vô hiệu</span>}
            </div>
            <p className="text-xs text-gray-500 mt-1">Cấu hình riêng cho tin nhắn, knowledge và handoff</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onManage} className="px-3 py-1.5 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium">
            Quản lý
          </button>
          <button onClick={onEdit} className="p-2 text-gray-400 hover:text-blue-600">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== DETAIL PANEL =====================

function TenantDetail({ tenant, activeTab, onTabChange, onClose, onRefresh }: {
  tenant: Tenant;
  activeTab: string;
  onTabChange: (tab: any) => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const tabs = [
    { key: 'webhook', label: 'Webhook', icon: Link2 },
    { key: 'staff', label: 'Nhân viên', icon: Users },
    { key: 'handoff', label: 'Handoff', icon: MessageSquare },
  ];

  return (
    <div className="card border-blue-200 bg-blue-50/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">{tenant.name}</h2>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'webhook' && <WebhookTab tenant={tenant} />}
      {activeTab === 'staff' && <StaffTab tenant={tenant} />}
      {activeTab === 'handoff' && <TenantHandoffTab tenant={tenant} />}
    </div>
  );
}

// ===================== WEBHOOK TAB =====================

function WebhookTab({ tenant }: { tenant: Tenant }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <p className="font-medium">Kết nối tin nhắn trực tiếp</p>
        <p className="mt-1">
          Tenant <strong>{tenant.name}</strong> dùng webhook Facebook chung của backend. Cấu hình URL chung trong mục Cài đặt, sau đó backend phân tuyến theo tenant và page.
        </p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
        <strong>Lưu ý:</strong> Endpoint webhook riêng theo tenant của kiến trúc cũ đã tắt; không cần tạo URL riêng khi thêm tenant.
      </div>
    </div>
  );
}

// ===================== STAFF TAB =====================

function StaffTab({ tenant }: { tenant: Tenant }) {
  const [staff, setStaff] = useState<TenantStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await tenantsApi.listStaff(tenant.id);
      setStaff(data);
    } catch { toast.error('Lỗi tải staff'); }
    finally { setLoading(false); }
  }, [tenant.id]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await tenantsApi.createStaff(tenant.id, { name, telegramChatId, telegramId: telegramChatId });
      toast.success('Đã thêm staff');
      setName(''); setTelegramChatId(''); setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Lỗi thêm staff'); }
    finally { setSubmitting(false); }
  };

  const toggleDuty = async (s: TenantStaff) => {
    try {
      await tenantsApi.updateStaff(tenant.id, s.id, { isOnDuty: !s.isOnDuty });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const handleDelete = async (s: TenantStaff) => {
    if (!confirm(`Xóa ${s.name}?`)) return;
    try {
      await tenantsApi.deleteStaff(tenant.id, s.id);
      toast.success('Đã xóa');
      load();
    } catch { toast.error('Lỗi xóa'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Nhân viên nhận handoff qua Telegram cho tenant <strong>{tenant.name}</strong></p>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1 py-1.5">
          <Plus className="w-3.5 h-3.5" /> Thêm staff
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Thêm nhân viên tenant</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Tên</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Nguyễn Văn A" required />
            </div>
            <div>
              <label className="text-xs text-gray-500">Telegram Chat ID</label>
              <input value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} className="input-field" placeholder="123456789" required />
              <p className="text-xs text-gray-400 mt-0.5">Gõ /myid trong Telegram bot</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Hủy</button>
            <button type="submit" disabled={submitting} className="btn-primary text-sm">{submitting ? 'Đang lưu...' : 'Thêm'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">Chưa có staff nào cho tenant này</div>
      ) : (
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  {s.isOnDuty
                    ? <span className="badge badge-green">🟢 Đang trực</span>
                    : <span className="badge badge-gray">⚪ Ngoài trực</span>}
                </div>
                <span className="text-xs text-gray-400">Chat ID: {s.telegramChatId}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleDuty(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${s.isOnDuty ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s.isOnDuty ? <ToggleRight className="w-3.5 h-3.5 inline mr-0.5" /> : <ToggleLeft className="w-3.5 h-3.5 inline mr-0.5" />}
                  {s.isOnDuty ? 'Bật trực' : 'Tắt trực'}
                </button>
                <button onClick={() => handleDelete(s)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== TENANT HANDOFF TAB =====================

interface TenantHandoffActive {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  handoffStatus: string;
  humanSessionExpiresAt: string | null;
  updatedAt: string;
  assignedTenantStaff: { id: string; name: string } | null;
}

interface TenantHandoffStaffItem {
  id: string;
  name: string;
  telegramChatId: string;
  isOnDuty: boolean;
  isActive: boolean;
  conversations: {
    id: string;
    fbUserName: string | null;
    fbUserId: string;
    updatedAt: string;
    humanSessionExpiresAt: string | null;
  }[];
}

interface TenantHandoffBotConv {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  updatedAt: string;
  botGraceUntil: string | null;
  messages: { content: string; createdAt: string }[];
  _count: { messages: number };
}

function TenantHandoffTab({ tenant }: { tenant: Tenant }) {
  const [activeConvs, setActiveConvs] = useState<TenantHandoffActive[]>([]);
  const [staffStatus, setStaffStatus] = useState<{ staff: TenantHandoffStaffItem[]; todayHandoffs: number } | null>(null);
  const [botQueue, setBotQueue] = useState<TenantHandoffBotConv[]>([]);
  const [allStaff, setAllStaff] = useState<TenantStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Assign modal
  const [assignModal, setAssignModal] = useState<{ convId: string; convName: string } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const loadRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (loadRef.current) return;
    loadRef.current = true;
    try {
      const [activeRes, staffRes, botRes, staffListRes] = await Promise.all([
        tenantsApi.handoffActive(tenant.id),
        tenantsApi.handoffStaffStatus(tenant.id),
        tenantsApi.handoffBotQueue(tenant.id),
        tenantsApi.listStaff(tenant.id),
      ]);
      setActiveConvs(activeRes.data || []);
      setStaffStatus(staffRes.data);
      setBotQueue(botRes.data || []);
      setAllStaff(staffListRes.data || []);
      setLastRefresh(new Date());
    } catch {
      if (!silent) toast.error('Lỗi tải dữ liệu handoff');
    } finally {
      setLoading(false);
      loadRef.current = false;
    }
  }, [tenant.id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh 10s
  useEffect(() => {
    const interval = setInterval(() => load(true), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  // Countdown
  useEffect(() => {
    if (activeConvs.length === 0) return;
    const interval = setInterval(() => {
      const next: Record<string, number> = {};
      for (const conv of activeConvs) {
        const updated = new Date(conv.updatedAt).getTime();
        const timeoutMs = conv.handoffStatus === 'pending_human'
          ? (tenant.pendingTimeoutSeconds ?? 30) * 1000
          : (tenant.sessionTimeoutSeconds ?? 30) * 1000;
        next[conv.id] = Math.max(0, Math.floor((updated + timeoutMs - Date.now()) / 1000));
      }
      setCountdowns(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeConvs, tenant.pendingTimeoutSeconds, tenant.sessionTimeoutSeconds]);

  // Actions
  const handleForceEnd = async (id: string) => {
    if (!confirm('Kết thúc session human này?')) return;
    try {
      await tenantsApi.handoffForceEnd(tenant.id, id);
      toast.success('Đã kết thúc session');
      load();
    } catch { toast.error('Lỗi kết thúc session'); }
  };

  const handleAssign = async () => {
    if (!assignModal || !selectedStaffId) return;
    setAssigning(true);
    try {
      await tenantsApi.handoffAssign(tenant.id, assignModal.convId, selectedStaffId);
      toast.success('Đã phân công thành công');
      setAssignModal(null);
      setSelectedStaffId('');
      load();
    } catch { toast.error('Lỗi phân công'); }
    finally { setAssigning(false); }
  };

  const formatCountdown = (s: number) => {
    if (s <= 0) return 'Quá hạn';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getStaffState = (s: TenantHandoffStaffItem): { label: string; color: string; dot: string } => {
    if (!s.isOnDuty) return { label: 'Tắt trực', color: 'text-gray-500', dot: 'bg-gray-400' };
    if ((s.conversations?.length ?? 0) > 0) return { label: 'Đang hỗ trợ', color: 'text-green-600', dot: 'bg-green-500' };
    return { label: 'Sẵn sàng', color: 'text-blue-600', dot: 'bg-blue-500' };
  };

  const pendingCount = activeConvs.filter(c => c.handoffStatus === 'pending_human').length;
  const humanActiveCount = activeConvs.filter(c => c.handoffStatus === 'human_active').length;
  const freeStaffCount = staffStatus?.staff.filter(s => s.isOnDuty && s.conversations.length === 0).length ?? 0;
  const todayHandoffs = staffStatus?.todayHandoffs ?? 0;

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mini header + Analytics toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            Tự động làm mới mỗi 10s · Lần cuối: {format(lastRefresh, 'HH:mm:ss')}
          </p>
          </div>
        <button onClick={() => load()} className="btn-secondary text-xs flex items-center gap-1 py-1">
          <RefreshCw className="w-3.5 h-3.5" /> Làm mới
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-yellow-50"><Clock className="w-4 h-4 text-yellow-600" /></div>
            <div><p className="text-xs text-gray-500">Đang chờ</p><p className="text-lg font-bold">{pendingCount}</p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-green-50"><Phone className="w-4 h-4 text-green-600" /></div>
            <div><p className="text-xs text-gray-500">Đang hỗ trợ</p><p className="text-lg font-bold">{humanActiveCount}</p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50"><Users className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xs text-gray-500">Staff rảnh</p><p className="text-lg font-bold">{freeStaffCount}</p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-purple-50"><Check className="w-4 h-4 text-purple-600" /></div>
            <div><p className="text-xs text-gray-500">Handoff hôm nay</p><p className="text-lg font-bold">{todayHandoffs}</p></div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Conversations */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-600" />
            Hội thoại đang active
            {activeConvs.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{activeConvs.length}</span>
            )}
          </h3>
          {activeConvs.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-1 opacity-40" />
              <p className="text-sm">Không có hội thoại nào đang chờ hoặc đang hỗ trợ</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeConvs.map(conv => {
                const isPending = conv.handoffStatus === 'pending_human';
                const countdown = countdowns[conv.id] ?? 0;
                const expired = countdown <= 0;
                return (
                  <div key={conv.id}
                    className={`border rounded-lg p-3 ${expired ? 'border-red-300 bg-red-50' : isPending ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">{conv.fbUserName || conv.fbUserId}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPending ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                            {isPending ? '🟡 Chờ nhân viên' : '🟢 Đang hỗ trợ'}
                          </span>
                          {expired && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Quá hạn
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          {conv.assignedTenantStaff && (
                            <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> {conv.assignedTenantStaff.name}</span>
                          )}
                          <span>{format(new Date(conv.updatedAt), 'HH:mm:ss')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Clock className={`w-3.5 h-3.5 ${expired ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className={`text-sm font-mono font-bold ${expired ? 'text-red-600' : countdown < 30 ? 'text-orange-500' : 'text-gray-600'}`}>
                            {formatCountdown(countdown)}
                          </span>
                          <span className="text-xs text-gray-400">{isPending ? 'chờ staff nhận' : 'trước khi bot tiếp quản'}</span>
                        </div>
                      </div>
                      <button onClick={() => handleForceEnd(conv.id)}
                        className="btn-danger text-xs flex items-center gap-1 shrink-0 py-1">
                        <Ban className="w-3.5 h-3.5" /> Kết thúc
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Staff Status */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Trạng thái nhân viên
          </h3>
          {!staffStatus || staffStatus.staff.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có nhân viên nào hoặc chưa bật trực</p>
          ) : (
            <div className="space-y-2">
              {staffStatus.staff.map(s => {
                const state = getStaffState(s);
                return (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${state.dot}`} />
                      <span className="font-medium text-sm flex-1 truncate">{s.name}</span>
                      <span className={`text-xs ${state.color} font-medium`}>{state.label}</span>
                    </div>
                    {s.conversations.map(c => (
                      <div key={c.id} className="mt-1 ml-5 text-xs text-gray-500 truncate">→ {c.fbUserName || c.fbUserId}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bot Queue */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Bot className="w-4 h-4 text-gray-500" />
          Bot đang xử lý — Staff có thể tiếp quản
          {botQueue.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{botQueue.length}</span>
          )}
        </h3>
        <p className="text-xs text-gray-400 mb-3">Hội thoại trong 1 giờ gần nhất — bấm "Phân công" để giao cho nhân viên</p>
        {botQueue.length === 0 ? (
          <div className="text-center py-4 text-gray-400">
            <Bot className="w-6 h-6 mx-auto mb-1 opacity-40" />
            <p className="text-sm">Không có hội thoại nào đang bot xử lý gần đây</p>
          </div>
        ) : (
          <div className="space-y-2">
            {botQueue.map(conv => {
              const lastMsg = conv.messages[0];
              const graceRemaining = conv.botGraceUntil
                ? Math.max(0, Math.floor((new Date(conv.botGraceUntil).getTime() - Date.now()) / 1000))
                : 0;
              const inGrace = graceRemaining > 0;
              return (
                <div key={conv.id}
                  className={`flex items-center gap-3 border rounded-lg p-3 transition-colors ${inGrace ? 'border-orange-200 bg-orange-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{conv.fbUserName || conv.fbUserId}</span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(conv.updatedAt), { locale: vi, addSuffix: true })}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{conv._count.messages} tin</span>
                      {inGrace && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Grace {formatCountdown(graceRemaining)}
                        </span>
                      )}
                    </div>
                    {lastMsg && <p className="text-xs text-gray-500 truncate mt-0.5">"{lastMsg.content}"</p>}
                    {inGrace && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        Vừa kết thúc phiên nhân viên — bot đang xử lý tạm. Hết grace → staff nhận thông báo bình thường nếu khách nhắn tiếp.
                      </p>
                    )}
                  </div>
                  <button onClick={() => {
                    setAssignModal({ convId: conv.id, convName: conv.fbUserName || conv.fbUserId });
                    setSelectedStaffId('');
                  }} className="btn-secondary text-xs flex items-center gap-1 shrink-0 py-1">
                    <UserCheck className="w-3.5 h-3.5" /> Phân công
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <Modal title={`Phân công: ${assignModal.convName}`} onClose={() => setAssignModal(null)}>
          <div className="space-y-3">
            <label className="text-sm text-gray-600">Chọn nhân viên tiếp nhận:</label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {allStaff.filter(s => s.isActive).map(s => (
                <label key={s.id}
                  className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${selectedStaffId === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="staff" value={s.id}
                    checked={selectedStaffId === s.id}
                    onChange={() => setSelectedStaffId(s.id)}
                    className="accent-blue-600" />
                  <div className={`w-2 h-2 rounded-full ${s.isOnDuty ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  <span className="font-medium text-sm flex-1">{s.name}</span>
                  <span className={`text-xs ${s.isOnDuty ? 'text-blue-600' : 'text-gray-400'}`}>
                    {s.isOnDuty ? 'Đang trực' : 'Ngoài trực'}
                  </span>
                </label>
              ))}
              {allStaff.filter(s => s.isActive).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">Chưa có nhân viên nào cho tenant này</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setAssignModal(null)} className="btn-secondary">Hủy</button>
            <button onClick={handleAssign} disabled={!selectedStaffId || assigning}
              className="btn-primary disabled:opacity-50">
              {assigning ? 'Đang phân công...' : 'Xác nhận phân công'}
            </button>
          </div>
        </Modal>
      )}

      {/* Analytics section */}
      <button onClick={() => setShowAnalytics(!showAnalytics)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 mt-2">
        <BarChart3 className="w-4 h-4" />
        Thống kê handoff
        {showAnalytics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {showAnalytics && <TenantHandoffAnalytics tenant={tenant} />}
    </div>
  );
}

// ===================== TENANT HANDOFF ANALYTICS =====================

interface HandoffAnalyticsData {
  total: number;
  period: string;
  since: string;
  byType: Record<string, number>;
  dailyStats: { day: string; eventType: string; count: number }[];
  waitTime: { avgMs: number; count: number };
  staffPerformance: { staffId: string; name: string; claimed: number; ended: number; timeout: number; avgResponseMs: number }[];
  recentEvents: {
    id: string; eventType: string; staffName: string | null;
    customerName: string | null; customerId: string;
    durationMs: number | null; createdAt: string;
  }[];
}

function TenantHandoffAnalytics({ tenant }: { tenant: Tenant }) {
  const [data, setData] = useState<HandoffAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    setLoading(true);
    tenantsApi.handoffAnalytics(tenant.id, period)
      .then(r => setData(r.data))
      .catch(() => toast.error('Lỗi tải thống kê handoff'))
      .finally(() => setLoading(false));
  }, [tenant.id, period]);

  if (loading) {
    return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>;
  }

  if (!data || data.total === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Chưa có dữ liệu thống kê handoff trong kỳ này</p>
        <p className="text-xs mt-1">Dữ liệu sẽ được ghi nhận khi có handoff xảy ra</p>
      </div>
    );
  }

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m${sec}s`;
  };

  // Aggregate daily stats into a chart-friendly format
  const days = Array.from(new Set(data.dailyStats.map(d => d.day))).slice(-14);
  const totalByDay: Record<string, number> = {};
  const timeoutByDay: Record<string, number> = {};
  for (const d of data.dailyStats) {
    totalByDay[d.day] = (totalByDay[d.day] || 0) + d.count;
    if (d.eventType === 'timeout' || d.eventType === 'pending_timeout') {
      timeoutByDay[d.day] = (timeoutByDay[d.day] || 0) + d.count;
    }
  }

  const maxDayCount = Math.max(...days.map(d => totalByDay[d] || 0), 1);

  const types = data.byType;
  const initiated = types.initiated || 0;
  const claimed = types.claimed || 0;
  const takeover = types.takeover || 0;
  const timeouts = (types.timeout || 0) + (types.pending_timeout || 0);
  const staffEnded = types.staff_ended || 0;
  const totalClaimed = claimed + takeover;
  const successRate = initiated > 0 ? Math.round((totalClaimed / initiated) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Từ {new Date(data.since).toLocaleDateString('vi-VN')}</p>
        <div className="flex gap-1">
          {[['24h', '24h'], ['7d', '7 ngày'], ['30d', '30 ngày']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium ${period === val ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <div><p className="text-xs text-gray-500">Tổng handoff</p><p className="text-lg font-bold">{data.total}</p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-green-600" />
            <div><p className="text-xs text-gray-500">Đã tiếp nhận</p><p className="text-lg font-bold">{totalClaimed}<span className="text-xs text-gray-400 font-normal"> / {initiated}</span></p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <div><p className="text-xs text-gray-500">Timeout</p><p className="text-lg font-bold">{timeouts}<span className="text-xs text-gray-400 font-normal"> ({initiated > 0 ? Math.round(timeouts / initiated * 100) : 0}%)</span></p></div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <div><p className="text-xs text-gray-500">Tỉ lệ tiếp nhận</p><p className="text-lg font-bold">{successRate}%</p></div>
          </div>
        </div>
      </div>

      {/* Avg wait time + staff ended */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            <div><p className="text-xs text-gray-500">TG chờ TB (claim)</p>
              <p className="font-semibold">{data.waitTime.count > 0 ? formatMs(data.waitTime.avgMs) : 'N/A'}</p>
              <p className="text-xs text-gray-400">({data.waitTime.count} lần)</p>
            </div>
          </div>
        </div>
        <div className="card py-2 px-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-gray-500" />
            <div><p className="text-xs text-gray-500">Staff kết thúc</p>
              <p className="font-semibold">{staffEnded}<span className="text-xs text-gray-400 font-normal ml-1">phiên</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" /> Handoff theo ngày
        </h3>
        {days.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-3">Chưa có dữ liệu</p>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {days.map(day => {
              const total = totalByDay[day] || 0;
              const timeout = timeoutByDay[day] || 0;
              const height = Math.max(4, Math.round((total / maxDayCount) * 100));
              const shortDay = day.slice(5); // MM-DD
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: `${height}%` }}>
                    <div className="w-full bg-blue-500 rounded-t"
                      title={`Tổng: ${total}`} style={{ height: `${(total - timeout) / maxDayCount * 100}%` }} />
                    {timeout > 0 && (
                      <div className="w-full bg-red-400 rounded-t"
                        title={`Timeout: ${timeout}`} style={{ height: `${timeout / maxDayCount * 100}%` }} />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400">{shortDay}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Staff performance */}
      {data.staffPerformance.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Hiệu suất nhân viên</h3>
          <div className="space-y-2">
            {data.staffPerformance.map(s => (
              <div key={s.staffId} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span>Nhận: {s.claimed}</span>
                    <span>Kết thúc: {s.ended}</span>
                    <span>Timeout: {s.timeout}</span>
                    {s.avgResponseMs > 0 && <span>TG trung bình: {formatMs(s.avgResponseMs)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent events */}
      {data.recentEvents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Sự kiện gần đây</h3>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {data.recentEvents.map(e => {
              const eventLabels: Record<string, string> = {
                initiated: '🔔 Yêu cầu handoff', claimed: '✋ Staff tiếp nhận',
                takeover: '🔄 Staff tiếp quản', timeout: '⏰ Timeout phiên',
                pending_timeout: '⏰ Hết giờ chờ', staff_ended: '🔚 Staff kết thúc',
                admin_forced: '🔚 Admin kết thúc',
              };
              return (
                <div key={e.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <span>{eventLabels[e.eventType] || e.eventType}</span>
                  {e.staffName && <span className="text-gray-500">· {e.staffName}</span>}
                  {e.customerName && <span className="text-gray-500">· {e.customerName}</span>}
                  {e.durationMs && <span className="text-gray-400">· {formatMs(e.durationMs)}</span>}
                  <span className="text-gray-300 ml-auto">
                    {format(new Date(e.createdAt), 'dd/MM HH:mm')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== TENANT FORM =====================

function TenantForm({ tenant, onClose, onSaved }: {
  tenant: Tenant | null;
  onClose: () => void;
  onSaved: (slug?: string) => void;
}) {
  const [form, setForm] = useState({
    name: tenant?.name || '',
    slug: tenant?.slug || '',
    telegramGroupChatId: tenant?.telegramGroupChatId || '',
    pendingTimeoutSeconds: tenant?.pendingTimeoutSeconds ?? 300,
    sessionTimeoutSeconds: tenant?.sessionTimeoutSeconds ?? 1800,
    defaultPersona: tenant?.defaultPersona || '',
    isActive: tenant?.isActive ?? true,
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name,
        telegramGroupChatId: form.telegramGroupChatId || null,
        pendingTimeoutSeconds: Number(form.pendingTimeoutSeconds),
        sessionTimeoutSeconds: Number(form.sessionTimeoutSeconds),
        defaultPersona: form.defaultPersona || null,
        isActive: form.isActive,
      };
      if (!tenant) payload.slug = form.slug;

      if (tenant) {
        await tenantsApi.update(tenant.id, payload);
        toast.success('Đã cập nhật tenant');
        onSaved(tenant.slug);
      } else {
        await tenantsApi.create(payload);
        toast.success('Đã tạo tenant');
        onSaved(form.slug);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi lưu tenant');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{tenant ? 'Sửa tenant' : 'Tạo tenant mới'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Tên & Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Tên đối tác *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" placeholder="Công ty ABC" required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Slug * {tenant && <span className="text-gray-400">(không sửa được)</span>}</label>
              <input
                value={form.slug}
                onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="input-field font-mono"
                placeholder="cong-ty-abc"
                required
                disabled={!!tenant}
              />
            </div>
          </div>

          {/* Telegram */}
          <div>
            <label className="text-xs font-medium text-gray-500">Telegram Group Chat ID (tùy chọn)</label>
            <input value={form.telegramGroupChatId} onChange={e => set('telegramGroupChatId', e.target.value)} className="input-field" placeholder="-100xxxxxxxxxx" />
            <p className="text-xs text-gray-400 mt-0.5">Group nhận thông báo handoff cho tenant này</p>
          </div>

          {/* Timeout */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Pending timeout (giây)</label>
              <input value={form.pendingTimeoutSeconds} onChange={e => set('pendingTimeoutSeconds', e.target.value)} className="input-field" type="number" min="30" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Session timeout (giây)</label>
              <input value={form.sessionTimeoutSeconds} onChange={e => set('sessionTimeoutSeconds', e.target.value)} className="input-field" type="number" min="60" />
            </div>
          </div>

          {/* Status */}
          {tenant && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="w-4 h-4" />
              <label htmlFor="isActive" className="text-sm">Kích hoạt tenant</label>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Đang lưu...' : tenant ? 'Cập nhật' : 'Tạo tenant'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ===================== MODAL (shared) =====================

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
