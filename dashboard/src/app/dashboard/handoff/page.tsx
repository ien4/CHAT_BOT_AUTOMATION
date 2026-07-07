'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { handoffApi, handoffSettingsApi, staffApi } from '@/lib/api';
import {
  MessageSquare, Clock, UserCheck, Phone, RefreshCw, Ban,
  Settings, AlertTriangle, Users, Bot, X, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

// ==================== TYPES ====================

interface ActiveHandoff {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  handoffStatus: string;
  humanSessionExpiresAt: string | null;
  updatedAt: string;
  assignedStaff: { id: string; name: string } | null;
}

interface StaffMember {
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

interface StaffStatusResponse {
  staff: StaffMember[];
  todayHandoffs: number;
}

interface BotConversation {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  updatedAt: string;
  botGraceUntil: string | null;
  messages: { content: string; createdAt: string }[];
  _count: { messages: number };
}

// ==================== MAIN COMPONENT ====================

export default function HandoffPage() {
  const [activeConversations, setActiveConversations] = useState<ActiveHandoff[]>([]);
  const [staffStatus, setStaffStatus] = useState<StaffStatusResponse | null>(null);
  const [botQueue, setBotQueue] = useState<BotConversation[]>([]);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [assignModal, setAssignModal] = useState<{ convId: string; convName: string } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [formSettings, setFormSettings] = useState({
    pendingTimeoutSeconds: 30,
    sessionTimeoutSeconds: 300,
    offHoursPendingTimeout: 10,
    workHoursStart: 8,
    workHoursEnd: 22,
    botGracePeriodSeconds: 300,
  });

  const loadRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (loadRef.current) return;
    loadRef.current = true;
    try {
      const [activeRes, staffRes, botRes, settingsRes, allStaffRes] = await Promise.all([
        handoffApi.getActive(),
        handoffApi.getStaffStatus(),
        handoffApi.getBotQueue(),
        handoffSettingsApi.get(),
        staffApi.list(),
      ]);
      setActiveConversations(activeRes.data || []);
      setStaffStatus(staffRes.data);
      setBotQueue(botRes.data || []);
      setSettings(settingsRes.data);
      setAllStaff(allStaffRes.data || []);
      setFormSettings({
        pendingTimeoutSeconds: settingsRes.data.pendingTimeoutSeconds ?? 30,
        sessionTimeoutSeconds: settingsRes.data.sessionTimeoutSeconds ?? 300,
        offHoursPendingTimeout: settingsRes.data.offHoursPendingTimeout ?? 10,
        workHoursStart: settingsRes.data.workHoursStart ?? 8,
        workHoursEnd: settingsRes.data.workHoursEnd ?? 22,
        botGracePeriodSeconds: settingsRes.data.botGracePeriodSeconds ?? 300,
      });
      setLastRefresh(new Date());
    } catch {
      if (!silent) toast.error('Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
      loadRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => load(true), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  // Countdown timer
  useEffect(() => {
    if (activeConversations.length === 0) return;
    const interval = setInterval(() => {
      const next: Record<string, number> = {};
      for (const conv of activeConversations) {
        const updated = new Date(conv.updatedAt).getTime();
        const timeoutMs = conv.handoffStatus === 'pending_human'
          ? (settings?.pendingTimeoutSeconds ?? 30) * 1000
          : (settings?.sessionTimeoutSeconds ?? 300) * 1000;
        next[conv.id] = Math.max(0, Math.floor((updated + timeoutMs - Date.now()) / 1000));
      }
      setCountdowns(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeConversations, settings]);

  // ==================== ACTIONS ====================

  const handleForceEnd = async (id: string) => {
    if (!confirm('Kết thúc session human này?')) return;
    try {
      await handoffApi.forceEnd(id);
      toast.success('Đã kết thúc session');
      load();
    } catch { toast.error('Lỗi kết thúc session'); }
  };

  const handleAssign = async () => {
    if (!assignModal || !selectedStaffId) return;
    setAssigning(true);
    try {
      await handoffApi.assign(assignModal.convId, selectedStaffId);
      toast.success('Đã phân công thành công');
      setAssignModal(null);
      setSelectedStaffId('');
      load();
    } catch { toast.error('Lỗi phân công'); }
    finally { setAssigning(false); }
  };

  const handleSaveSettings = async () => {
    try {
      await handoffSettingsApi.update(formSettings);
      toast.success('Đã lưu cài đặt');
      setShowSettings(false);
      load();
    } catch { toast.error('Lỗi lưu'); }
  };

  // ==================== HELPERS ====================

  const formatCountdown = (s: number) => {
    if (s <= 0) return 'Quá hạn';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getStaffState = (s: StaffMember): { label: string; color: string; dot: string } => {
    if (!s.isOnDuty) return { label: 'Tắt trực', color: 'text-gray-500', dot: 'bg-gray-400' };
    if ((s.conversations?.length ?? 0) > 0) return { label: 'Đang hỗ trợ', color: 'text-green-600', dot: 'bg-green-500' };
    return { label: 'Sẵn sàng', color: 'text-blue-600', dot: 'bg-blue-500' };
  };

  // ==================== DERIVED STATS ====================

  const pendingCount = activeConversations.filter(c => c.handoffStatus === 'pending_human').length;
  const activeCount = activeConversations.filter(c => c.handoffStatus === 'human_active').length;
  const freeStaffCount = staffStatus?.staff.filter(s => s.isOnDuty && s.conversations.length === 0).length ?? 0;
  const todayHandoffs = staffStatus?.todayHandoffs ?? 0;

  // ==================== RENDER ====================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Handoff Monitor</h1>
          <p className="text-gray-400 text-xs mt-0.5">
            Tự động làm mới mỗi 10s · Lần cuối: {format(lastRefresh, 'HH:mm:ss')}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="btn-secondary flex items-center gap-1 text-sm">
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center gap-1 text-sm">
            <Settings className="w-4 h-4" /> Cài đặt
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Clock className="w-5 h-5 text-yellow-600" />} bg="bg-yellow-50"
          label="Đang chờ" value={pendingCount} />
        <StatCard icon={<Phone className="w-5 h-5 text-green-600" />} bg="bg-green-50"
          label="Đang hỗ trợ" value={activeCount} />
        <StatCard icon={<Users className="w-5 h-5 text-blue-600" />} bg="bg-blue-50"
          label="Staff rảnh" value={freeStaffCount} />
        <StatCard icon={<CheckCircle className="w-5 h-5 text-purple-600" />} bg="bg-purple-50"
          label="Handoff hôm nay" value={todayHandoffs} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active conversations (2/3 width) */}
        <div className="lg:col-span-2 card">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Phone className="w-4 h-4 text-green-600" />
            Hội thoại đang active
            {activeConversations.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                {activeConversations.length}
              </span>
            )}
          </h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : activeConversations.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Không có hội thoại nào đang chờ hoặc đang hỗ trợ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeConversations.map(conv => {
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
                          {conv.assignedStaff && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3 h-3" /> {conv.assignedStaff.name}
                            </span>
                          )}
                          <span>{format(new Date(conv.updatedAt), 'HH:mm:ss')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Clock className={`w-3.5 h-3.5 ${expired ? 'text-red-500' : 'text-gray-400'}`} />
                          <span className={`text-sm font-mono font-bold ${expired ? 'text-red-600' : countdown < 30 ? 'text-orange-500' : 'text-gray-600'}`}>
                            {formatCountdown(countdown)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {isPending ? 'chờ staff nhận' : 'trước khi bot tiếp quản'}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => handleForceEnd(conv.id)}
                        className="btn-danger text-xs flex items-center gap-1 shrink-0">
                        <Ban className="w-3.5 h-3.5" /> Kết thúc
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Staff Status (1/3 width) */}
        <div className="card">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Trạng thái nhân viên
          </h2>
          {!staffStatus ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            </div>
          ) : staffStatus.staff.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có nhân viên nào</p>
          ) : (
            <div className="space-y-2">
              {staffStatus.staff.map(s => {
                const state = getStaffState(s);
                return (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${state.dot}`} />
                      <span className="font-medium text-sm flex-1 truncate">{s.name}</span>
                      <span className={`text-xs ${state.color} font-medium`}>{state.label}</span>
                    </div>
                    {s.conversations.map(c => (
                      <div key={c.id} className="mt-1.5 ml-5 text-xs text-gray-500 truncate">
                        → {c.fbUserName || c.fbUserId}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bot Queue */}
      <div className="card">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
          <Bot className="w-4 h-4 text-gray-500" />
          Bot đang xử lý — Staff có thể tiếp quản
          {botQueue.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
              {botQueue.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-gray-400 mb-4">Hội thoại trong 1 giờ gần nhất — bấm "Phân công" để giao cho nhân viên</p>
        {botQueue.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
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
                  className={`flex items-center gap-3 border rounded-lg p-3 transition-colors ${inGrace ? 'border-orange-200 bg-orange-50 hover:border-orange-300' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{conv.fbUserName || conv.fbUserId}</span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(conv.updatedAt), { locale: vi, addSuffix: true })}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                        {conv._count.messages} tin
                      </span>
                      {inGrace && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Grace {formatCountdown(graceRemaining)}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        "{lastMsg.content}"
                      </p>
                    )}
                    {inGrace && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        Vừa kết thúc phiên nhân viên — bot đang xử lý tạm, chưa thông báo lại staff. Hết grace → staff nhận thông báo bình thường nếu khách nhắn tiếp.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setAssignModal({ convId: conv.id, convName: conv.fbUserName || conv.fbUserId });
                      setSelectedStaffId('');
                    }}
                    className="btn-secondary text-xs flex items-center gap-1 shrink-0"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Phân công
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <Modal title="Cài đặt Handoff" onClose={() => setShowSettings(false)}>
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

            {/* Nhóm 1: Thời gian chờ nhận */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Thời gian chờ nhận tin nhắn</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    ⏱ Trong giờ làm việc <span className="font-normal text-gray-400">(giây)</span>
                  </label>
                  <input type="number" min="5" value={formSettings.pendingTimeoutSeconds}
                    onChange={e => setFormSettings({ ...formSettings, pendingTimeoutSeconds: +e.target.value || 30 })}
                    className="input-field" />
                  <p className="text-xs text-gray-500 mt-1.5 leading-snug">
                    Khi khách nhắn tin, hệ thống gửi thông báo Telegram cho nhân viên rảnh.
                    Nếu không ai bấm nhận trong <b>{formSettings.pendingTimeoutSeconds}s</b> → bot tự trả lời.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    🌙 Ngoài giờ làm việc <span className="font-normal text-gray-400">(giây)</span>
                  </label>
                  <input type="number" min="5" value={formSettings.offHoursPendingTimeout}
                    onChange={e => setFormSettings({ ...formSettings, offHoursPendingTimeout: +e.target.value || 10 })}
                    className="input-field" />
                  <p className="text-xs text-gray-500 mt-1.5 leading-snug">
                    Ngoài giờ làm ít khả năng có nhân viên online, nên thường đặt ngắn hơn để bot trả lời nhanh.
                    Hiện tại: <b>{formSettings.workHoursStart}h–{formSettings.workHoursEnd}h</b> là trong giờ.
                  </p>
                </div>
              </div>
            </div>

            {/* Nhóm 2: Giờ làm việc */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Giờ làm việc</p>
              <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                <p className="text-xs text-gray-500 mb-2 leading-snug">
                  Trong khung giờ này dùng timeout <b>{formSettings.pendingTimeoutSeconds}s</b>. Ngoài khung giờ dùng timeout <b>{formSettings.offHoursPendingTimeout}s</b>.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Từ (giờ)</label>
                    <input type="number" min="0" max="23" value={formSettings.workHoursStart}
                      onChange={e => setFormSettings({ ...formSettings, workHoursStart: +e.target.value })}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Đến (giờ)</label>
                    <input type="number" min="0" max="23" value={formSettings.workHoursEnd}
                      onChange={e => setFormSettings({ ...formSettings, workHoursEnd: +e.target.value })}
                      className="input-field" />
                  </div>
                </div>
              </div>
            </div>

            {/* Nhóm 3: Phiên nhân viên */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Phiên nhân viên</p>
              <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  💬 Session Timeout <span className="font-normal text-gray-400">(giây)</span>
                </label>
                <input type="number" min="30" value={formSettings.sessionTimeoutSeconds}
                  onChange={e => setFormSettings({ ...formSettings, sessionTimeoutSeconds: +e.target.value || 300 })}
                  className="input-field" />
                <p className="text-xs text-gray-500 mt-1.5 leading-snug">
                  Khi nhân viên đang phụ trách, nếu <b>cả hai phía đều không nhắn</b> trong <b>{formSettings.sessionTimeoutSeconds}s</b> → phiên tự kết thúc và bot tiếp quản.
                  Timer được reset mỗi lần nhân viên hoặc khách gửi tin.
                </p>
              </div>
            </div>

            {/* Nhóm 4: Bot grace period */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sau khi nhân viên kết thúc phiên</p>
              <div className="rounded-lg border border-orange-100 p-3 bg-orange-50">
                <label className="text-xs font-semibold text-orange-700 block mb-1">
                  🤖 Bot Grace Period <span className="font-normal text-orange-500">(giây)</span>
                </label>
                <input type="number" min="0" value={formSettings.botGracePeriodSeconds}
                  onChange={e => setFormSettings({ ...formSettings, botGracePeriodSeconds: +e.target.value || 0 })}
                  className="input-field" />
                <p className="text-xs text-orange-700 mt-1.5 leading-snug">
                  Sau khi phiên nhân viên kết thúc, bot tự xử lý trong <b>{formSettings.botGracePeriodSeconds}s</b> mà <b>không thông báo lại</b> cho nhân viên.
                  Hết thời gian này, nếu khách nhắn tiếp → nhân viên sẽ nhận thông báo mới như bình thường.
                </p>
                <p className="text-xs text-orange-600 mt-1 leading-snug">
                  Ví dụ: Staff kết thúc lúc 10:00 · Grace = 300s → Khách nhắn 10:02 bot tự lo, nhắn 10:06 mới thông báo staff lại.
                </p>
              </div>
            </div>

          </div>
          <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => setShowSettings(false)} className="btn-secondary">Hủy</button>
            <button onClick={handleSaveSettings} className="btn-primary">Lưu cài đặt</button>
          </div>
        </Modal>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <Modal title={`Phân công: ${assignModal.convName}`} onClose={() => setAssignModal(null)}>
          <div className="space-y-3">
            <label className="text-sm text-gray-600">Chọn nhân viên tiếp nhận:</label>
            <div className="space-y-2">
              {allStaff.filter(s => s.isActive).map(s => {
                const state = getStaffState(s);
                return (
                  <label key={s.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${selectedStaffId === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="staff" value={s.id}
                      checked={selectedStaffId === s.id}
                      onChange={() => setSelectedStaffId(s.id)}
                      className="accent-blue-600" />
                    <div className={`w-2 h-2 rounded-full ${state.dot}`} />
                    <span className="font-medium text-sm flex-1">{s.name}</span>
                    <span className={`text-xs ${state.color}`}>{state.label}</span>
                  </label>
                );
              })}
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
    </div>
  );
}

// ==================== SUB COMPONENTS ====================

function StatCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: number }) {
  return (
    <div className="card py-3 px-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

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
