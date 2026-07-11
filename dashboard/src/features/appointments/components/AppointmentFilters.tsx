'use client';

import type { AppointmentStatusFilter } from '../types';
import { APPOINTMENT_STATUS_FILTERS } from '../lib/appointmentFormatters';

export function AppointmentFilters({
  statusFilter,
  onStatusChange,
}: {
  statusFilter: AppointmentStatusFilter;
  onStatusChange: (status: AppointmentStatusFilter) => void;
}) {
  return (
    <div className="flex gap-2">
      {APPOINTMENT_STATUS_FILTERS.map(s => (
        <button
          key={s.value}
          onClick={() => onStatusChange(s.value)}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            statusFilter === s.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
