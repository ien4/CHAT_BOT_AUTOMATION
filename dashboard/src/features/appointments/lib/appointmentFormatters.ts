import { format } from 'date-fns';
import { CheckCircle, Clock, XCircle } from 'lucide-react';

export const APPOINTMENT_STATUS_FILTERS: AppointmentStatusFilterOption[] = [
  { value: 'pending', label: 'Chờ xác nhận' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: '', label: 'Tất cả' },
];

export interface AppointmentStatusFilterOption {
  value: 'pending' | 'confirmed' | 'cancelled' | '';
  label: string;
}

export function getAppointmentStatusBadge(status: string) {
  const map = {
    pending: { cls: 'badge-yellow', icon: Clock, label: 'Chờ xác nhận' },
    confirmed: { cls: 'badge-green', icon: CheckCircle, label: 'Đã xác nhận' },
    cancelled: { cls: 'badge-red', icon: XCircle, label: 'Đã hủy' },
  };

  return map[status as keyof typeof map] || { cls: 'badge-gray', icon: Clock, label: status };
}

export function formatAppointmentCreatedAt(createdAt: string) {
  return format(new Date(createdAt), 'dd/MM/yyyy HH:mm');
}
