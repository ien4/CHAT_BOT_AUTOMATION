import { CalendarCheck } from 'lucide-react';

export function AppointmentEmptyState() {
  return (
    <div className="card text-center py-10 text-gray-400">
      <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Chưa có lịch hẹn nào</p>
    </div>
  );
}
