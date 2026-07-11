'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { appointmentsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Appointment, AppointmentStatusFilter } from '../types';

export function useAppointments() {
  const { selectedTenantId } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<AppointmentStatusFilter>('');

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

  const handleStatusFilterChange = (status: AppointmentStatusFilter) => {
    setStatusFilter(status);
    setPage(1);
  };

  const goPreviousPage = () => setPage(p => Math.max(1, p - 1));
  const goNextPage = () => setPage(p => Math.min(totalPages, p + 1));

  return {
    appointments,
    loading,
    page,
    totalPages,
    statusFilter,
    updateStatus,
    handleStatusFilterChange,
    goPreviousPage,
    goNextPage,
  };
}
