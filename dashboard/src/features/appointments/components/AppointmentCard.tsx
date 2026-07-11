'use client';

import { CheckCircle, XCircle } from 'lucide-react';
import type { Appointment } from '../types';
import { formatAppointmentCreatedAt } from '../lib/appointmentFormatters';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';

export function AppointmentCard({
  appointment,
  onUpdateStatus,
}: {
  appointment: Appointment;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Khách hàng</p>
            <p className="font-medium">{appointment.fbUserName || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">SĐT</p>
            <p className="font-medium">{appointment.phone || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Ngày</p>
            <p className="font-medium">{appointment.date || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Giờ</p>
            <p className="font-medium">{appointment.time || 'N/A'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <AppointmentStatusBadge status={appointment.status} />
          {appointment.status === 'pending' && (
            <div className="flex gap-1">
              <button
                onClick={() => onUpdateStatus(appointment.id, 'confirmed')}
                className="p-2 text-green-600 hover:bg-green-50 rounded"
                title="Xác nhận"
              ><CheckCircle className="w-4 h-4" /></button>
              <button
                onClick={() => onUpdateStatus(appointment.id, 'cancelled')}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
                title="Hủy"
              ><XCircle className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>
      {appointment.notes && <p className="text-xs text-gray-400 mt-2">Ghi chú: {appointment.notes}</p>}
      <p className="text-xs text-gray-400 mt-1">Tạo: {formatAppointmentCreatedAt(appointment.createdAt)}</p>
    </div>
  );
}
