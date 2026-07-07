'use client';
import { useEffect, useState } from 'react';
import { staffApi } from '@/lib/api';
import { Plus, Trash2, Edit3, Users, ToggleLeft, ToggleRight, Phone, MessageCircle, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Staff {
  id: string;
  name: string;
  telegramId: string;
  telegramChatId: string;
  isActive: boolean;
  isOnDuty: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [name, setName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await staffApi.list();
      setStaff(data);
    } catch (e) { toast.error('Lỗi tải nhân viên'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await staffApi.update(editing.id, { name, telegramChatId });
        toast.success('Đã cập nhật');
      } else {
        await staffApi.create({ name, telegramChatId });
        toast.success('Đã thêm nhân viên');
      }
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Lỗi lưu');
    }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa nhân viên này?')) return;
    try {
      await staffApi.delete(id);
      toast.success('Đã xóa');
      load();
    } catch { toast.error('Lỗi xóa'); }
  };

  const toggleOnDuty = async (member: Staff) => {
    try {
      await staffApi.update(member.id, { isOnDuty: !member.isOnDuty });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const toggleActive = async (member: Staff) => {
    try {
      await staffApi.update(member.id, { isActive: !member.isActive });
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const handleEdit = (member: Staff) => {
    setEditing(member);
    setName(member.name);
    setTelegramChatId(member.telegramChatId);
    setShowForm(true);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setTelegramChatId('');
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nhân viên</h1>
          <p className="text-gray-500 text-sm mt-1">Quản lý nhân viên trực handoff qua Telegram</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> Thêm nhân viên
        </button>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
        <h3 className="font-medium text-blue-800 flex items-center gap-1"><HelpCircle className="w-4 h-4" /> Hướng dẫn thêm nhân viên</h3>
        <ol className="mt-2 space-y-1 text-blue-700 list-decimal list-inside">
          <li>Nhân viên chat với bot Telegram (qua @BotFather đã tạo)</li>
          <li>Gõ lệnh <code className="bg-blue-100 px-1 rounded">/myid</code> để lấy Chat ID</li>
          <li>Sao chép Chat ID và nhập vào form dưới đây cùng với tên nhân viên</li>
          <li>Nhân viên có thể dùng lệnh <code className="bg-blue-100 px-1 rounded">/duty</code> để bật/tắt trực ban ngay trong Telegram</li>
        </ol>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">{editing ? 'Sửa nhân viên' : 'Thêm nhân viên'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Tên nhân viên</label>
                <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="VD: Nguyễn Văn A" required />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Telegram Chat ID</label>
                <input value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} className="input-field" placeholder="VD: 123456789" required />
                <p className="text-xs text-gray-400 mt-1">Nhân viên chat với bot → gõ /myid để lấy Chat ID</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="btn-secondary">Hủy</button>
                <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
      ) : staff.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Chưa có nhân viên nào. Thêm người đầu tiên!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {staff.map(member => (
            <div key={member.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${member.isActive ? 'bg-blue-500' : 'bg-gray-400'}`}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{member.name}</h3>
                      {member.isOnDuty ? (
                        <span className="badge badge-green">🟢 Đang trực</span>
                      ) : (
                        <span className="badge badge-gray">⚪ Ngoài trực</span>
                      )}
                      {!member.isActive && <span className="badge badge-red">Vô hiệu</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Chat ID: {member.telegramChatId}</span>
                      {member.createdAt && <span>Tham gia: {new Date(member.createdAt).toLocaleDateString('vi-VN')}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleOnDuty(member)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      member.isOnDuty
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {member.isOnDuty ? <ToggleRight className="w-4 h-4 inline mr-1" /> : <ToggleLeft className="w-4 h-4 inline mr-1" />}
                    {member.isOnDuty ? 'Bật trực' : 'Tắt trực'}
                  </button>
                  <button
                    onClick={() => toggleActive(member)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      member.isActive
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {member.isActive ? 'Kích hoạt' : 'Vô hiệu'}
                  </button>
                  <button onClick={() => handleEdit(member)} className="p-2 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(member.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
