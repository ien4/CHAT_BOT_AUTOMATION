'use client';
import { useEffect, useState } from 'react';
import { appointmentsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TenantScopeBanner } from '@/components/TenantScopeBanner';
import { format } from 'date-fns';
import { CalendarCheck, CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AppointmentsPage() {
  const { selectedTenantId } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { setPage(1); }, [selectedTenantId]);
  useEffect(() => { load(); }, [page, statusFilter, selectedTenantId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await appointmentsApi.list({ page, limit: 20, status: statusFilter || undefined });
      setAppointments(data.data);
      setTotalPages(data.pagination.pages);
    } catch { toast.error('Lỗi tải lịch hẹn'); }
    finally { setLoading(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await appointmentsApi.update(id, { status });
      toast.success(status === 'confirmed' ? 'Đã xác nhận' : 'Đã hủy');
      load();
    } catch { toast.error('Lỗi cập nhật'); }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { cls: string; icon: any; label: string }> = {
      pending: { cls: 'badge-yellow', icon: Clock, label: 'Chờ xác nhận' },
      confirmed: { cls: 'badge-green', icon: CheckCircle, label: 'Đã xác nhận' },
      cancelled: { cls: 'badge-red', icon: XCircle, label: 'Đã hủy' },
    };
    const item = map[s] || { cls: 'badge-gray', icon: Clock, label: s };
    return <span className={`badge ${item.cls}`}><item.icon className="w-3 h-3 mr-1" />{item.label}</span>;
  };

  return (
    <div className="space-y-4">
      <TenantScopeBanner />
      <h1 className="text-2xl font-bold">Lịch hẹn</h1>

      <div className="flex gap-2">
        {['pending', 'confirmed', 'cancelled', ''].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === '' ? 'Tất cả' : s === 'pending' ? 'Chờ xác nhận' : s === 'confirmed' ? 'Đã xác nhận' : 'Đã hủy'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
      ) : appointments.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">
          <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Chưa có lịch hẹn nào</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {appointments.map(a => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Khách hàng</p>
                    <p className="font-medium">{a.fbUserName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">SĐT</p>
                    <p className="font-medium">{a.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Ngày</p>
                    <p className="font-medium">{a.date || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Giờ</p>
                    <p className="font-medium">{a.time || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {statusBadge(a.status)}
                  {a.status === 'pending' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateStatus(a.id, 'confirmed')}
                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                        title="Xác nhận"
                      ><CheckCircle className="w-4 h-4" /></button>
                      <button
                        onClick={() => updateStatus(a.id, 'cancelled')}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Hủy"
                      ><XCircle className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
              {a.notes && <p className="text-xs text-gray-400 mt-2">Ghi chú: {a.notes}</p>}
              <p className="text-xs text-gray-400 mt-1">Tạo: {format(new Date(a.createdAt), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          ))}
        </div>
      )}

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